#!/usr/bin/env node
// Entry point for the `skills` bin. Handles install / uninstall / where /
// doctor, and forwards any `rtr …` subcommand to the main CLI so a user can
// run `npx @cave-man/realtime-register-skills rtr describe registerDomain`
// without having to install the package globally first.

import { Command } from "commander";
import { installCommand } from "./commands/install.js";
import { uninstallCommand, whereCommand } from "./commands/uninstall.js";
import { doctorCommand } from "./commands/doctor.js";
import { PACKAGE_VERSION } from "../lib/package-version.js";

// Pass-through: `skills rtr <anything>` delegates to the main rtr CLI without
// involving commander at this layer (commander's subcommand handling is not
// forgiving enough for arbitrary argv). This lets users run, for example,
// `npx @cave-man/realtime-register-skills rtr describe registerDomain`.
if (process.argv[2] === "rtr") {
  process.argv = [process.argv[0]!, process.argv[1]!, ...process.argv.slice(3)];
  await import("./index.js");
} else {
  await runInstaller();
}

async function runInstaller(): Promise<void> {
  const program = new Command();

  program
    .name("skills")
    .description("Installer for the @cave-man/realtime-register-skills agent skill.")
    .version(PACKAGE_VERSION);

  program
    .command("install")
    .description("Install the realtime-register skill into a detected or specified target.")
    .option("-t, --target <dir>", "Target skills directory (parent of realtime-register/).")
    .option("-g, --global",       "Also install the rtr CLI globally via npm install -g.")
    .option("-f, --force",        "Overwrite an existing installation.")
    .option("-n, --dry-run",      "Print what would happen without writing anything.")
    .option("-y, --yes",          "Do not prompt; pick the default target.")
    .option(
      "-p, --pointer <tools>",
      "Comma-separated pointer tools (junie,copilot,cursor,agentsmd) or 'all'. " +
        "Writes/updates a sentinel-delimited block in each tool's convention file."
    )
    .action(installCommand);

  program
    .command("uninstall")
    .description("Remove the installed realtime-register skill.")
    .option("-t, --target <dir>", "Target skills directory to remove from.")
    .option("-a, --all",          "Remove from every detected target.")
    .option("-n, --dry-run",      "Print what would happen without deleting anything.")
    .option(
      "-p, --pointer <tools>",
      "Comma-separated pointer tools (junie,copilot,cursor,agentsmd) or 'all' " +
        "to remove; only our sentinel-delimited block is touched."
    )
    .action(uninstallCommand);

  program
    .command("where")
    .description("Show every known skill target and whether the skill is installed.")
    .action(whereCommand);

  program
    .command("doctor")
    .description("Verify every docUrl in the packaged spec resolves (HTTP 200).")
    .option("-c, --category <name>", "Category name (all by default)")
    .action(doctorCommand);

  program.addHelpText(
    "after",
    "\nForward any `rtr` subcommand: skills rtr <command> [...]\n" +
      "  e.g. skills rtr describe registerDomain\n"
  );

  await program.parseAsync(process.argv).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
