# MCP server design notes (plan 009 spike)

This document is the written deliverable of the plan-009 spike: a stdio MCP
server prototype living in `spikes/mcp-server/` (not shipped in the npm
package — see `## Scope` in the plan). It answers the five design questions
the follow-up ("real") MCP plan needs, using evidence gathered by actually
running the prototype, not guesses about SDK behavior.

Prototype location: `spikes/mcp-server/server.mjs` (+ `smoke-test.mjs`,
`package.json`). It imports the repo's compiled `dist/lib/spec.js` and
`dist/lib/schema.js` via relative paths — run `npm run build` in the repo
root before running the spike.

SDK verified: `@modelcontextprotocol/sdk@1.29.0` (current on npm as of this
spike). Uses the low-level `Server` class (`server/index.js`) with
`setRequestHandler(ListToolsRequestSchema | CallToolRequestSchema, ...)`
rather than the higher-level `McpServer.registerTool()` helper — the
high-level API expects a Zod raw shape for `inputSchema`, but the low-level
protocol's `ToolSchema.inputSchema` is plain JSON Schema
(`{ type: "object", properties, required }`), which is exactly what
`buildOperationSchemas()` already produces. No Zod authoring needed; ajv
stays the single source of validation truth.

## 1. Packaging: 4th bin vs `rtr mcp` subcommand vs separate package

**Recommendation: `rtr mcp` subcommand in the main package**, not a 4th bin
and not a separate package — with npx cold-start latency as the deciding
factor:

- A **separate package** (`@cave-man/realtime-register-mcp`) means agents
  configure `npx -y @cave-man/realtime-register-mcp` in their MCP client
  config. That's an *extra* npx cold-start (package resolution + install) on
  top of whatever the agent already pays to reach for `rtr`. Also means
  keeping two packages' spec data in sync — real risk given this repo's
  entire premise is spec fidelity (plan 004/005/011/012).
- A **4th bin** (`rtr-mcp`, alongside `rtr`, `skills`,
  `realtime-register-skills`) works but is one more entry for the installer
  (plan 007) to wire into every tool's config, and one more thing to explain
  in the README's bin table.
- A **subcommand** (`rtr mcp`) reuses the existing `rtr` bin resolution that
  plan 007/008 already hardened (npx fallback, PATH detection), needs zero
  new installer work, and is what agents configure once via
  `command: "npx", args: ["-y", "@cave-man/realtime-register-skills", "rtr", "mcp"]`
  or `command: "rtr", args: ["mcp"]` if already on PATH.

Measured npx overhead (warm local npm cache, this machine):
`npx -y @modelcontextprotocol/inspector --cli ...` completed in **~670 ms**
end-to-end (spawn npx, resolve/cache-hit the inspector package, connect
stdio, round-trip `tools/list`). A registry metadata round-trip alone
(`npm view <pkg> version`) took **~410 ms** of that — i.e. most of the "cold"
cost is the npx→registry handshake, not the server's own startup (the
server's `await server.connect(transport)` returns as soon as stdio is
wired, which is sub-50ms once Node has started). This machine's npx package
cache was warm (already used earlier in this session), so it reflects
"already resolved once, same day" latency rather than a true never-run-before
cold start; a genuinely cold npx run additionally waits on install (this
package's own footprint, see §2). Rerunning `rtr mcp` via an already-on-PATH
`rtr` binary (no npx step) pays none of this — another point in favor of the
subcommand once `rtr` is installed once via plan 007's installer.

## 2. SDK weight: node_modules footprint

`spikes/mcp-server/node_modules` after `npm install`:

```
24M	node_modules total
5.8M	node_modules/@modelcontextprotocol
93 top-level packages
```

The SDK pulls in `express@5`, `hono@4`, `zod@3||4`, `jose@6`,
`eventsource`, `cors`, `express-rate-limit`, `pkce-challenge`, and others —
it's designed to serve HTTP/SSE transports too, not just stdio, so the full
dependency graph is heavier than a stdio-only use case strictly needs (this
repo would only ever use `server/index.js` + `server/stdio.js` +
`types.js`).

**Verdict: acceptable, but worth isolating.** 24 MB added to the *main*
package's install would roughly triple `rtr`'s current footprint (the root
`node_modules` today holds ~109 packages for `commander` + `yaml` + `ajv` +
`ajv-formats` + build tooling). Two options for the follow-up plan:

- Accept it — most agent-tool users already have `express`/`zod` duplicated
  many times over in their global npm cache; disk cost is real but not
  exceptional for a dev dependency.
- Prefer a **lazy-load**: `rtr mcp` dynamically `import()`s the SDK only
  when that subcommand runs, and the SDK is an optional dependency the
  installer nudges users to add on demand (`npm install --no-save` at first
  `rtr mcp` invocation, similar to how some CLIs bootstrap themselves) — more
  complex, likely overkill for a v1.

Either way: root `package.json` `dependencies` must gain
`@modelcontextprotocol/sdk` in the *follow-up* plan (this spike plan
explicitly keeps it spike-scoped, per the STOP/scope rules — verified
`git diff package.json` is clean, see Step 5 below).

## 3. Tool surface: is list/describe/validate enough, or is `search` needed?

**`rtr_list`'s full, unfiltered output is 23,916 bytes (~5,979 tokens at a
~4-chars/token estimate) across all 109 operations.** That comfortably fits
in a single tool-call result for any current-generation agent context
window — it is not a "dump the whole spec and let the model regex it"
problem the way, say, a 500-endpoint OpenAPI file would be. Filtered by
category (e.g. `domains`, 13 operations) the payload is a few hundred bytes.

