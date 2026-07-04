#!/usr/bin/env node
import { Command } from "commander";
import { listCommand } from "./commands/list.js";
import { describeCommand } from "./commands/describe.js";
import { validateCommand } from "./commands/validate.js";
import { generateCommand } from "./commands/generate.js";
import { scrapeCommand } from "./commands/scrape.js";
import { doctorCommand } from "./commands/doctor.js";
import { PACKAGE_VERSION } from "../lib/package-version.js";

const program = new Command();

program
  .name("rtr")
  .description("Realtime Register REST API skill and CLI.")
  .version(PACKAGE_VERSION);

program
  .command("list")
  .description("List operations, optionally filtered by category.")
  .option("-c, --category <name>", "Category name (e.g. domains)")
  .action(listCommand);

program
  .command("describe <operationId>")
  .description("Print the full reference entry for an operation.")
  .option("-f, --format <format>", "human or json", "human")
  .action(describeCommand);

program
  .command("validate <operationId>")
  .description("Validate a request body against the operation's JSON Schema.")
  .requiredOption("-b, --body <file>", "Path to a JSON file holding the request body")
  .option("-q, --query <file>", "Path to a JSON file holding the query params")
  .option("-p, --path-params <file>", "Path to a JSON file holding the path params")
  .action(validateCommand);

program
  .command("generate")
  .description("Render category YAML(s) into references/*.md.")
  .option("-c, --category <name>", "Category name (all by default)")
  .option("-o, --out <dir>", "Output directory", "references")
  .action(generateCommand);

program
  .command("scrape <operationId>")
  .description("Fetch and parse the official HTML doc for an operation.")
  .action(scrapeCommand);

program
  .command("doctor")
  .description("Verify every docUrl resolves (HTTP 200).")
  .option("-c, --category <name>", "Category name (all by default)")
  .action(doctorCommand);

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
