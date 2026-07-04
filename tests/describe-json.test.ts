import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

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

describe("rtr describe --format json", () => {
  it("emits a pure-JSON contract for createDomain", () => {
    const result = runCli(["describe", "createDomain", "--format", "json"]);
    expect(result.status).toBe(0);

    // stdout must be pure JSON: JSON.parse of the full stdout succeeds.
    const parsed = JSON.parse(result.stdout);

    expect(parsed.operationId).toBe("createDomain");
    expect(parsed.method).toBe("POST");

    expect(parsed.schemas).toBeDefined();
    expect(parsed.schemas.body).toBeDefined();
    expect(parsed.schemas.body.required).toContain("registrant");
    expect(parsed.schemas.body.required).toContain("customer");

    expect(parsed.auth).toBeDefined();
    expect(parsed.auth.scheme).toBe("ApiKey");
  });

  it("exits 1 with the error on stderr for an unknown operationId, leaving stdout non-JSON-polluting", () => {
    const result = runCli(["describe", "notARealOperation", "--format", "json"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unknown operationId");
    expect(result.stdout.trim()).toBe("");
  });
});
