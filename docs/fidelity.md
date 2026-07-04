# Fidelity policy

The purpose of this spec is to stay bit-for-bit faithful to the live Realtime
Register API documentation at `dm.realtimeregister.com/docs/api`. This
document explains how that fidelity is maintained and verified.

## The two markers

Every operation in `assets/spec/` carries a `verified` field with one of two
values:

### `verified: docs`

Path, URL parameters, query parameters, and request-content fields have been
reconciled against the live HTML. Specifically:

- `path` matches the page's rendered endpoint template.
- `pathParams` names match the `URL fields` table.
- `queryParams` names and types match the `Request parameters` table.
- `requestBody.fields` names, types, required flags, and enums match the
  `Request content` table.

As of v0.3.0 **all 109 operations carry `verified: docs`**, re-verified
field-by-field against a full crawl of the live documentation, with the full
live diff reporting zero drifts across all checkable operations.

### `verified: sdk`

Structure is derived from the public TypeScript SDK and the navigation slug,
but no HTML reconciliation has been performed on field-level data yet.
Operations in this state should be considered provisional for wire-level use.

## Invariants

The following properties hold for every operation regardless of verification
state:

- `operationId` is camelCase and globally unique (enforced by the audit).
- `path` starts with `/v2/` — with three documented exceptions the audit
  allows: ADAC WebSocket operations (`wss://…`), the `webhookNotification`
  placeholder, and the `metadataOverview` reference page (`/docs/…`).
- `method` is a real HTTP verb (or `REFERENCE` for the one doc-page
  pseudo-entry); field `type` values are from the JSON-Schema set — both
  enforced by the audit.
- `docUrl` resolves with HTTP 200 (enforced by `rtr doctor`).
- Field names are camelCase (see the camelCase rule in `SKILL.md`).
- Enum values match `_shared.yaml` where a reference is used (dangling
  `enumRef`/`fieldsRef`/`itemsRef` fail the audit).
- Billable operations (those declaring `BillableAcknowledgmentNeededException`)
  always expose a `billables` body field, so the acknowledgment resubmit
  passes validation (enforced by the audit and a vitest invariant).
- **Every `verified: docs` operation's contract hash matches the committed
  fingerprint lock** (`assets/spec/_fingerprints.json`) — see below.

## Promotion workflow (`sdk` → `docs`)

```
┌──────────────┐   rtr scrape    ┌──────────────┐   manual edit   ┌──────────────┐
│ verified:sdk │ ──────────────▶ │  HTML diff   │ ──────────────▶ │verified:docs │
└──────────────┘                 └──────────────┘                 └──────────────┘
```

Concretely:

1. `rtr scrape <operationId>` fetches the page and prints the URL fields,
   request parameters, and request content as a YAML-ready skeleton.
2. Diff against the existing entry in `assets/spec/<category>.yaml`.
3. Apply corrections: add missing fields, fix required flags, correct enum
   values, rename path params, adjust path templates.
4. Flip `verified: sdk` to `verified: docs`.
5. Run `node scripts/audit-refs.mjs --update-lock` to record the operation's
   new contract fingerprint, and commit the updated
   `assets/spec/_fingerprints.json` in the same change.
6. Run `rtr generate` to regenerate the Markdown reference (a vitest sync
   test fails CI if the committed references drift from the YAML).
7. `npm run verify` — the one-command build + lint + test + audit gate.

For bulk reconciliation, `scripts/extract-fields.mjs` can be pointed at a
local cache of HTML files (see its header comment).

## Enforcement tooling

| Tool                             | Checks                                          |
| -------------------------------- | ----------------------------------------------- |
| `node scripts/audit-refs.mjs`    | Required keys, method/path/type values, operationId uniqueness, `_shared` refs resolvable, billables invariant, **fingerprint lock** |
| `node scripts/audit-refs.mjs --update-lock` | Regenerates `assets/spec/_fingerprints.json` after a deliberate, re-verified contract edit |
| `rtr doctor`                     | Every `docUrl` returns HTTP 200                 |
| `node scripts/diff-live.mjs`     | Full live diff: scrapes every operation's doc page and compares method, path, and required-field counts (ops marked `liveDiff: false` are skipped and counted) |
| `npx vitest run`                 | 136 tests incl. an Ajv compile gate over all operations and a byte-exact references-sync check |
| `scripts/extract-fields.mjs`     | Pulls URL fields / request params / request content from cached HTML (bulk work) |
| `tsc --noEmit`                   | Type safety of the schema-derivation code       |

`npm run verify` runs build + lint + test + audit in one command; CI runs it
on every push, and `rtr doctor` additionally on pushes to `main`.

### The fingerprint lock

`assets/spec/_fingerprints.json` maps every `operationId` to a SHA-256 hash
of its canonical contract (method, path, path/query params, required body
fields — descriptions excluded). The audit recomputes the hashes on every
run: if a `verified: docs` operation's contract changed but the lock wasn't
regenerated, the audit fails and names the operation. This makes "the spec
matches what was verified" a machine-checked property instead of a promise —
editing a verified operation without re-verifying against the live docs
cannot land silently.

## Known out-of-scope endpoints

The following are **intentionally excluded** from the spec:

- **SiteLock** — separate product, different auth, different contract.
- Any endpoint flagged `Internal` in the HTML docs.

Gateway-only registry-account endpoints (`authScope: gateway`) are included
because they share customer credentials at the transport layer but require
a different API key at the application layer. They are clearly marked and
should never be invoked with customer-scope credentials.

## Drift policy

Upstream docs can change silently. The project detects drift automatically:

1. **Weekly live diff** (`.github/workflows/drift.yml`, Mondays 03:17 UTC):
   `scripts/diff-live.mjs` scrapes every operation's doc page and compares
   method, path, and required-field counts against the spec. Any mismatch
   opens (or comments on) a GitHub issue labelled `fidelity-drift`. Drift
   kinds: `method`, `path`, `required-count`, `fetch` (page unreachable), and
   `parse` — the scraper could not read the page's method/URL, which signals
   scraper maintenance rather than spec drift.
2. Doc pages that cannot be machine-diffed (ADAC WebSocket messages, the
   webhook description, the TLD metadata overview, and pages without a
   machine-readable method) are marked `liveDiff: false` in the spec and
   skipped, so the weekly run stays signal-only.
3. `rtr doctor` on every push to `main` (catches slug renames/deletions).
4. Community drift reports welcomed via GitHub issues with the
   `fidelity-drift` label.

When drift is detected, the reconciliation workflow above applies — including
the `--update-lock` step, since a reconciled contract gets a new fingerprint.
As of v0.3.0 the full live diff reports zero drifts across all checkable
operations.
