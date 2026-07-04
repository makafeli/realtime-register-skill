import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSpec, findOperation } from "../src/lib/spec.js";
import { buildOperationSchemas } from "../src/lib/schema.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const RTR_BIN = join(HERE, "..", "bin", "rtr.js");

interface CliResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[]): CliResult {
  try {
    const stdout = execFileSync("node", [RTR_BIN, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

/** A plausible dummy value for a JSON Schema fragment, honoring enum/format/type. */
function dummyValueFor(schema: Record<string, unknown>): unknown {
  const enumValues = schema.enum as unknown[] | undefined;
  if (enumValues && enumValues.length > 0) return enumValues[0];

  const format = schema.format as string | undefined;
  if (format === "email") return "a@b.co";
  if (format === "date-time") return "2026-01-01T00:00:00Z";

  switch (schema.type) {
    case "string":
      return "x";
    case "integer":
    case "number":
      return 12;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return {};
    default:
      return "x";
  }
}

/** Builds a minimal valid payload containing only the schema's required properties. */
function minimalPayloadFor(schema: Record<string, unknown>): Record<string, unknown> {
  const required = (schema.required as string[] | undefined) ?? [];
  const properties = (schema.properties as Record<string, Record<string, unknown>>) ?? {};
  const payload: Record<string, unknown> = {};
  for (const name of required) {
    const propSchema = properties[name] ?? {};
    payload[name] = dummyValueFor(propSchema);
  }
  return payload;
}

describe("rtr validate CLI", () => {
  let tmpDir: string;
  let validBodyPath: string;
  let invalidBodyPath: string;
  let extraFieldBodyPath: string;

  beforeAll(() => {
    const spec = loadSpec();
    const hit = findOperation(spec, "createDomain");
    if (!hit) throw new Error("createDomain not found in spec");
    const schemas = buildOperationSchemas(hit.op, spec.shared);
    if (!schemas.body) throw new Error("createDomain has no body schema");

    const validBody = minimalPayloadFor(schemas.body as Record<string, unknown>);
    const required = (schemas.body as Record<string, unknown>).required as string[];
    expect(required.length).toBeGreaterThan(0);

    const invalidBody = { ...validBody };
    delete invalidBody[required[0]!];

    const extraFieldBody = { ...validBody, nope: true };

    tmpDir = mkdtempSync(join(tmpdir(), "rtr-validate-cli-"));
    validBodyPath = join(tmpDir, "valid.json");
    invalidBodyPath = join(tmpDir, "invalid.json");
    extraFieldBodyPath = join(tmpDir, "extra.json");
    writeFileSync(validBodyPath, JSON.stringify(validBody));
    writeFileSync(invalidBodyPath, JSON.stringify(invalidBody));
    writeFileSync(extraFieldBodyPath, JSON.stringify(extraFieldBody));
  });

  it("exits 0 and prints 'Body: OK' for a minimal valid createDomain body", () => {
    const result = runCli(["validate", "createDomain", "-b", validBodyPath]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Body: OK");
  });

  it("exits 1 with 'Body validation failed' when a required field is missing", () => {
    const result = runCli(["validate", "createDomain", "-b", invalidBodyPath]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Body validation failed");
  });

  it("exits 1 with 'Unknown operationId' for an unknown operation", () => {
    const result = runCli(["validate", "notARealOperation", "-b", validBodyPath]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unknown operationId");
  });

  it("exits 1 when the body has an additional, undeclared property", () => {
    const result = runCli(["validate", "createDomain", "-b", extraFieldBodyPath]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Body validation failed");
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
