import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SKILLS_BIN = join(HERE, "..", "bin", "skills.js");
const RTR_BIN = join(HERE, "..", "bin", "rtr.js");

function run(bin: string, args: string[], cwd?: string): string {
  return execFileSync("node", [bin, ...args], {
    cwd: cwd ?? process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
}

describe("bin/skills.js", () => {
  it("reports the package version", () => {
    const out = run(SKILLS_BIN, ["--version"]).trim();
    expect(out).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("lists known targets via `where`", () => {
    const out = run(SKILLS_BIN, ["where"]);
    expect(out).toContain("Claude Desktop");
    expect(out).toContain("Augment");
  });

  it("produces a dry-run plan without touching disk", () => {
    const tmp = mkdtempSync(join(tmpdir(), "rtr-dr-"));
    try {
      const out = run(SKILLS_BIN, ["install", "--target", tmp, "--dry-run"]);
      expect(out).toContain("[dry run] would install");
      expect(out).toContain(tmp);
      expect(existsSync(join(tmp, "realtime-register"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("install + uninstall round-trip against an explicit --target", () => {
    const tmp = mkdtempSync(join(tmpdir(), "rtr-rt-"));
    try {
      const installed = run(SKILLS_BIN, ["install", "--target", tmp]);
      expect(installed).toContain("Installed");
      const skillDir = join(tmp, "realtime-register");
      expect(existsSync(skillDir)).toBe(true);
      expect(statSync(join(skillDir, "SKILL.md")).isFile()).toBe(true);
      expect(statSync(join(skillDir, "references")).isDirectory()).toBe(true);
      expect(statSync(join(skillDir, "assets", "spec")).isDirectory()).toBe(true);
      expect(readdirSync(join(skillDir, "references")).length).toBeGreaterThan(10);

      const removed = run(SKILLS_BIN, ["uninstall", "--target", tmp]);
      expect(removed).toContain("Removed");
      expect(existsSync(skillDir)).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("install --pointer agentsmd creates AGENTS.md with a sentinel block, uninstall removes it", () => {
    const target = mkdtempSync(join(tmpdir(), "rtr-ptr-target-"));
    const cwd = mkdtempSync(join(tmpdir(), "rtr-ptr-cwd-"));
    try {
      const installed = run(SKILLS_BIN, ["install", "--target", target, "--pointer", "agentsmd"], cwd);
      expect(installed).toContain("Installed");

      const agentsMd = join(cwd, "AGENTS.md");
      expect(existsSync(agentsMd)).toBe(true);
      const content = readFileSync(agentsMd, "utf8");
      expect(content).toContain("<!-- realtime-register:begin -->");
      expect(content).toContain("<!-- realtime-register:end -->");

      const removed = run(SKILLS_BIN, ["uninstall", "--target", target, "--pointer", "agentsmd"], cwd);
      expect(removed).toContain("Removed");
      expect(existsSync(agentsMd)).toBe(false);
    } finally {
      rmSync(target, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("preserves surrounding user content in AGENTS.md across install/uninstall of the pointer block", () => {
    const target = mkdtempSync(join(tmpdir(), "rtr-ptr-target-"));
    const cwd = mkdtempSync(join(tmpdir(), "rtr-ptr-cwd-"));
    const agentsMd = join(cwd, "AGENTS.md");
    const customContent = "# My Custom Instructions\n\nAlways run tests before committing.\n";
    try {
      writeFileSync(agentsMd, customContent);

      // No sentinel yet: install must NOT modify the file, only print guidance.
      const firstInstall = run(SKILLS_BIN, ["install", "--target", target, "--pointer", "agentsmd"], cwd);
      expect(firstInstall).toContain("Add this to");
      expect(readFileSync(agentsMd, "utf8")).toBe(customContent);

      // Manually add the block alongside the custom content, as a user following the guidance would.
      const withBlock =
        customContent +
        "\n<!-- realtime-register:begin -->\nplaceholder\n<!-- realtime-register:end -->\n";
      writeFileSync(agentsMd, withBlock);

      // Re-running install now updates only the sentinel-delimited block.
      const secondInstall = run(SKILLS_BIN, ["install", "--target", target, "--pointer", "agentsmd", "--force"], cwd);
      expect(secondInstall).toContain("pointer: updated");
      const afterUpdate = readFileSync(agentsMd, "utf8");
      expect(afterUpdate).toContain("# My Custom Instructions");
      expect(afterUpdate).toContain("Always run tests before committing.");
      expect(afterUpdate).not.toContain("placeholder");

      // Uninstall removes only the block, preserving the custom content.
      const removed = run(SKILLS_BIN, ["uninstall", "--target", target, "--pointer", "agentsmd"], cwd);
      expect(removed).toContain("pointer: removed block from");
      const afterRemove = readFileSync(agentsMd, "utf8");
      expect(afterRemove).toContain("# My Custom Instructions");
      expect(afterRemove).toContain("Always run tests before committing.");
      expect(afterRemove).not.toContain("realtime-register:begin");
    } finally {
      rmSync(target, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("bin/rtr.js", () => {
  it("lists the validation category", () => {
    const out = run(RTR_BIN, ["list", "--category", "validation"]);
    expect(out).toContain("getValidationCategory");
    expect(out).toContain("listValidationCategories");
  });
});
