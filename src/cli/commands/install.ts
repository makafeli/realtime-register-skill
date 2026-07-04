// Installer for @cave-man/realtime-register-skills.
// Copies SKILL.md, references/, and assets/spec/ into a detected (or user-
// specified) skills directory. Optionally performs a global npm install to
// put the `rtr` CLI on PATH.

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { select } from "@inquirer/prompts";
import {
  candidateTargets,
  customTarget,
  defaultTarget,
  skillPayload,
  SKILL_NAME,
  type SkillTarget,
} from "../../lib/skill-paths.js";
import {
  hasSentinel,
  mergePointer,
  parsePointerTools,
  pointerFilePath,
  renderPointer,
  type PointerTool,
} from "../../lib/pointer-files.js";

export interface InstallOptions {
  target?: string;
  global?: boolean;
  force?: boolean;
  link?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  pointer?: string;
}

const PACKAGE_NAME = "@cave-man/realtime-register-skills";

export async function installCommand(opts: InstallOptions): Promise<void> {
  const target = await resolveTarget(opts);
  const destSkill = target.path;

  if (opts.dryRun) {
    printPlan(target, opts);
    return;
  }

  if (existsSync(destSkill)) {
    if (!opts.force) {
      console.error(
        `Skill already installed at ${destSkill}. Re-run with --force to overwrite, ` +
        `or 'npx ${PACKAGE_NAME} uninstall' first.`
      );
      process.exitCode = 1;
      return;
    }
    rmSync(destSkill, { recursive: true, force: true });
  }

  mkdirSync(destSkill, { recursive: true });

  let fileCount = 0;
  for (const entry of skillPayload()) {
    const dest = join(destSkill, entry.dest);
    if (!existsSync(entry.src)) {
      console.error(`Source missing: ${entry.src}. Is the package install complete?`);
      process.exitCode = 1;
      return;
    }
    mkdirSync(dirname(dest), { recursive: true });
    if (entry.kind === "file") {
      cpSync(entry.src, dest);
      fileCount += 1;
    } else {
      cpSync(entry.src, dest, { recursive: true });
      fileCount += countFiles(entry.src);
    }
  }

  console.log(`Installed ${SKILL_NAME} skill (${fileCount} files) to:`);
  console.log(`  ${destSkill}`);
  console.log(`  target: ${target.label}`);

  const pointerTools = parsePointerTools(opts.pointer);
  for (const tool of pointerTools) {
    writePointerFile(tool, destSkill, process.cwd());
  }

  if (opts.global) {
    installGlobalCli();
  } else {
    console.log("");
    console.log("The rtr CLI can be run via:");
    console.log(`  npx ${PACKAGE_NAME} rtr --help`);
    console.log(`  # or install globally: npx ${PACKAGE_NAME} install --global`);
  }
}

/**
 * Create or update a pointer file for `tool`, pointing at `skillPath`.
 * - File absent: create it (mkdir -p parent) with the rendered block.
 * - File present without our sentinel: never touch it; print the block for
 *   the user to add manually.
 * - File present with our sentinel: replace only the sentinel-delimited
 *   range, leaving the rest of the file byte-identical.
 */
function writePointerFile(tool: PointerTool, skillPath: string, cwd: string): void {
  const filePath = pointerFilePath(tool, cwd);
  const rendered = renderPointer(tool, skillPath);

  if (!existsSync(filePath)) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, rendered);
    console.log(`  pointer: created ${filePath}`);
    return;
  }

  const existingContent = readFileSync(filePath, "utf8");
  if (!hasSentinel(existingContent)) {
    console.log("");
    console.log(`Add this to ${filePath} manually:`);
    console.log(rendered);
    return;
  }

  const merged = mergePointer(existingContent, rendered);
  if (merged !== existingContent) {
    writeFileSync(filePath, merged);
  }
  console.log(`  pointer: updated ${filePath}`);
}

/** Decide which SkillTarget to install into. */
async function resolveTarget(opts: InstallOptions): Promise<SkillTarget> {
  if (opts.target) return customTarget(opts.target);

  const envTarget = process.env.REALTIME_REGISTER_SKILL_DIR;
  if (envTarget) return customTarget(envTarget);

  const candidates = candidateTargets();

  // Non-interactive (CI, piped input, --yes): pick the default.
  if (opts.yes || !process.stdin.isTTY || !process.stdout.isTTY) {
    return defaultTarget(candidates);
  }

  const existing = candidates.filter((c) => c.exists);
  if (existing.length <= 1) return defaultTarget(candidates);

  // TTY + multiple existing targets: prompt the user.
  const chosenDir = await select<string>({
    message: "Multiple skill targets detected. Where should the skill be installed?",
    choices: existing.map((t) => ({
      name: `${t.label.padEnd(30)} ${t.dir}`,
      value: t.dir,
      description: t.id,
    })),
  });
  return customTarget(chosenDir);
}

/** Recursively count the files under `dir` so we can report a useful total. */
function countFiles(dir: string): number {
  let n = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = readdirSync(current, { withFileTypes: true });
    for (const e of entries) {
      const p = join(current, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (statSync(p).isFile()) n += 1;
    }
  }
  return n;
}

/** Run `npm install -g @cave-man/realtime-register-skills`. */
function installGlobalCli(): void {
  console.log("");
  console.log(`Installing CLI globally: npm install -g ${PACKAGE_NAME}`);
  const result = spawnSync("npm", ["install", "-g", PACKAGE_NAME], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`Global install failed (exit ${result.status}). rtr can still be run via npx.`);
    process.exitCode = result.status ?? 1;
  } else {
    console.log("rtr is now available on your PATH.");
  }
}

function printPlan(target: SkillTarget, opts: InstallOptions): void {
  console.log("[dry run] would install:");
  console.log(`  target: ${target.label} (${target.id})`);
  console.log(`  path:   ${target.path}`);
  for (const entry of skillPayload()) {
    console.log(`    ${entry.kind === "dir" ? "dir " : "file"}  ${entry.src}  ->  ${join(target.path, entry.dest)}`);
  }
  const pointerTools = parsePointerTools(opts.pointer);
  for (const tool of pointerTools) {
    console.log(`  pointer: ${pointerFilePath(tool, process.cwd())}`);
  }
  if (opts.global) console.log(`  then: npm install -g ${PACKAGE_NAME}`);
}
