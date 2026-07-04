# Handover — `realtime-register`

Last updated: **2026-04-17** · Savepoint: **v0.2.2** · Repo:
<https://github.com/makafeli/realtime-register> · npm:
<https://www.npmjs.com/package/@cave-man/realtime-register-skills>

This document is the canonical technical memory for the project. It is written
for a developer taking over from cold — it assumes no prior conversation
context. After reading it end-to-end you should be able to clone the repo,
build it, ship a spec change, and understand why every architectural choice
was made.

If you are an AI agent looking to *consume* the skill, read `SKILL.md` first.
This file is for people (or agents) who *maintain* the skill.

---

## 1. Project genesis & status

### What this project is

A hand-curated, fidelity-verified specification and CLI for the
[Realtime Register](https://www.realtimeregister.com) REST API v2. It exists
because the upstream HTML docs at
<https://dm.realtimeregister.com/docs/api> are authoritative but not
machine-readable, and the official TypeScript SDK is a client library, not a
contract. This project bridges that gap with a YAML spec that is:

- Small enough to hand-audit.
- Rigorous enough to drive runtime JSON-Schema validation.
- Structured enough for AI agents to retrieve per-operation.

### The "100 % Verified" milestone

As of v0.1.0, **all 109 non-SiteLock operations across 16 categories carry
`verified: docs`**. Concretely this means, for every operation:

- `path` matches the page's rendered endpoint template.
- `pathParams` names match the page's `URL fields` table.
- `queryParams` names and types match the `Request parameters` table.
- `requestBody.fields` names, types, required flags, and enums match the
  `Request content` table.
- `docUrl` resolves HTTP 200 (`rtr doctor`).

Counts by category (sum = 109):

| Category        | Ops | Notes                                                 |
| --------------- | --- | ----------------------------------------------------- |
| `domains`       | 13  | 11 customer + 2 gateway                               |
| `hosts`         | 5   | Host (nameserver) CRUD                                |
| `contacts`      | 11  | Contact CRUD + validation handlers                    |
| `dnsZones`      | 9   | `{zoneId}`-scoped; `/stats`; process `ack-ds-update`  |
| `dnsTemplates`  | 5   | Customer-scoped: `/v2/customers/{customer}/dnstemplates/{template}` |
| `validation`    | 2   | `/v2/validation/categories/{categoryName}`            |
| `ssl`           | 17  | Certificate lifecycle + product catalog               |
| `sslAcme`       | 7   | ACME subscription lifecycle                           |
| `notifications` | 5   | Subscription management                               |
| `processes`     | 5   | Async process polling                                 |
| `customers`     | 2   | Customer info                                         |
| `brands`        | 10  | Brand CRUD + mail templates + locales                 |
| `financial`     | 4   | Financial summaries                                   |
| `tlds`          | 2   | TLD metadata                                          |
| `providers`     | 7   | Providers + gateway-only registry accounts            |
| `misc`          | 5   | IsProxy + 4 ADAC WebSocket actions                    |

### How we got here (abridged history)

1. **Bootstrapped from SDK** — initial spec was scaffolded from the public
   TypeScript SDK; every op landed with `verified: sdk`.
2. **Slug reconciliation** — all 109 `docUrl` slugs cross-checked against the
   live nav, fixing a handful of mis-slugged ACME / validation / process
   entries.
3. **Field-level promotion** — each category was re-scraped via
   `scripts/extract-fields.mjs`, URL fields / request params / request
   content tables diffed against the YAML. Material corrections include:
   - `dnsZones`: `{name}` → `{zoneId}` (integer); `/statistics` → `/stats`;
     `ack-ds-update` moved to `/v2/processes/{processId}/ack-ds-update`.
   - `dnsTemplates`: paths rescoped to `/v2/customers/{customer}/dnstemplates/{template}`;
     SOA fields (`hostMaster`, `refresh`, `retry`, `expire`, `ttl`) marked
     required; non-existent `dnssec` field dropped.
   - `brands`: `createBrand` picked up `hideOptionalTerms`, `contactUrl`;
     required flags corrected on organisation/address fields;
     `privacyContact`/`abuseContact` switched from email format to contact
     handles; non-existent `name`/`mailServer` removed.
   - `validation`: path corrected to
     `/v2/validation/categories/{categoryName}`; added `fields` query param.
4. **Doctor pass** — `rtr doctor` across all 109 slugs, every one HTTP 200.
5. **Docs build-out** — README, SKILL, docs/, CHANGELOG, CONTRIBUTING.
6. **Public release** — repo created at `makafeli/realtime-register` and
   pushed as `main` @ `d23771d`.

### Out of scope (intentionally)

- **SiteLock** — separate product, different auth, different contract.
  Excluded from the spec and all tooling.
- Any endpoint flagged **Internal** in the HTML docs.
- Runtime HTTP client code. This project generates schemas and docs; actual
  API calls are the consumer's responsibility.

---

## 2. Core architecture — Single Source of Truth

The entire project radiates out of `assets/spec/`. Every other artefact is
derived; nothing else should be hand-edited.

```
                          assets/spec/
                          ├── _shared.yaml   (enums + reusable types)
                          └── *.yaml         (16 category files)
                                │
                                │   load + parse (src/lib/spec.ts)
                                ▼
                       in-memory Spec model
                                │
         ┌──────────────────────┼─────────────────────────────┐
         ▼                      ▼                             ▼
  src/lib/schema.ts      src/cli/commands/generate.ts   src/cli/commands/
  (JSON Schema via              │                        list/describe/
   ajv + ajv-formats)           │                        scrape/doctor
         │                      ▼                             │
         ▼               references/*.md                      ▼
  rtr validate           (generated MD,                 terminal output
                          commit in same PR
                          as YAML edits)
```

Key invariants enforced by this design:

- **No duplicate source of truth.** `references/*.md` are always regenerated
  from YAML; never hand-edit them.
- **Schemas are derived, not written.** The ajv schema for any operation is
  a pure function of the YAML entry.
- **CamelCase is structural.** Field names across the spec, schemas, and
  generated docs are camelCase; any deviation is a bug.
- **Shared types live in `_shared.yaml`.** Cross-category references (via
  `ref:`) resolve against that file; `scripts/audit-refs.mjs` catches any
  dangling reference.

### Source tree orientation

```
realtime-register/
├── SKILL.md                  # agent entry point (activation + hard rules)
├── README.md                 # human entry point
├── HANDOVER.md               # you are here
├── CHANGELOG.md              # Keep-a-Changelog
├── CONTRIBUTING.md           # PR workflow
├── LICENSE                   # MIT
├── package.json              # Node 20.11+, "type": "module", bin=rtr
├── tsconfig.json             # emits into dist/
├── bin/rtr.js                # rtr shim: resolves dist/ in prod, src/ in dev
├── bin/skills.js             # skills shim (installer entry point)
├── src/
│   ├── cli/
│   │   ├── index.ts          # rtr commander wiring
│   │   ├── install-entry.ts  # skills commander wiring + rtr pass-through
│   │   └── commands/{list,describe,validate,generate,scrape,doctor,install,uninstall}.ts
│   └── lib/
│       ├── spec.ts           # YAML loader + Spec model
│       ├── schema.ts         # YAML → JSON Schema (ajv-compatible)
│       ├── scraper.ts        # HTML fetch + cheerio parse
│       ├── skill-paths.ts    # installer target detection (Claude/Augment/local)
│       ├── package-version.ts# single source of truth for rtr/skills --version
│       └── types.ts          # TS types for Spec / Operation
├── assets/spec/              # source of truth (§2)
├── references/               # generated per-category MD (do not hand-edit)
├── scripts/                  # maintenance utilities (§5)
│   ├── audit-refs.mjs        # static spec sanity checks (16/109)
│   ├── extract-fields.mjs    # cheerio scraper over cached HTML
│   ├── reconcile-sdk.mjs     # legacy SDK ↔ nav reconciler (archaeology)
│   └── diff-live.mjs         # weekly drift probe (backs drift.yml)
├── tests/                    # vitest suites (§5.2)
│   ├── spec.test.ts          # YAML loader + helpers
│   ├── skill-paths.test.ts   # target detection + payloads
│   └── install.test.ts       # end-to-end install/uninstall round-trip
├── .github/workflows/
│   ├── ci.yml                # build/lint/audit/test on Node 20 & 22
│   ├── release.yml           # tag-triggered npm publish --provenance
│   └── drift.yml             # weekly drift job; opens fidelity-drift issue
├── docs/                     # long-form docs (agent / CLI / spec / fidelity)
└── dist/                     # tsc output (gitignored)
```

---

## 3. Execution & development

### 3.1 Local setup

Requirements: **Node.js 20.11+**, npm, git.

```bash
git clone https://github.com/makafeli/realtime-register.git
cd realtime-register
npm install
npm run build     # tsc → dist/
node bin/rtr.js --help
```

Available npm scripts:

| Script                   | Runs                                    |
| ------------------------ | --------------------------------------- |
| `npm run build`          | `tsc -p tsconfig.json`                  |
| `npm run dev`            | `tsc --watch`                           |
| `npm run lint`           | `tsc --noEmit`                          |
| `npm run audit`          | `node scripts/audit-refs.mjs`           |
| `npm run doctor`         | `node bin/rtr.js doctor`                |
| `npm run generate`       | `node bin/rtr.js generate`              |
| `npm test`               | `vitest run` (22 tests across 3 files)  |
| `npm run prepublishOnly` | `npm run build` (guard for `npm publish`) |

### 3.2 CLI reference with examples

All six commands operate on `assets/spec/`. Only `scrape` and `doctor`
access the network (HTTPS to `dm.realtimeregister.com`).

#### `rtr list`

```bash
$ rtr list --category domains
domains    GET   /v2/domains                          listDomains      docs
domains    GET   /v2/domains/{domainName}             getDomain        docs
domains    POST  /v2/domains/{domainName}             createDomain     docs
...
```

Columns: category · method · path · operationId · `verified` marker.

#### `rtr describe <operationId>`

```bash
$ rtr describe createDomain
createDomain  POST /v2/domains/{domainName}   async
  docUrl: https://dm.realtimeregister.com/docs/api/domains/create
  authScope: customer
  path params:
    - domainName (string, required)
  request body:
    - registrant       string   required
    - period           integer  required   (months; 12 = one year)
    - ns               string[]
    - privacyProtect   boolean
    - billables        Billable[]
  errors: InvalidParameter, DomainAlreadyRegistered,
          BillableAcknowledgmentNeeded
  gotchas:
    - period is in months (12 = one year), never years
    - first call may 400 with BillableAcknowledgmentNeeded;
      resubmit with billables[]
```

Authoritative pre-flight reference before writing client code.

#### `rtr validate <operationId>`

```bash
$ cat > /tmp/register.json <<'JSON'
{ "registrant": "H1234567", "period": 12, "ns": ["ns1.example.com"] }
JSON
$ rtr validate createDomain --body /tmp/register.json
OK
$ echo $?
0
```

Flags: `--body <file>`, `--query <file>`, `--path-params <file>`
(combinable). Exit codes: `0` pass · `1` any failure (schema violation,
unknown operationId, or missing file). Validation uses `ajv` + `ajv-formats`
(`email`, `uri`, `date`, `date-time`, `ipv4`, `ipv6`).

#### `rtr generate`

```bash
$ rtr generate                    # all 16 files
$ rtr generate --category ssl     # one
$ rtr generate --out build/ref    # alternate destination
```

Commit the regenerated `references/*.md` in the same PR as the YAML change
that caused the regen.


#### `rtr scrape <operationId>`

Fetch the live HTML doc and print a YAML-shaped skeleton derived from the
page's `URL fields`, `Request parameters`, and `Request content` tables.

```bash
$ rtr scrape createDomain
# URL fields:
#   - domainName (string, required)
# Request parameters: (none)
# Request content:
#   - registrant   string   required
#   - period       integer  required
#   ...
```

Nothing is written to disk. Diff the output against the corresponding YAML
entry when reconciling upstream drift.

#### `rtr doctor`

```bash
$ rtr doctor
OK  200 listDomains        https://dm.realtimeregister.com/docs/api/domains/list
OK  200 getDomain          https://dm.realtimeregister.com/docs/api/domains/get
...  (109 lines total)
```

Exits non-zero on the first non-200. Use `--category <name>` for a subset.
CI should run this on every push.

### 3.3 Typical day-to-day workflow

**Spec change** (e.g. upstream adds a new field):

```bash
node bin/rtr.js scrape <operationId>          # 1. pull fresh live shape
$EDITOR assets/spec/<category>.yaml           # 2. reconcile YAML
npm run build                                 # 3. ensure schema still builds
node scripts/audit-refs.mjs --update-lock     # 4. re-lock the fidelity fingerprint
node scripts/audit-refs.mjs                   # 5. counts/checks sanity, problems: 0
node bin/rtr.js doctor                        # 6. all 200s
node bin/rtr.js generate                      # 7. regen references/
git add assets/spec references CHANGELOG.md   # 8. commit together, including the lock
```

**CLI change** (e.g. new `--format json` on `list`):

```bash
$EDITOR src/cli/commands/list.ts
npm run build
node bin/rtr.js list --format json            # manual smoke test
$EDITOR CHANGELOG.md                          # add under [Unreleased]
```

---

## 4. Agent skill logic

The project is designed to be loaded as an **AI Agent Skill**. The
skill-shaped surface is small on purpose.

### `SKILL.md` — the entry point

`SKILL.md` has YAML front-matter containing `name:` and `description:`,
followed by markdown sections describing *when* the skill should activate,
the workflow steps, and a set of **hard rules**. It is intentionally short
(~60 lines) so it can live in an agent's system context permanently.

### Retrieval strategy (recommended)

1. Always include `SKILL.md` in system context.
2. Index `references/<category>.md` by `operationId`; load one file when a
   matching operation is needed.
3. Before emitting any HTTP call, validate the payload via
   `rtr validate <operationId> --body …` (exit `0` = safe to send).

### Hard rules (non-negotiable)

These are surfaced in `SKILL.md` and must be propagated to any downstream
agent verbatim. Violating them produces requests the API rejects:

- **CamelCase wire format.** Never `snake_case`, never `kebab-case`.
- **`period` is always in months.** 12 = one year. Never pass years.
- **Contact roles are `ADMIN`, `BILLING`, `TECH` only.**
- **DNSSEC uses `keyData` XOR `dsData`.** Never both.
- **`renewDomain` requires the current `expiryDate`.** Never omit.
- **Registry-account endpoints** (`authScope: gateway`) need gateway
  credentials distinct from customer credentials — never mix.
- **Never invent enum values.** Defer to `_shared.yaml` or `rtr describe`.

### Two API patterns every agent must implement

**Async mutation pattern.** Most mutating endpoints return HTTP 202 with
`{ processId }`. The agent must poll `GET /v2/processes/{processId}` every
2–5 s until `status === "COMPLETED"` (or `FAILED`). Operations requiring
this carry `async: true` in the YAML.

**Billable acknowledgment pattern.** Billable mutations (register, renew,
transfer, restore, SSL issuance …) return HTTP 400 with
`BillableAcknowledgmentNeededException` on the first call. The response
contains a `billables: [{product, action, quantity}]` array. Re-submit the
same request body with that array copied verbatim at the top level; the
second call succeeds. The `Billable` shape lives in `_shared.yaml`.

### Fidelity markers (recap)

- `verified: docs` — path, params, fields reconciled with live HTML.
- `verified: sdk` — only SDK-derived; not yet diffed against HTML.

As of v0.1.0, all 109 ops are `docs`. New ops added after v0.1.0 should
land as `sdk` and be promoted before the next minor release.

---

## 5. Tooling, scripts, tests & CI

The `scripts/` directory holds maintenance utilities that are not part of
the shipped CLI. All are plain `.mjs` and need no TypeScript build.

### 5.1 `scripts/audit-refs.mjs`

Static sanity check of the full spec. Run before every release. `npm run
audit` builds first (`tsc`) since the script imports the compiled
`dist/lib/spec.js` and `dist/lib/integrity.js`.

```bash
$ npm run audit
=== RTR spec audit ===
categories: 16
operations: 109
  brands           10
  contacts         11
  ...
problems: 0
```

Checks performed:

- Presence of required top-level keys (`operationId`, `method`, `path`,
  `docUrl`, `authScope`, `summary`, `async`).
- `method` is one of `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `REFERENCE`
  (`REFERENCE` is reserved for `metadataOverview`, a documentation-only
  entry with no HTTP endpoint).
- `docUrl` starts with `/` and contains no whitespace.
- `path` starts with `/v2/`, `wss://` (ADAC websocket ops), `/docs/`
  (`metadataOverview`), or `(` (`webhookNotification`'s placeholder path).
- Every `type` under a `pathParams`, `queryParams`, or `requestBody` node is
  one of `string`, `integer`, `number`, `boolean`, `array`, `object`.
- `operationId` uniqueness across all categories.
- `verified` is one of `docs`, `sdk`, `none` when present.
- Every `enumRef`/`fieldsRef`/`itemsRef` resolves to an entry in
  `_shared.yaml`.
- Billable invariant: any operation whose `errors` includes a
  `BillableAcknowledgmentNeeded*` code must declare
  `requestBody.fields.billables`.
- **Fidelity fingerprint lock** (`assets/spec/_fingerprints.json`): every
  `verified: docs` operation's canonical contract (method, path, params,
  required body fields — see `src/lib/integrity.ts`) must hash to the value
  committed in the lock. An edit to a verified operation's contract that
  isn't followed by a lock regen fails the audit, naming the operation and
  the fix: `node scripts/audit-refs.mjs --update-lock`.

Run `node scripts/audit-refs.mjs --update-lock` after any intentional,
re-verified contract edit and commit the updated lock in the same PR.

Exit 0 on clean audit, non-zero on any problem.

### 5.2 `scripts/extract-fields.mjs`

Cheerio-backed scraper. Given a local HTML cache of a docs page, prints its
`URL fields`, `Request parameters`, and `Request content` tables in a
diff-friendly form. Used during the v0.0.x → v0.1.0 reconciliation push;
kept around for bulk promotion work.

```bash
$ curl -so /tmp/brands-create.html \
    https://dm.realtimeregister.com/docs/api/brands/create
$ node scripts/extract-fields.mjs /tmp/brands-create.html
```

Prefer `rtr scrape` for one-offs; use this script when you need to diff
dozens of cached pages without re-hitting the network.

### 5.3 `scripts/reconcile-sdk.mjs`

Legacy helper that cross-referenced the initial SDK-derived spec against
the live nav to catch mis-slugged `docUrl`s. Not needed for day-to-day
work, but retained for archaeology if a future bulk re-seed is needed.

### 5.4 `scripts/diff-live.mjs`

Drift probe. Loads every operation from `assets/spec/`, fetches the
corresponding live docs page, runs it through `src/lib/scraper.ts`, and
flags any operation whose `path`, `method`, or body required-field count
has drifted from the shipped spec. Writes a JSON report to stdout and
exits non-zero on drift.

```bash
$ node scripts/diff-live.mjs        # expects dist/ to exist (npm run build)
{ "checked": 109, "drifts": [] }
```

Description and restriction strings are intentionally **not** diffed —
they evolve constantly upstream and would generate noise. This script is
the engine behind `.github/workflows/drift.yml` (§5.6); run it locally
when investigating a flagged issue.

### 5.5 `tests/` — vitest suite (`npm test`)

Three files, 22 tests. All network-free; the install round-trip uses a
temp directory under the OS `tmpdir()`.

| File                          | Coverage                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `tests/spec.test.ts`          | `loadSpec` happy path + real-spec sanity (16/109); `findOperation` miss + hit             |
| `tests/skill-paths.test.ts`   | `detectTargets` priority + env override; copy/remove payload helpers                      |
| `tests/install.test.ts`       | `bin/skills.js --version`; `install --target <tmp>` then `uninstall --target <tmp>` cycle |

Run locally before every commit that touches `src/` or `assets/`:

```bash
$ npm test
Test Files  3 passed (3)
     Tests  22 passed (22)
```

When adding a command, add a test in the matching file or create a new
`tests/<feature>.test.ts` — CI gates PRs on this suite.

### 5.6 `.github/workflows/` — CI, release, drift

Three workflows; all authored to fail **closed** (any non-success blocks
the tag path) but to skip cleanly when the environment is half-configured
(e.g. `NPM_TOKEN` absent).

| Workflow       | Trigger                              | Purpose                                                                                                     |
| -------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `ci.yml`       | push / PR on `main`                  | build, lint, audit, test across Node 20 & 22; `doctor` gated to main pushes only to spare upstream docs.    |
| `release.yml`  | tag push matching `v*.*.*`           | verifies tag matches `package.json`, runs tests + audit, then `npm publish --access public --provenance`.   |
| `drift.yml`    | schedule (Mon 03:17 UTC) + manual    | runs `rtr doctor` and `scripts/diff-live.mjs`; on drift, opens or comments on a `fidelity-drift` issue.     |

**CI-driven publish is guarded on `NPM_TOKEN`.** If the secret isn't
configured on the repo, `release.yml` emits a warning step and exits
green — tags still produce a clean release log but no npm push. Flip the
secret on to enable provenance-attested publishes without code changes.

---

## 6. Future roadmap

The v0.2.2 savepoint closes out every item the original v0.2.0 backlog
called out (packaging, CI, provenance, interactive installer, tests,
drift). What follows is the backlog the next developer should pick up, in
roughly descending priority.

### Completed since the initial handover

#### v0.2.0 — installable skill + scoped package

- ✅ **Package renamed** to `@cave-man/realtime-register-skills` (scoped,
  publishable). Version bumped to `0.2.0`.
- ✅ **Installer implemented** (`skills` bin, `install` / `uninstall` /
  `where` / `doctor` / `rtr` pass-through). Autodetects Claude Desktop
  (macOS/Windows/Linux), Claude Code CLI, Augment, and project-local
  targets; overridable via `--target` or `$REALTIME_REGISTER_SKILL_DIR`.
- ✅ **`--global` flag** triggers `npm install -g` to put `rtr` on PATH.
- ✅ **Package files list** extended to ship scripts and HANDOVER alongside
  the existing spec/references/docs/SKILL bundle.

#### v0.2.1 — republished under `@cave-man`

- ✅ First publish under the `@cave-man` npm org (0.2.0 was stranded after a
  scope migration). Functionally identical to 0.2.0, except every source
  reference to the old scope was updated.
- ✅ `rtr doctor` / fresh-install smoke tests verified against the live
  registry tarball.

#### v0.2.2 — npx fix, interactive installer, CI, drift detection

- ✅ **`npx @cave-man/realtime-register-skills <subcommand>` now resolves.**
  Added `realtime-register-skills` as a third bin alias so npx matches a
  binary under the bare scoped package name (fixes the "could not
  determine executable to run" error). Registry now exposes three bins:
  `rtr`, `skills`, `realtime-register-skills`.
- ✅ **Single-source-of-truth versioning.** `src/lib/package-version.ts`
  reads `version` from `package.json` via `createRequire`; `rtr --version`
  and `skills --version` no longer require source edits on bumps.
- ✅ **Interactive target picker.** `skills install` uses
  `@inquirer/prompts` when stdin is a TTY, no `--target` / `--yes` is
  supplied, and multiple candidate targets exist. Non-TTY / CI / piped
  input behaviour (first-match-wins) is unchanged.
- ✅ **Vitest suite** (`tests/`): 22 tests, 3 files, covers `spec.ts`
  loader, `skill-paths.ts` detection + payload helpers, and a full
  `install → uninstall` round-trip. `npm test` wired into CI.
- ✅ **GitHub Actions CI** (`.github/workflows/ci.yml`): `build`, `lint`,
  `audit`, `test` on Node 20 & 22 for every push and PR; `doctor` gated
  to main pushes only so PRs don't hammer upstream docs.
- ✅ **Release workflow** (`.github/workflows/release.yml`): tag-triggered
  (`v*.*.*`), verifies tag matches `package.json`, runs tests + audit,
  then `npm publish --access public --provenance` — guarded on
  `NPM_TOKEN` so it skips cleanly with a warning until the secret is
  configured on the repo.
- ✅ **Weekly drift detection** (`drift.yml` + `scripts/diff-live.mjs`):
  runs every Monday 03:17 UTC, scrapes every operation, diffs `path` /
  `method` / required-field count against the shipped spec. On mismatch
  it opens (or comments on) an issue labelled `fidelity-drift`.

### Short term (pre-v0.3.0)

1. **Flip CI-driven publishing on.** Add a repo secret `NPM_TOKEN` (npm
   Automation token) at
   `https://github.com/makafeli/realtime-register/settings/secrets/actions`.
   The next `v*.*.*` tag will then auto-publish with Sigstore provenance
   (instead of manual `npm publish`). The guard is already in
   `release.yml`; no workflow changes needed.
2. **First hand-fired drift run.** Trigger `drift.yml` via
   `gh workflow run drift.yml` once to confirm the scrape-and-diff path
   runs green against the current spec before the weekly cron starts
   generating issues unbidden.
3. **`rtr diff` subcommand.** Wrap `scrape` + the structured diff logic
   already in `scripts/diff-live.mjs` into a first-class CLI command so
   `sdk` → `docs` promotion becomes one step.
4. **Response-body schemas.** Currently `responses` only carries a
   `description`. Add an optional `fields` list and wire into
   `rtr validate --response`.
5. **Core schema tests.** Extend the vitest suite with a snapshot test
   that `buildSchema(spec, "createDomain")` matches a fixture, and add
   malformed-YAML tests for `src/lib/spec.ts`.

### Medium term (v0.3.0)

6. **OpenAPI export.** `rtr export --format openapi3` emitting a single
   `openapi.json` covering all 109 ops. Enables third-party codegen
   (Prisma, Kiota, openapi-typescript-codegen).
7. **JSON output mode for `rtr describe`.** `--format json` so MCP
   bridges and other tooling can consume the operation contract without
   regex-ing the human view.
8. **Parallel `rtr doctor`.** Small worker pool (concurrency ~4) to drop
   wall time from ~20 s to ~3 s; keep it behind a `--concurrency` flag
   to stay polite to upstream.

### Long term (v1.0.0)

9. **Language-agnostic skill bundle.** Publish an MCP-compatible server
   so non-Node agents can call `list` / `describe` / `validate` over
   stdio. The JSON output mode (item 7) is a prerequisite.
10. **Cross-field invariants in schemas.** Encode DNSSEC `keyData` XOR
    `dsData`, the billable-acknowledgment re-submit shape, and the other
    `gotchas` as JSON-Schema `oneOf` / `dependentRequired` so validation
    catches them instead of leaving them as prose.
11. **SiteLock integration** (scope change). Would require onboarding the
    separate SiteLock API contract; currently out of scope, tracked as a
    standing non-goal.

### Known gaps / tech debt

- `src/lib/schema.ts` does not yet model cross-field invariants (see item
  10 above). They live in `gotchas` strings and are not enforced
  programmatically.
- `rtr describe` prints a human-shaped view only (see item 7).
- `rtr doctor` is sequential (see item 8).
- `scripts/extract-fields.mjs` expects cached HTML; no caching layer of
  its own. A `--cache-dir` flag is a low-effort improvement.
- The `release.yml` workflow references `environment: npm-publish` was
  removed in favour of a secret-presence guard. If you prefer an
  environment gate (for required reviewers on publishes), add it back in
  and create the environment in repo settings.

---

## Appendix A — repository metadata

| Attribute        | Value                                                    |
| ---------------- | -------------------------------------------------------- |
| Repo             | <https://github.com/makafeli/realtime-register>          |
| Default branch   | `main`                                                   |
| Current HEAD     | `4033c38` · tag `v0.2.2` (use `git log -1 --oneline`)    |
| Licence          | MIT                                                      |
| Package name     | `@cave-man/realtime-register-skills`                     |
| Package version  | `0.2.2` (published to npm; 0.2.0 / 0.2.1 also on registry) |
| Bins on registry | `rtr`, `skills`, `realtime-register-skills`              |
| Runtime          | Node.js 20.11+                                           |
| Author           | Yasin Boelhouwer <yasin@enginebit.com>                   |
| Upstream docs    | <https://dm.realtimeregister.com/docs/api>               |
| API base URL     | `https://api.yoursrs.com`                                |
| npm page         | <https://www.npmjs.com/package/@cave-man/realtime-register-skills> |

## Appendix B — where to look next

| If you need to …                                     | Read                                          |
| ---------------------------------------------------- | --------------------------------------------- |
| Activate the skill in an agent                       | `SKILL.md`                                    |
| Understand the CLI surface                           | `docs/cli.md`                                 |
| Edit a spec entry                                    | `docs/spec-format.md`                         |
| Understand the `docs`/`sdk` markers and drift policy | `docs/fidelity.md`                            |
| Integrate from agent code                            | `docs/agent-integration.md`                   |
| Land a PR                                            | `CONTRIBUTING.md`                             |
| See what changed between versions                    | `CHANGELOG.md`                                |
| Browse operations by category                        | `references/<category>.md`                    |
| Extend the CLI                                       | `src/cli/commands/<command>.ts`               |
| Change schema derivation                             | `src/lib/schema.ts`                           |
| Add / update a test                                  | `tests/<feature>.test.ts` (see §5.5)          |
| Change a CI / release / drift workflow               | `.github/workflows/*.yml` (see §5.6)          |
| Investigate a `fidelity-drift` issue                 | `scripts/diff-live.mjs` (see §5.4)            |
| Bump `rtr` / `skills` version output                 | `package.json` only (via `src/lib/package-version.ts`) |

## Appendix C — "it's broken" flowchart

1. **`npm install` fails** → check Node version (`node -v` must be ≥ 20.11).
2. **`npm run build` fails** → run `npm run lint` to isolate type errors;
   look at the most recent edits under `src/`.
3. **`npm test` fails** → read the failing file name first; `spec.test.ts`
   means a spec/loader regression, `skill-paths.test.ts` means the
   installer's target detection drifted, `install.test.ts` means the
   end-to-end bin flow broke. None of them require the network.
4. **`rtr doctor` reports non-200** → upstream slug changed. Find the op
   in the live nav, update `docUrl` in the YAML, commit, re-run.
5. **`audit-refs.mjs` reports `problems: N`** → output names the problem.
   Common causes: duplicate `operationId`, unresolved `ref:`, mismatched
   category count.
6. **`rtr validate` fails unexpectedly** → the schema is derived from YAML;
   confirm the field actually exists on the op with `rtr describe`, and
   verify `required:` flags in the YAML match reality.
7. **`npx @cave-man/realtime-register-skills …` prints _"could not
   determine executable to run"_** → registry has a cached older version
   without the `realtime-register-skills` bin. Verify with
   `npm view @cave-man/realtime-register-skills bin` — it should list
   `rtr`, `skills`, and `realtime-register-skills`. If not, republish.
8. **`release.yml` skipped the npm publish step** → `NPM_TOKEN` secret is
   missing (intentional guard). Add it at repo settings → secrets →
   actions, re-run the workflow from the Actions UI, or cut a new tag.
9. **`drift.yml` opened a `fidelity-drift` issue** → reproduce locally
   with `node scripts/diff-live.mjs` (requires `npm run build` first).
   The report lists operations by `kind` (`method` / `path` /
   `required-count` / `fetch`). Fix the YAML, regenerate references,
   commit, and close the issue.
10. **Nothing makes sense** → `git log --oneline` is small; start from
    `d23771d` and read forward.

---

*End of handover. Questions, open issues, and drift reports go to
<https://github.com/makafeli/realtime-register/issues>.*
