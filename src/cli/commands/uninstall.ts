// Uninstall / where helpers for @cave-man/realtime-register-skills.

import { existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import {
  candidateTargets,
  customTarget,
  SKILL_NAME,
  type SkillTarget,
} from "../../lib/skill-paths.js";
import {
  hasSentinel,
  isOnlySentinel,
  parsePointerTools,
  pointerFilePath,
  removePointer,
  type PointerTool,
} from "../../lib/pointer-files.js";

export interface UninstallOptions {
  target?: string;
  all?: boolean;
  dryRun?: boolean;
  pointer?: string;
}

/** Remove the installed skill directory from one or all detected targets. */
export async function uninstallCommand(opts: UninstallOptions): Promise<void> {
  const targets = pickTargets(opts);
  const installed = targets.filter((t) => existsSync(t.path));

  if (installed.length === 0) {
    console.log(`No ${SKILL_NAME} installation found in the selected target(s).`);
  } else {
    for (const t of installed) {
      if (opts.dryRun) {
        console.log(`[dry run] would remove ${t.path}  (${t.label})`);
        continue;
      }
      rmSync(t.path, { recursive: true, force: true });
      console.log(`Removed ${t.path}  (${t.label})`);
    }
  }

  const pointerTools = parsePointerTools(opts.pointer);
  for (const tool of pointerTools) {
    removePointerFile(tool, process.cwd(), opts.dryRun ?? false);
  }
}

/**
 * Remove our sentinel block from a pointer file, mirroring install's write
 * behavior:
 * - File absent: nothing to do.
 * - File is ONLY our block (ignoring whitespace): delete the whole file.
 * - File contains our block among other content: strip just the block.
 * - File present without our sentinel: leave completely untouched.
 */
function removePointerFile(tool: PointerTool, cwd: string, dryRun: boolean): void {
  const filePath = pointerFilePath(tool, cwd);
  if (!existsSync(filePath)) return;

  const existingContent = readFileSync(filePath, "utf8");
  if (!hasSentinel(existingContent)) return;

  if (isOnlySentinel(existingContent)) {
    if (dryRun) {
      console.log(`[dry run] would delete ${filePath}`);
      return;
    }
    unlinkSync(filePath);
    console.log(`  pointer: deleted ${filePath}`);
    return;
  }

  const stripped = removePointer(existingContent);
  if (stripped === null) return;
  if (dryRun) {
    console.log(`[dry run] would strip realtime-register block from ${filePath}`);
    return;
  }
  writeFileSync(filePath, stripped);
  console.log(`  pointer: removed block from ${filePath}`);
}

/** Print every known target and whether the skill is installed there. */
export async function whereCommand(): Promise<void> {
  const targets = candidateTargets();
  let anyInstalled = false;

  for (const t of targets) {
    const installed = existsSync(t.path);
    const marker = installed ? "[installed]" : t.exists ? "[available]" : "[absent]   ";
    console.log(`${marker}  ${t.label.padEnd(28)} ${t.path}`);
    if (installed) anyInstalled = true;
  }

  if (!anyInstalled) {
    console.log("");
    console.log(`No ${SKILL_NAME} installation detected. Run:`);
    console.log("  npx @cave-man/realtime-register-skills install");
  }
}

function pickTargets(opts: UninstallOptions): SkillTarget[] {
  if (opts.target) return [customTarget(opts.target)];
  if (opts.all)    return candidateTargets();

  // Default: uninstall from the single detected install, if unambiguous.
  const installed = candidateTargets().filter((t) => existsSync(t.path));
  if (installed.length === 0) return [];
  if (installed.length === 1) return installed;

  console.error("Multiple installations detected. Re-run with --target <dir> or --all:");
  for (const t of installed) console.error(`  ${t.path}  (${t.label})`);
  process.exit(1);
}
