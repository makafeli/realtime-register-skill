// Target-directory detection for the skill installer. Every function here is
// pure / read-only; the installer in src/cli/commands/install.ts decides what
// to do with the results.

import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_NAME = "realtime-register";

export interface SkillTarget {
  /** Stable identifier for the target (e.g. "claude-desktop"). */
  id: string;
  /** Human-friendly label shown to the user. */
  label: string;
  /** Directory where skills live (the skill subdir is created beneath it). */
  dir: string;
  /** Resolved installation path for this skill (dir/SKILL_NAME). */
  path: string;
  /** Whether the parent `dir` already exists on disk. */
  exists: boolean;
}

/**
 * Return every known skill target for the current OS, in the order we prefer
 * them. Callers filter by `exists` to determine which ones to surface.
 */
export function candidateTargets(cwd: string = process.cwd()): SkillTarget[] {
  const home = homedir();
  const raw: Array<Omit<SkillTarget, "path" | "exists">> = [];

  if (platform() === "darwin") {
    raw.push({
      id: "claude-desktop",
      label: "Claude Desktop (macOS)",
      dir: join(home, "Library", "Application Support", "Claude", "skills"),
    });
  } else if (platform() === "win32") {
    const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
    raw.push({
      id: "claude-desktop",
      label: "Claude Desktop (Windows)",
      dir: join(appData, "Claude", "skills"),
    });
  } else {
    raw.push({
      id: "claude-desktop",
      label: "Claude Desktop (Linux)",
      dir: join(home, ".config", "Claude", "skills"),
    });
  }

  raw.push(
    { id: "claude-code",     label: "Claude Code CLI",                                          dir: join(home, ".claude", "skills") },
    { id: "agents-standard", label: "Skills standard (~/.agents) — Codex / Gemini / Augment",    dir: join(home, ".agents", "skills") },
    { id: "gemini",          label: "Gemini CLI",                                                dir: join(home, ".gemini", "skills") },
    { id: "codex",           label: "Codex CLI (best effort)",                                   dir: join(home, ".codex", "skills") },
    { id: "augment",         label: "Augment",                                                   dir: join(home, ".augment", "skills") },
    { id: "project-agents",  label: "Local project (.agents)",                                   dir: join(cwd, ".agents", "skills") },
    { id: "project-local",   label: "Local project",                                             dir: join(cwd, "skills") },
  );

  return raw.map((t) => ({
    ...t,
    path: join(t.dir, SKILL_NAME),
    exists: existsSync(t.dir),
  }));
}

/**
 * Resolve a --target <path> argument into a SkillTarget. If `target` points
 * at something already named `realtime-register` we use it as-is, otherwise
 * we treat it as the parent `skills/` directory.
 */
export function customTarget(target: string): SkillTarget {
  const absolute = resolve(target);
  const isSkillDir =
    absolute.endsWith(`${SKILL_NAME}`) || absolute.endsWith(`${SKILL_NAME}/`);
  const dir = isSkillDir ? dirname(absolute) : absolute;
  return {
    id: "custom",
    label: `Custom (${absolute})`,
    dir,
    path: join(dir, SKILL_NAME),
    exists: existsSync(dir),
  };
}

/**
 * Resolve the root of the installed npm package (where SKILL.md,
 * references/, and assets/spec/ live). Works both in dev (running from src/
 * via tsx/ts-node) and in the published build (running from dist/).
 */
export function packageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/lib/skill-paths.ts  -> ../../   | dist/lib/skill-paths.js -> ../../
  return resolve(here, "..", "..");
}

/**
 * Return the list of source paths that make up a skill install. These are
 * absolute paths inside the installed npm package.
 */
export function skillPayload(): Array<{ src: string; dest: string; kind: "file" | "dir" }> {
  const root = packageRoot();
  return [
    { src: join(root, "SKILL.md"),       dest: "SKILL.md",   kind: "file" },
    { src: join(root, "references"),     dest: "references", kind: "dir" },
    { src: join(root, "assets", "spec"), dest: "assets/spec", kind: "dir" },
  ];
}

/**
 * Return the target that a non-interactive installer should auto-select.
 * Preference order: first `exists === true` candidate, otherwise the last
 * candidate (project-local), which the installer will `mkdir -p`.
 */
export function defaultTarget(targets: SkillTarget[]): SkillTarget {
  const existing = targets.find((t) => t.exists);
  if (existing) return existing;
  const last = targets[targets.length - 1];
  if (!last) throw new Error("No candidate targets available.");
  return last;
}
