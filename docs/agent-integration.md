# Agent integration guide

This package is a dual-purpose artefact: a CLI for humans and a structured
context bundle for AI agents. This document covers the agent-facing surface.

## Loading the skill

Two files are the entry points:

- **`SKILL.md`** — front-matter-tagged skill card. Loaded first; tells the
  agent *when* to activate the skill and lists hard rules.
- **`references/*.md`** — one file per category (16 total), generated from the
  YAML spec. Loaded lazily by category, not all at once.

## Authentication

- Authenticate every REST request with the header `Authorization: ApiKey <your-api-key>`. API keys are generated in the Realtime Register portal.
- There is NO `X-API-KEY` header in this API. Never use it.
- Basic (password-based) authentication is DEPRECATED upstream. Never suggest or generate it.
- Session authentication (`Authorization: Session <key>`) and `POST /v2/session` are deprecated in favor of API keys. Do not use.
- Customer-scope and gateway-scope endpoints (`authScope` on each operation) require different API keys. Never mix them.

A typical agent loader:

```ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const skillRoot = require.resolve("realtime-register/SKILL.md", { paths: [process.cwd()] });
const root = dirname(skillRoot);

const skill = readFileSync(skillRoot, "utf8");
const categories = readdirSync(join(root, "references"))
  .filter((f) => f.endsWith(".md"))
  .map((f) => ({ name: f.replace(/\.md$/, ""), path: join(root, "references", f) }));
```

## Recommended retrieval strategy

1. Always include `SKILL.md` in the system context — it is small (~60 lines)
   and enforces wire-format rules the agent must never violate.
2. Index `references/*.md` by `operationId` and category label. The generated
   Markdown is structured with stable `###` headings per operation, so a
   simple regex (`^### \`([A-Za-z]+)\``) is sufficient for splitting.
3. Retrieve the single relevant operation block on demand, rather than
   loading entire categories, to keep context windows small.

## Hard rules (excerpt from `SKILL.md`)

The following rules must be surfaced to the agent verbatim. Violating them
produces requests the API rejects:

- Auth header is **`Authorization: ApiKey <key>`** — never `X-API-KEY`, never
  `Basic` (deprecated upstream), never session keys.
- Wire format is **camelCase**. No exceptions.
- `period` is always in **months** (12 = one year).
- Contact roles are **ADMIN**, **BILLING**, **TECH** only.
- DNSSEC uses `keyData` XOR `dsData` — never both.
- `renewDomain` requires the current `expiryDate`; omitting it is a schema
  error, not a runtime one.
- Registry-account endpoints (`authScope: gateway`) need gateway credentials
  distinct from customer credentials.
- Never invent enum values; defer to `_shared.yaml` or `rtr describe`.

## Programmatic validation

Agents should validate every outgoing request body before issuing the HTTP
call. Two equivalent paths:

### Shell

```bash
rtr validate registerDomain --body /tmp/body.json
```

Exit code `0` = safe to send; exit code `1` = do not send, surface the AJV
errors to the user.

### Library (Node)

```ts
import { buildSchema, loadSpec } from "realtime-register/dist/lib/schema.js";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const spec = await loadSpec();
const schema = buildSchema(spec, "registerDomain");
const ajv = addFormats(new Ajv({ allErrors: true, strict: false }));
const validate = ajv.compile(schema);

if (!validate(body)) {
  throw new Error(`Schema violation: ${ajv.errorsText(validate.errors)}`);
}
```

## The async-mutation pattern

Most mutating endpoints return HTTP 202 with `{ processId }`. The correct
agent behaviour is:

1. POST the mutation.
2. Capture `processId` from the response.
3. Poll `GET /v2/processes/{processId}` every 2–5 seconds.
4. Succeed when `status === "COMPLETED"`; abort on `FAILED`.

The `processes` category's `getProcess` operation documents the full state
machine.

## The billable-acknowledgment pattern

Billable mutations (register, renew, transfer, restore, SSL issuance …)
return HTTP 400 with `BillableAcknowledgmentNeededException` on first call.
The response contains a `billables` array. Re-submit the request with that
array attached verbatim at the top level:

```json
{
  "registrant": "…",
  "period": 12,
  "billables": [
    { "product": "domain-register-com", "action": "register", "quantity": 1 }
  ]
}
```

The schema for `billables` is defined in `_shared.yaml` under `Billable`.

## Updating the skill

When RTR ships an upstream doc change:

1. `rtr scrape <operationId>` — fetch the updated HTML.
2. Diff the printed skeleton against `assets/spec/<category>.yaml`.
3. Edit the YAML to reconcile.
4. `rtr generate --category <name>` — rebuild the Markdown reference.
5. `rtr doctor` — sanity-check all URLs.

Bump the `version` field in `_shared.yaml` and add a `CHANGELOG.md` entry.
