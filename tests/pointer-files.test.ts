import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  hasSentinel,
  isOnlySentinel,
  mergePointer,
  pointerFilePath,
  removePointer,
  renderPointer,
} from "../src/lib/pointer-files.js";

const CWD = "/some/cwd";
const SKILL_PATH = "/home/user/.agents/skills/realtime-register";

describe("pointerFilePath", () => {
  it("resolves the junie AGENTS.md path", () => {
    expect(pointerFilePath("junie", CWD)).toBe(join(CWD, ".junie", "AGENTS.md"));
  });

  it("resolves the copilot instructions path", () => {
    expect(pointerFilePath("copilot", CWD)).toBe(
      join(CWD, ".github", "copilot-instructions.md")
    );
  });

  it("resolves the cursor rules path", () => {
    expect(pointerFilePath("cursor", CWD)).toBe(
      join(CWD, ".cursor", "rules", "realtime-register.mdc")
    );
  });

  it("resolves the root AGENTS.md path", () => {
    expect(pointerFilePath("agentsmd", CWD)).toBe(join(CWD, "AGENTS.md"));
  });
});

describe("renderPointer", () => {
  it("wraps content in begin/end sentinels", () => {
    const out = renderPointer("agentsmd", SKILL_PATH);
    expect(out).toContain("<!-- realtime-register:begin -->");
    expect(out).toContain("<!-- realtime-register:end -->");
  });

  it("mentions SKILL.md, the skill path, and the ApiKey auth hard rule", () => {
    for (const tool of ["junie", "copilot", "cursor", "agentsmd"] as const) {
      const out = renderPointer(tool, SKILL_PATH);
      expect(out).toContain("SKILL.md");
      expect(out).toContain(SKILL_PATH);
      expect(out).toContain("Authorization: ApiKey");
    }
  });

  it("prepends .mdc front-matter for cursor", () => {
    const out = renderPointer("cursor", SKILL_PATH);
    expect(out.startsWith("---\n")).toBe(true);
    expect(out).toContain("description:");
    expect(out).toContain("alwaysApply: false");
  });

  it("does not prepend front-matter for non-cursor tools", () => {
    for (const tool of ["junie", "copilot", "agentsmd"] as const) {
      const out = renderPointer(tool, SKILL_PATH);
      expect(out.startsWith("---\n")).toBe(false);
    }
  });
});

describe("hasSentinel", () => {
  it("is false for empty or unrelated content", () => {
    expect(hasSentinel("")).toBe(false);
    expect(hasSentinel("# My AGENTS.md\n\nSome custom rules.\n")).toBe(false);
  });

  it("is true once a rendered block is present", () => {
    const rendered = renderPointer("agentsmd", SKILL_PATH);
    expect(hasSentinel(rendered)).toBe(true);
  });
});

describe("isOnlySentinel", () => {
  it("is true when the file is only the rendered block", () => {
    const rendered = renderPointer("agentsmd", SKILL_PATH);
    expect(isOnlySentinel(rendered)).toBe(true);
  });

  it("is true ignoring surrounding whitespace", () => {
    const rendered = renderPointer("agentsmd", SKILL_PATH);
    expect(isOnlySentinel(`\n\n${rendered}\n\n`)).toBe(true);
  });

  it("is false when other content surrounds the block", () => {
    const rendered = renderPointer("agentsmd", SKILL_PATH);
    expect(isOnlySentinel(`# Custom heading\n\n${rendered}`)).toBe(false);
  });

  it("is false when there is no sentinel block", () => {
    expect(isOnlySentinel("# Custom heading\n\nSome content.\n")).toBe(false);
  });
});

describe("mergePointer", () => {
  it("appends the block to empty content", () => {
    const rendered = renderPointer("agentsmd", SKILL_PATH);
    expect(mergePointer("", rendered)).toBe(rendered);
  });

  it("appends the block after existing content with a separator", () => {
    const existing = "# Custom heading\n\nSome content.\n";
    const rendered = renderPointer("agentsmd", SKILL_PATH);
    const merged = mergePointer(existing, rendered);
    expect(merged.startsWith(existing)).toBe(true);
    expect(merged).toContain(rendered);
  });

  it("is idempotent: merging the same rendered block twice yields the same result", () => {
    const existing = "# Custom heading\n\nSome content.\n";
    const rendered = renderPointer("agentsmd", SKILL_PATH);
    const once = mergePointer(existing, rendered);
    const twice = mergePointer(once, rendered);
    expect(twice).toBe(once);
  });

  it("replaces only the sentinel-delimited block, preserving surrounding content", () => {
    const rendered = renderPointer("agentsmd", SKILL_PATH);
    const existing = `# Custom heading\n\n${rendered}\n# Trailing custom content\n`;
    const newRendered = renderPointer("agentsmd", "/different/path/realtime-register");
    const merged = mergePointer(existing, newRendered);
    expect(merged).toContain("# Custom heading");
    expect(merged).toContain("# Trailing custom content");
    expect(merged).toContain(newRendered);
    expect(merged).not.toContain(SKILL_PATH);
  });
});

describe("removePointer", () => {
  it("returns null when there is no sentinel block", () => {
    expect(removePointer("# Custom heading\n\nSome content.\n")).toBeNull();
  });

  it("removes the block and preserves surrounding content", () => {
    const rendered = renderPointer("agentsmd", SKILL_PATH);
    const existing = `# Custom heading\n\n${rendered}\n# Trailing custom content\n`;
    const result = removePointer(existing);
    expect(result).not.toBeNull();
    expect(result).not.toContain("realtime-register:begin");
    expect(result).toContain("# Custom heading");
    expect(result).toContain("# Trailing custom content");
  });

  it("returns an empty-ish string when the file was only the block", () => {
    const rendered = renderPointer("agentsmd", SKILL_PATH);
    const result = removePointer(rendered);
    expect(result?.trim()).toBe("");
  });
});
