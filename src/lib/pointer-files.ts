// Pointer-file rendering for agent tools that have no skills mechanism of
// their own. Pure functions only — src/cli/commands/install.ts and
// uninstall.ts own all filesystem writes/reads; this module never touches
// disk, only strings, so its sentinel-block logic can be unit-tested
// directly and trusted not to mutate user content outside the block.

import { join } from "node:path";

export type PointerTool = "junie" | "copilot" | "cursor" | "agentsmd";

export const POINTER_TOOLS: PointerTool[] = ["junie", "copilot", "cursor", "agentsmd"];

export const SENTINEL_BEGIN = "<!-- realtime-register:begin -->";
export const SENTINEL_END = "<!-- realtime-register:end -->";

/** Parse a `--pointer <tools>` option value (comma list or "all") into ids. */
export function parsePointerTools(pointer: string | undefined): PointerTool[] {
  if (!pointer) return [];
  if (pointer.trim().toLowerCase() === "all") return [...POINTER_TOOLS];
  const requested = pointer
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return requested.filter((t): t is PointerTool => (POINTER_TOOLS as string[]).includes(t));
}

/** Resolve the pointer file path for a given tool, relative to `cwd`. */
export function pointerFilePath(tool: PointerTool, cwd: string): string {
  switch (tool) {
    case "junie":
      return join(cwd, ".junie", "AGENTS.md");
    case "copilot":
      return join(cwd, ".github", "copilot-instructions.md");
    case "cursor":
      return join(cwd, ".cursor", "rules", "realtime-register.mdc");
    case "agentsmd":
      return join(cwd, "AGENTS.md");
  }
}

const CURSOR_FRONT_MATTER =
  "---\n" +
  "description: Realtime Register REST API v2 operations, validation and auth rules\n" +
  "alwaysApply: false\n" +
  "---\n";

/**
 * Render the sentinel-delimited pointer block for a tool. `skillPath` is the
 * absolute path where the realtime-register skill was installed.
 */
export function renderPointer(tool: PointerTool, skillPath: string): string {
  const body = [
    SENTINEL_BEGIN,
    "# Realtime Register skill",
    "",
    "This project uses the `realtime-register` agent skill for the Realtime",
    "Register REST API v2 (domains, DNS zones, contacts, SSL, hosts, brands,",
    "notifications, billing, processes).",
    "",
    `Installed at: ${skillPath}`,
    "",
    `Read \`${skillPath}/SKILL.md\` and the relevant`,
    `\`${skillPath}/references/<category>.md\` file before making API calls.`,
    "",
    "Hard rule: auth header is `Authorization: ApiKey <key>` — never",
    "`X-API-KEY`, never `Basic`.",
    SENTINEL_END,
    "",
  ].join("\n");

  return tool === "cursor" ? CURSOR_FRONT_MATTER + body : body;
}

/**
 * Find the [start, end) character range of the sentinel block, if present.
 * `end` absorbs a single trailing newline right after the end marker (the
 * one `renderPointer` always emits) so replace/remove operations don't leave
 * behind or double up blank lines across repeated merges.
 */
function findSentinelRange(content: string): { start: number; end: number } | null {
  const start = content.indexOf(SENTINEL_BEGIN);
  if (start === -1) return null;
  const endMarker = content.indexOf(SENTINEL_END, start);
  if (endMarker === -1) return null;
  let end = endMarker + SENTINEL_END.length;
  if (content[end] === "\n") end += 1;
  return { start, end };
}

/** Whether `content` contains our sentinel block. */
export function hasSentinel(content: string): boolean {
  return findSentinelRange(content) !== null;
}

/**
 * Whether `content` consists ONLY of our sentinel block, ignoring
 * surrounding whitespace. Used by uninstall to decide whether to delete the
 * whole file rather than just strip the block.
 */
export function isOnlySentinel(content: string): boolean {
  const range = findSentinelRange(content);
  if (!range) return false;
  const before = content.slice(0, range.start);
  const after = content.slice(range.end);
  return before.trim() === "" && after.trim() === "";
}

/**
 * Merge a freshly rendered pointer block into existing file content.
 * - No existing sentinel block: append the new block (with a blank-line
 *   separator if there is existing content).
 * - Existing sentinel block: replace only the delimited range, leaving
 *   everything else byte-identical.
 */
export function mergePointer(existingContent: string, rendered: string): string {
  const range = findSentinelRange(existingContent);
  if (!range) {
    if (existingContent.trim() === "") return rendered;
    const needsSeparator = !existingContent.endsWith("\n\n");
    const separator = existingContent.endsWith("\n") ? "\n" : "\n\n";
    return existingContent + (needsSeparator ? separator : "") + rendered;
  }
  return existingContent.slice(0, range.start) + rendered + existingContent.slice(range.end);
}

/**
 * Remove our sentinel block from existing content, leaving everything else
 * untouched. Returns null if there is no sentinel block to remove.
 */
export function removePointer(existingContent: string): string | null {
  const range = findSentinelRange(existingContent);
  if (!range) return null;
  return existingContent.slice(0, range.start) + existingContent.slice(range.end);
}
