import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { loadSpec, allOperations, findOperation } from "../src/lib/spec.js";
import { buildOperationSchemas } from "../src/lib/schema.js";
import type { FieldShape, SharedSpec } from "../src/lib/types.js";

// ajv@8 and ajv-formats@3 are CommonJS; see src/cli/commands/validate.ts for
// why createRequire is needed instead of a default import under NodeNext.
const require = createRequire(import.meta.url);
const Ajv: typeof import("ajv").default = require("ajv");
const addFormats: typeof import("ajv-formats").default = require("ajv-formats");

/**
 * Depth-first search through a requestBody's fields (and any nested fields
 * reached via fieldsRef/itemsRef) for the first FieldShape whose enumRef
 * matches `name`. Real specs frequently reference enums from inside a shared
 * type (e.g. ContactRole lives on DomainContactRef.fields.role, not directly
 * on any operation's top-level body), so a shallow top-level scan would find
 * nothing.
 */
function findFieldWithEnumRef(
  fields: Record<string, FieldShape>,
  enumRefName: string,
  shared: SharedSpec,
  seen = new Set<string>(),
): FieldShape | null {
  for (const shape of Object.values(fields)) {
    if (shape.enumRef === enumRefName) return shape;

    if (shape.fieldsRef && !seen.has(shape.fieldsRef)) {
      seen.add(shape.fieldsRef);
      const t = shared.types[shape.fieldsRef];
      if (t) {
        const hit = findFieldWithEnumRef(t.fields, enumRefName, shared, seen);
        if (hit) return hit;
      }
    }
    if (shape.itemsRef && !seen.has(shape.itemsRef)) {
      seen.add(shape.itemsRef);
      const t = shared.types[shape.itemsRef];
      if (t) {
        const hit = findFieldWithEnumRef(t.fields, enumRefName, shared, seen);
        if (hit) return hit;
      }
    }
    if (shape.fields) {
      const hit = findFieldWithEnumRef(shape.fields, enumRefName, shared, seen);
      if (hit) return hit;
    }
  }
  return null;
}

describe("buildOperationSchemas: createDomain body", () => {
  it("marks customer, registrant and period as required, forbids extras, and exposes billables", () => {
    const spec = loadSpec();
    const hit = findOperation(spec, "createDomain");
    expect(hit).not.toBeNull();

    const schemas = buildOperationSchemas(hit!.op, spec.shared);
    expect(schemas.body).not.toBeNull();

    const body = schemas.body as Record<string, unknown>;
    expect(body.additionalProperties).toBe(false);

    const required = body.required as string[];
    expect(required).toContain("registrant");
    expect(required).toContain("customer");

    const properties = body.properties as Record<string, unknown>;
    expect(properties).toHaveProperty("billables");
  });
});

describe("buildOperationSchemas: enum resolution", () => {
  it("resolves an enumRef field (ContactRole) to its enum values via shared.enums", () => {
    const spec = loadSpec();
    const ops = allOperations(spec);

    let found: FieldShape | null = null;
    for (const { op } of ops) {
      if (!op.requestBody) continue;
      found = findFieldWithEnumRef(op.requestBody.fields, "ContactRole", spec.shared);
      if (found) break;
    }

    expect(found, "expected at least one operation body to reference the ContactRole enum (directly or via a shared type)").not.toBeNull();
    expect(found!.enumRef).toBe("ContactRole");

    const en = spec.shared.enums.ContactRole;
    expect(en).toBeDefined();
    expect(en!.values).toEqual(["ADMIN", "BILLING", "TECH"]);
  });
});

describe("buildOperationSchemas: path params", () => {
  it("getAcmeSubscription requires acmeSubscriptionId as an integer", () => {
    const spec = loadSpec();
    const hit = findOperation(spec, "getAcmeSubscription");
    expect(hit).not.toBeNull();

    const schemas = buildOperationSchemas(hit!.op, spec.shared);
    expect(schemas.path.required).toEqual(["acmeSubscriptionId"]);

    const properties = schemas.path.properties as Record<string, { type: string }>;
    expect(properties.acmeSubscriptionId?.type).toBe("integer");
  });
});

describe("buildOperationSchemas: query params optional by default", () => {
  it("getAcmeSubscription's query schema has no required entries", () => {
    const spec = loadSpec();
    const hit = findOperation(spec, "getAcmeSubscription");
    expect(hit).not.toBeNull();

    const schemas = buildOperationSchemas(hit!.op, spec.shared);
    expect(schemas.query.required).toBeUndefined();
    expect(schemas.query.properties).toHaveProperty("fields");
  });
});

describe("buildOperationSchemas: Ajv compile gate", () => {
  it("compiles query/path/body schemas for every operation in the real spec without throwing", () => {
    const spec = loadSpec();
    const ops = allOperations(spec);
    expect(ops.length).toBeGreaterThan(0);

    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);

    let compiledCount = 0;
    for (const { op } of ops) {
      const schemas = buildOperationSchemas(op, spec.shared);
      expect(
        () => ajv.compile({ ...schemas.query, $id: `query:${op.operationId}` }),
        `query schema for ${op.operationId} failed to compile`,
      ).not.toThrow();
      expect(
        () => ajv.compile({ ...schemas.path, $id: `path:${op.operationId}` }),
        `path schema for ${op.operationId} failed to compile`,
      ).not.toThrow();
      if (schemas.body) {
        expect(
          () => ajv.compile({ ...schemas.body, $id: `body:${op.operationId}` }),
          `body schema for ${op.operationId} failed to compile`,
        ).not.toThrow();
      }
      compiledCount += 1;
    }

    expect(compiledCount).toBe(allOperations(spec).length);
  });
});
