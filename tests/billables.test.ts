import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { loadSpec, allOperations } from "../src/lib/spec.js";
import { buildOperationSchemas } from "../src/lib/schema.js";

// ajv@8 and ajv-formats@3 are CommonJS; under "module": "NodeNext" the default
// import resolves to a namespace object that TypeScript refuses to invoke.
// Falling back to createRequire gives us the raw CJS exports (mirrors
// src/cli/commands/validate.ts:8-10).
const require = createRequire(import.meta.url);
const Ajv: typeof import("ajv").default = require("ajv");

describe("billable acknowledgment resubmit", () => {
  it("every operation that can raise BillableAcknowledgmentNeededException declares a billables body field", () => {
    const spec = loadSpec();
    const ops = allOperations(spec);

    const raisesBillableException = (op: (typeof ops)[number]["op"]): boolean => {
      const inErrors = (op.errors ?? []).some((e) => e.startsWith("BillableAcknowledgmentNeeded"));
      const inGotchas = (op.gotchas ?? []).some((g) => g.includes("BillableAcknowledgmentNeeded"));
      return inErrors || inGotchas;
    };

    const offenders = ops
      .filter(({ op }) => raisesBillableException(op))
      .filter(({ op }) => op.requestBody?.fields?.billables === undefined)
      .map(({ op }) => op.operationId);

    expect(offenders).toEqual([]);
  });

  it("createDnsZone body schema accepts a billables array", () => {
    const spec = loadSpec();
    const hit = allOperations(spec).find(({ op }) => op.operationId === "createDnsZone");
    expect(hit).toBeDefined();

    const schemas = buildOperationSchemas(hit!.op, spec.shared);
    expect(schemas.body).not.toBeNull();

    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schemas.body!);

    const payload = {
      name: "example.com",
      service: "BASIC",
      billables: [{ product: "x", action: "CREATE", quantity: 1 }],
    };
    validate(payload);

    const billablesErrors = (validate.errors ?? []).filter(
      (err) =>
        err.instancePath.startsWith("/billables") ||
        err.params?.additionalProperty === "billables",
    );
    expect(billablesErrors).toEqual([]);
  });
});