**Recommendation: list/describe/validate are enough for v1; do not add
`search` yet.** Reasoning:

- An agent doesn't need free-text search over summaries/gotchas when it can
  cheaply pull the *entire* `rtr_list` table (~6k tokens) once per session
  and keep it in context, then `rtr_describe` the one or two operations it
  actually needs. That's cheaper in round-trips than a `search` tool the
  agent would have to guess query terms for.
- `rtr_list`'s existing `category` filter already covers the common
  narrowing case (16 categories, 2–17 operations each).
- If the spec grows meaningfully past ~200 operations, the calculus changes
  (unfiltered `rtr_list` would approach ~2x today's token cost) — the
  follow-up plan should re-measure at that point rather than pre-optimize
  now (YAGNI).
- A `search` tool would need its own relevance design (substring? fuzzy?
  which fields?) — real work that isn't justified by current payload size.

## 4. Per-tool registration snippets

Syntax below matches each tool's current documented MCP config format.
These assume the follow-up plan ships `rtr mcp` as a subcommand (§1); swap
`args` if the follow-up instead ships a 4th bin or separate package.

**Claude Code** — project-scoped `.mcp.json` (or `claude mcp add`):

```json
{
  "mcpServers": {
    "realtime-register": {
      "command": "npx",
      "args": ["-y", "@cave-man/realtime-register-skills", "rtr", "mcp"]
    }
  }
}
```

Equivalent one-liner: `claude mcp add realtime-register -- npx -y @cave-man/realtime-register-skills rtr mcp`.

**Codex CLI** — `~/.codex/config.toml`:

```toml
[mcp_servers.realtime-register]
command = "npx"
args = ["-y", "@cave-man/realtime-register-skills", "rtr", "mcp"]
```

**Cursor** — `.cursor/mcp.json` (project) or the global equivalent:

```json
{
  "mcpServers": {
    "realtime-register": {
      "command": "npx",
      "args": ["-y", "@cave-man/realtime-register-skills", "rtr", "mcp"]
    }
  }
}
```

**Gemini CLI** — `.gemini/settings.json` (project) or `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "realtime-register": {
      "command": "npx",
      "args": ["-y", "@cave-man/realtime-register-skills", "rtr", "mcp"]
    }
  }
}
```

All four use the same `command`/`args` shape (Claude Code, Cursor, and
Gemini CLI share the `mcpServers` JSON key verbatim; Codex uses TOML with an
equivalent `[mcp_servers.<name>]` table) — a single generated snippet with
per-tool wrapping is realistic for the installer (plan 007) to template,
the same way it already templates skill pointer files. These are ready to
adapt into the README once the follow-up plan ships the real server; treat
the exact `args` array as provisional until that plan picks bin vs
subcommand vs package (§1).

## 5. Open questions + recommended follow-up plan scope

**Fingerprint / spec-version skew (explicitly asked):** yes,
`rtr_describe` should include the operation's fingerprint from
`src/lib/integrity.ts` (`fingerprintOperation(op)`). Rationale: an agent
that cached a `rtr_describe` payload from an older install of this package
has no way to detect the spec changed underneath it — `rtr_validate` would
silently validate against stale required-field rules. Adding
`fingerprint: fingerprintOperation(op)` (and maybe `specVersion:
spec.shared.version`) to the payload costs nothing (already computed,
already deterministic, already used for the audit's fidelity lock) and
gives agents a cheap staleness check: re-`rtr_describe` if the fingerprint
they hold differs from a freshly-fetched one. This spike's `describePayload`
does **not** yet include it (kept the payload identical to
`describe --format json`'s shape per the plan's instruction to reuse it
verbatim); the follow-up plan should add it to both `describe --format
json` and `rtr_describe` in lockstep so the two stay one contract.

**Other open questions for the follow-up plan:**

- **Error surfacing convention.** This spike returns `isError: true` +
  a text content block for unknown operationId/tool name. Worth confirming
  against whatever MCP client behavior differs (Claude Code vs Cursor) —
  not verified in this spike (no client-side test, only server-side +
  inspector CLI).
- **`rtr_validate`'s `body`/`query`/`pathParams` typing.** The spike's
  `inputSchema` declares these as `{ type: "object" }` with no `properties`
  — deliberately loose, since the actual shape depends on `operationId`
  (unknown until runtime). This means the client-side tool-call UI (where
  agents render tool schemas to users) won't show field hints for what to
  put in `body`. No clean fix within JSON Schema's static nature; document
  it as a known limitation rather than solve it in the follow-up plan.
- **Auth**: this spike's tools never touch the actual Realtime Register API
  (no `authScope`-gated network calls) — they only read the local spec and
  validate against schemas. If the follow-up plan ever adds a tool that
  *executes* API calls (not in scope per plan 009's "Out of scope"), that's
  a materially different trust boundary (API key handling inside an MCP
  server) needing its own security review.
- **Testing the MCP server itself.** This spike is verified by the
  transcript below, not automated CI, per the plan's test-plan note. The
  follow-up plan should decide whether to add a vitest-based stdio
  integration test (spawn the server, drive it via the same JSON-RPC frames
  `smoke-test.mjs` uses) once the server ships for real.

**Recommended follow-up plan scope:** ship `rtr mcp` as a subcommand
(§1), move `@modelcontextprotocol/sdk` to root `dependencies`, port
`spikes/mcp-server/server.mjs` into `src/cli/commands/mcp.ts` (+ a
`src/lib/mcp-tools.ts` for the tool definitions, kept separate per this
repo's small-files convention), add the fingerprint field to both JSON
payloads, add the registration snippets above to README, and add an
integration test spawning the real command.

## Step 3 transcript (recorded evidence)

### `tools/list` via `@modelcontextprotocol/inspector` CLI

```
npx -y @modelcontextprotocol/inspector --cli node spikes/mcp-server/server.mjs --method tools/list
```

```json
{
  "tools": [
    {
      "name": "rtr_list",
      "description": "List Realtime Register REST API operations, optionally filtered by category.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "category": { "type": "string", "description": "Category name (e.g. domains). Omit for all categories." }
        }
      }
    },
    {
      "name": "rtr_describe",
      "description": "Return the full reference contract for one operation: params, request body, derived JSON Schemas, and the shared auth block.",
      "inputSchema": {
        "type": "object",
        "properties": { "operationId": { "type": "string", "description": "e.g. createDomain" } },
        "required": ["operationId"]
      }
    },
    {
      "name": "rtr_validate",
      "description": "Validate a request body/query/pathParams against an operation's JSON Schema using ajv, in-process.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "operationId": { "type": "string" },
          "body": { "type": "object" },
          "query": { "type": "object" },
          "pathParams": { "type": "object" }
        },
        "required": ["operationId"]
      }
    }
  ]
}
```

### `tools/call rtr_validate` — valid vs invalid body, via inspector CLI

Valid (`{"customer":"CUST-1","registrant":"CUST-1"}`):

```json
{ "content": [{ "type": "text", "text": "{\n  \"valid\": true,\n  \"errors\": []\n}" }] }
```

Invalid (missing `registrant`):

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"valid\": false,\n  \"errors\": [\n    {\n      \"where\": \"body\",\n      \"instancePath\": \"\",\n      \"message\": \"must have required property 'registrant'\"\n    }\n  ]\n}"
    }
  ]
}
```

### Raw stdio JSON-RPC driver (`spikes/mcp-server/smoke-test.mjs`)

Full `initialize` → `tools/list` → three `tools/call`s, independent of the
inspector CLI wrapper:

```
=== initialize ===
{
  "protocolVersion": "2025-06-18",
  "capabilities": {
    "tools": {}
  },
  "serverInfo": {
    "name": "rtr-mcp-spike",
    "version": "0.0.0"
  }
}

=== tools/list ===
[
  "rtr_list",
  "rtr_describe",
  "rtr_validate"
]

=== tools/call rtr_describe(createDomain) ===
{
  "operationId": "createDomain",
  "method": "POST",
  "authScheme": "ApiKey"
}

=== tools/call rtr_list(category=domains) ===
13 operations returned

=== tools/call rtr_validate(createDomain, missing registrant) ===
{
  "valid": false,
  "errors": [
    {
      "where": "body",
      "instancePath": "",
      "message": "must have required property 'registrant'"
    }
  ]
}
```

`rtr_describe(createDomain)`'s full payload (elided above to
`operationId`/`method`/`authScheme` for readability) is byte-identical in
shape to `node bin/rtr.js describe createDomain --format json`'s output —
confirming the "reuse `describe --format json`'s payload shape as the
`rtr_describe` contract" maintenance note holds today.

## Reproducing this spike

```bash
npm run build                              # compile src/ -> dist/, from repo root
cd spikes/mcp-server && npm install        # pulls @modelcontextprotocol/sdk, ajv, ajv-formats
node smoke-test.mjs                        # raw stdio transcript (this doc's transcript)
npx -y @modelcontextprotocol/inspector --cli node server.mjs --method tools/list
```
