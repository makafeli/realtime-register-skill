#!/usr/bin/env node
// Spike prototype — NOT shipped in the rtr npm package. See docs/mcp-design.md.
//
// A stdio MCP server exposing three tools over the repo's built dist/lib/*:
//   rtr_list      — operation table, optionally filtered by category
//   rtr_describe  — the same payload shape as `rtr describe --format json`
//   rtr_validate  — in-process ajv validation of body/query/pathParams
//
// Imports the repo's compiled dist/lib/*.js via relative paths (run `npm run
// build` in the repo root first).

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createRequire } from "node:module";

import { loadSpec, findOperation, allOperations } from "../../dist/lib/spec.js";
import { buildOperationSchemas } from "../../dist/lib/schema.js";

const require = createRequire(import.meta.url);
const Ajv = require("ajv");
const addFormats = require("ajv-formats");

const spec = loadSpec();

function describePayload(operationId) {
  const hit = findOperation(spec, operationId);
  if (!hit) return null;
  return {
    category: hit.category.category,
    ...hit.op,
    docUrl: spec.shared.docsBaseUrl + hit.op.docUrl,
    auth: spec.shared.auth ?? null,
    schemas: buildOperationSchemas(hit.op, spec.shared),
  };
}

function listPayload(category) {
  const rows = [];
  for (const { category: cat, op } of allOperations(spec)) {
    if (category && cat.category !== category) continue;
    rows.push({
      operationId: op.operationId,
      method: op.method,
      path: op.path,
      summary: op.summary,
      authScope: op.authScope,
    });
  }
  return rows;
}

function validatePayload(operationId, body, query, pathParams) {
  const hit = findOperation(spec, operationId);
  if (!hit) {
    return { valid: false, errors: [{ where: "body", instancePath: "", message: `Unknown operationId: ${operationId}` }] };
  }

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const schemas = buildOperationSchemas(hit.op, spec.shared);
  const errors = [];

  if (schemas.body && body !== undefined) {
    const validate = ajv.compile(schemas.body);
    if (!validate(body)) {
      for (const err of validate.errors ?? []) {
        errors.push({ where: "body", instancePath: err.instancePath, message: err.message ?? "invalid" });
      }
    }
  }

  if (query !== undefined) {
    const validate = ajv.compile(schemas.query);
    if (!validate(query)) {
      for (const err of validate.errors ?? []) {
        errors.push({ where: "query", instancePath: err.instancePath, message: err.message ?? "invalid" });
      }
    }
  }

  if (pathParams !== undefined) {
    const validate = ajv.compile(schemas.path);
    if (!validate(pathParams)) {
      for (const err of validate.errors ?? []) {
        errors.push({ where: "path", instancePath: err.instancePath, message: err.message ?? "invalid" });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

const TOOLS = [
  {
    name: "rtr_list",
    description: "List Realtime Register REST API operations, optionally filtered by category.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Category name (e.g. domains). Omit for all categories." },
      },
    },
  },
  {
    name: "rtr_describe",
    description: "Return the full reference contract for one operation: params, request body, derived JSON Schemas, and the shared auth block.",
    inputSchema: {
      type: "object",
      properties: {
        operationId: { type: "string", description: "e.g. createDomain" },
      },
      required: ["operationId"],
    },
  },
  {
    name: "rtr_validate",
    description: "Validate a request body/query/pathParams against an operation's JSON Schema using ajv, in-process.",
    inputSchema: {
      type: "object",
      properties: {
        operationId: { type: "string" },
        body: { type: "object" },
        query: { type: "object" },
        pathParams: { type: "object" },
      },
      required: ["operationId"],
    },
  },
];

const server = new Server(
  { name: "rtr-mcp-spike", version: "0.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "rtr_list") {
      const rows = listPayload(args?.category);
      return { content: [{ type: "text", text: JSON.stringify(rows, null, 2) }] };
    }

    if (name === "rtr_describe") {
      const payload = describePayload(args?.operationId);
      if (!payload) {
        return {
          isError: true,
          content: [{ type: "text", text: `Unknown operationId: ${args?.operationId}` }],
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
    }

    if (name === "rtr_validate") {
      const result = validatePayload(args?.operationId, args?.body, args?.query, args?.pathParams);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
