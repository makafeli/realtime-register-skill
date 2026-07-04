import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  candidateTargets,
  customTarget,
  defaultTarget,
  packageRoot,
  skillPayload,
  SKILL_NAME,
} from "../src/lib/skill-paths.js";

describe("candidateTargets", () => {
  it("returns at least Claude Desktop, Claude Code CLI, Augment, and a project-local target", () => {
    const targets = candidateTargets("/some/cwd");
    const ids = targets.map((t) => t.id);
    expect(ids).toContain("claude-desktop");
    expect(ids).toContain("claude-code");
    expect(ids).toContain("augment");
    expect(ids).toContain("project-local");
    expect(targets.length).toBeGreaterThanOrEqual(4);
  });

  it("includes the agentskills.io-standard dir, Gemini CLI, Codex CLI, and project-agents targets", () => {
    const targets = candidateTargets("/some/cwd");
    const ids = targets.map((t) => t.id);
    expect(ids).toContain("agents-standard");
    expect(ids).toContain("gemini");
    expect(ids).toContain("codex");
    expect(ids).toContain("project-agents");
    for (const id of ["agents-standard", "gemini", "codex", "project-agents"]) {
      const t = targets.find((x) => x.id === id)!;
      expect(t.path.endsWith(`/${SKILL_NAME}`)).toBe(true);
    }
  });

  it("exposes 8 targets in the documented relative order", () => {
    const targets = candidateTargets("/some/cwd");
    const ids = targets.map((t) => t.id);
    expect(ids).toEqual([
      "claude-desktop",
      "claude-code",
      "agents-standard",
      "gemini",
      "codex",
      "augment",
      "project-agents",
      "project-local",
    ]);
  });

  it("appends SKILL_NAME to every target's install path", () => {
    for (const t of candidateTargets("/some/cwd")) {
      expect(t.path.endsWith(`/${SKILL_NAME}`)).toBe(true);
      expect(t.path.startsWith(t.dir)).toBe(true);
    }
  });

  it("project-local target is cwd-relative", () => {
    const tmp = mkdtempSync(join(tmpdir(), "rtr-pl-"));
    try {
      const targets = candidateTargets(tmp);
      const local = targets.find((t) => t.id === "project-local")!;
      expect(local.dir).toBe(join(tmp, "skills"));
      expect(local.path).toBe(join(tmp, "skills", SKILL_NAME));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("customTarget", () => {
  it("treats a directory as the parent of the skill", () => {
    const tmp = mkdtempSync(join(tmpdir(), "rtr-ct-"));
    try {
      const t = customTarget(tmp);
      expect(t.id).toBe("custom");
      expect(t.dir).toBe(tmp);
      expect(t.path).toBe(join(tmp, SKILL_NAME));
      expect(t.exists).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("normalises a path that already ends in the skill name", () => {
    const tmp = mkdtempSync(join(tmpdir(), "rtr-ct-"));
    try {
      const asSkill = join(tmp, SKILL_NAME);
      const t = customTarget(asSkill);
      expect(t.dir).toBe(tmp);
      expect(t.path).toBe(asSkill);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("defaultTarget", () => {
  it("returns the first existing candidate when one exists", () => {
    const tmp = mkdtempSync(join(tmpdir(), "rtr-dt-"));
    mkdirSync(join(tmp, "b"), { recursive: true });
    try {
      const out = defaultTarget([
        { id: "a", label: "A", dir: join(tmp, "a"), path: join(tmp, "a", SKILL_NAME), exists: false },
        { id: "b", label: "B", dir: join(tmp, "b"), path: join(tmp, "b", SKILL_NAME), exists: true },
      ]);
      expect(out.id).toBe("b");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("falls back to the last candidate when none exist", () => {
    const out = defaultTarget([
      { id: "a", label: "A", dir: "/nope/a", path: "/nope/a/rr", exists: false },
      { id: "b", label: "B", dir: "/nope/b", path: "/nope/b/rr", exists: false },
    ]);
    expect(out.id).toBe("b");
  });

  it("throws on an empty list", () => {
    expect(() => defaultTarget([])).toThrow();
  });
});

describe("skillPayload / packageRoot", () => {
  it("resolves against the repo root and lists the three skill assets", () => {
    const root = packageRoot();
    const entries = skillPayload();
    expect(entries.map((e) => e.dest)).toEqual(["SKILL.md", "references", "assets/spec"]);
    for (const e of entries) {
      expect(e.src.startsWith(root)).toBe(true);
    }
  });
});
