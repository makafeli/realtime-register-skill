#!/usr/bin/env node
// Minimal stdio JSON-RPC driver for the spike smoke test: sends initialize,
// tools/list, and one tools/call per tool, printing each response. Used to
// record the transcript in docs/mcp-design.md independent of the inspector
// CLI (which wraps the same protocol but hides the raw frames).

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const child = spawn("node", [join(HERE, "server.mjs")], {
  stdio: ["pipe", "pipe", "inherit"],
});

let buffer = "";
const pending = new Map();
let nextId = 1;

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    const resolver = pending.get(msg.id);
    if (resolver) {
      pending.delete(msg.id);
      resolver(msg);
    }
  }
});

function send(method, params) {
  const id = nextId++;
  const frame = { jsonrpc: "2.0", id, method, params };
  child.stdin.write(JSON.stringify(frame) + "\n");
  return new Promise((resolve) => pending.set(id, resolve));
}

function sendNotification(method, params) {
  const frame = { jsonrpc: "2.0", method, params };
  child.stdin.write(JSON.stringify(frame) + "\n");
}

async function main() {
  const initResult = await send("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "rtr-smoke-test", version: "0.0.0" },
  });
  console.log("=== initialize ===");
  console.log(JSON.stringify(initResult.result, null, 2));

  sendNotification("notifications/initialized", {});

  const listResult = await send("tools/list", {});
  console.log("\n=== tools/list ===");
  console.log(JSON.stringify(listResult.result.tools.map((t) => t.name), null, 2));

  const describeResult = await send("tools/call", {
    name: "rtr_describe",
    arguments: { operationId: "createDomain" },
  });
  const describePayload = JSON.parse(describeResult.result.content[0].text);
  console.log("\n=== tools/call rtr_describe(createDomain) ===");
  console.log(
    JSON.stringify(
      { operationId: describePayload.operationId, method: describePayload.method, authScheme: describePayload.auth?.scheme },
      null,
      2
    )
  );

  const listToolResult = await send("tools/call", {
    name: "rtr_list",
    arguments: { category: "domains" },
  });
  const listRows = JSON.parse(listToolResult.result.content[0].text);
  console.log("\n=== tools/call rtr_list(category=domains) ===");
  console.log(`${listRows.length} operations returned`);

  const validateResult = await send("tools/call", {
    name: "rtr_validate",
    arguments: { operationId: "createDomain", body: { customer: "CUST-1" } },
  });
  console.log("\n=== tools/call rtr_validate(createDomain, missing registrant) ===");
  console.log(validateResult.result.content[0].text);

  child.stdin.end();
  child.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  child.kill();
  process.exit(1);
});
