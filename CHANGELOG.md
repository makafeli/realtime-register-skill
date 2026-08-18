# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Weekly drift job auto-fixes `method`/`path` drift and opens a pull
  request.** `scripts/diff-live.mjs --fix` patches the shipped spec in place
  when the live docs disagree on the HTTP method or URL template — the only
  two drift kinds where the scraper already holds a complete, unambiguous
  replacement value — using a new format-preserving YAML editor
  (`src/lib/patch-spec.ts`) that leaves comments, spacing, and every other
  operation in the file untouched. The fingerprint lock and generated
  references are regenerated in the same commit, `npm run verify` gates the
  result before anything is proposed, and the PR (branch
  `fidelity-drift/auto-fix`, label `fidelity-drift`) always requires human
  review — nothing merges automatically. Drift the job can't safely
  auto-correct (`required-count`, `fetch`, `parse`, or a `doctor` failure)
  still opens/updates a `fidelity-drift` issue as before. See
  [`docs/fidelity.md`](docs/fidelity.md#drift-policy) for the full policy.

## [0.3.1] — 2026-07-04

Docs-only release so the npm package page reflects the 0.3.0 feature set.
No code or spec changes.

### Changed

- **Publishing switched to npm trusted publishing (OIDC)** with Sigstore
  provenance — no npm tokens in CI; the release workflow authenticates
  directly from GitHub Actions.
- **Repository URLs updated** to the renamed GitHub repo
  (`makafeli/realtime-register-skill`) in `package.json` and all docs.
- **Documentation refresh** — README, `docs/cli.md`, `docs/fidelity.md`, and
  `docs/spec-format.md` brought in line with the 0.3.0 feature set; corrected
  two long-standing doc errors (`rtr validate` exits `1`, never `2`; the spec
  format uses `enumRef`/`fieldsRef`/`itemsRef` and `fields:` mappings, not
  `ref:`/`properties:` lists).

## [0.3.0] — 2026-07-04

The trust-but-verify release: a full audit against the live Realtime Register
documentation, machine-enforced fidelity from here on, and installation into
every major agent tool.

### Added

- **Authentication contract, everywhere.** `_shared.yaml` now carries the
  auth rules — `Authorization: ApiKey <key>`, never `X-API-KEY`, Basic and
  session auth deprecated upstream — and every generated
  `references/<category>.md` opens with an Authentication section. `SKILL.md`
  leads its hard rules with the same contract, so agents can no longer guess
  wrong.
- **Fidelity fingerprint lock** (`assets/spec/_fingerprints.json`). The spec
  audit now validates method/path/field-type values, enforces the
  billables-field invariant on billable operations, and fails whenever a
  `verified: docs` operation's contract changes without re-verification.
  After a deliberate, re-verified edit:
  `node scripts/audit-refs.mjs --update-lock`.
- **`rtr describe <operationId> --format json`** — the full machine-readable
  operation contract on stdout, including the derived JSON Schemas (body,
  query, path) and the auth block. Built for MCP bridges and other tooling.
- **Multi-tool skill install.** New targets: `~/.agents/skills` (the
  agentskills.io standard read by Codex CLI, Gemini CLI, and Augment),
  `~/.gemini/skills`, `~/.codex/skills` (best effort), and `./.agents/skills`.
  A new `install --pointer` flag writes sentinel-delimited pointer blocks for
  JetBrains Junie (`.junie/AGENTS.md`), GitHub Copilot
  (`.github/copilot-instructions.md`), Cursor
  (`.cursor/rules/realtime-register.mdc`), and the
  [agents.md](https://agents.md) convention. `SKILL.md` documents the npx
  fallback for when `rtr` is not on PATH.
- **Test suite grew from 22 to 136 tests**, including an Ajv compile gate
  across all 109 operations, a byte-exact sync check between the generator
  and the committed references (editing YAML without regenerating now fails
  CI), CLI behavior tests, HTML-fixture scraper tests, and loader error paths.
- **`npm run verify`** — one-command build + lint + test + audit gate — plus
  `AGENTS.md`/`CLAUDE.md` contributor guides for coding agents.

### Fixed

- **33 operations corrected against the live documentation** after a full
  crawl of all 136 doc pages. Highlights:
  - `revokeCertificate` and `cancelProcess` are `DELETE` on the bare resource;
    the spec sent `POST` to nonexistent `/revoke` and `/cancel` paths.
  - Four SSL actions (`getDcvEmails`, `resendDcv`, `scheduleValidationCall`,
    `sendSubscriberAgreement`) pointed at invented
    `/v2/ssl/certificates/…` paths; corrected to the live process-scoped
    endpoints (`/v2/processes/{processId}/…`) and
    `/v2/ssl/dcvemailaddresslist/{domainName}`.
  - `requestCertificate` was missing the **required `customer` field** and
    named the SAN list `sans` instead of `san`; `generateAuthKey` had an
    empty request body (live requires `product` + `csr`); `addNote` sent
    `note` instead of the required `message`.
  - Contacts gained the upstream `verifications` feature, brands gained
    `contactEmail`/`replyToEmail`, ACME update gained its address/period
    fields, and `quote`/`fields` query params were added where documented.
  - Path-template/parameter renames to match the live URL-fields tables
    (`{id}` → `{certificateId}`/`{notificationId}`, `{handle}` → `{brand}`,
    exchangerates/registryAccounts/import/authkey paths,
    `retrieveDnsZone` is POST, `previewBrandTemplate` is GET).
  - `createDnsZone` now declares `billables`, so the documented
    `BillableAcknowledgmentNeededException` resubmit passes `rtr validate`.
- **The weekly drift check actually works now.** Its required-field
  comparison had never run (dead code path), URL extraction silently returned
  empty strings, and unparseable methods defaulted to `GET` — so path and
  method drift went undetected. The scraper now follows the 2026-07 docs
  markup (reads the `#method` DOM element), surfaces parse failures as
  `kind: "parse"` drifts, and non-machine-diffable doc pages (ADAC WebSocket,
  webhook, metadata overview) are marked `liveDiff: false` and skipped.
  Verified end state: the full live diff reports **zero drifts** across all
  checkable operations.

### Security

- Resolved high-severity advisories in transitive dependencies (fast-uri via
  ajv, undici via cheerio).

## [0.2.2] — 2026-04-17

### Fixed

- **`npx @cave-man/realtime-register-skills <subcommand>` now works.** Added
  `realtime-register-skills` as a third bin entry (alias of `skills`) so npx
  resolves a matching binary when invoked with the bare scoped package
  name. Previously npx errored with "could not determine executable to run"
  because no bin matched the unscoped name.

### Changed

- **CLI versions are sourced from `package.json`** via `createRequire`.
  `rtr --version` and `skills --version` now always report the published
  version; future bumps only need a single edit in `package.json`.
- **Interactive target picker.** When `skills install` is run from a TTY,
  no `--target` is supplied, and multiple candidate targets exist, the
  installer now prompts via `@inquirer/prompts` instead of printing
  instructions and exiting. Non-TTY / `--yes` / piped input is unchanged.

### Added

- **Vitest test suite** (22 tests, 3 files):
  - `tests/skill-paths.test.ts` — target detection + payload helpers.
  - `tests/spec.test.ts` — YAML loader (happy/unhappy) + real spec sanity.
  - `tests/install.test.ts` — end-to-end install/uninstall round-trip.
- **GitHub Actions CI** (`.github/workflows/ci.yml`) — runs `build`, `lint`,
  `audit`, and `test` on Node 20 & 22 for every push and PR; `doctor`
  runs only on `main` pushes to avoid hammering upstream.
- **Release workflow** (`.github/workflows/release.yml`) — triggered by a
  `v*.*.*` tag; verifies the tag matches `package.json`, then runs
  `npm publish --access public --provenance` so the published package
  carries cryptographic provenance attestations.
- **Weekly drift detection** (`.github/workflows/drift.yml` +
  `scripts/diff-live.mjs`) — every Monday 03:17 UTC it runs `rtr doctor`
  and scrapes every operation, diffing `path` / `method` / required-field
  count against the shipped spec. Any mismatch opens (or comments on) an
  issue labelled `fidelity-drift`.
- **New module** `src/lib/package-version.ts` — single source of truth for
  the CLI-reported version.

## [0.2.1] — 2026-04-17

### Changed

- **Scope migration.** Published as `@cave-man/realtime-register-skills` on
  the npm registry (the v0.2.0 tarball was the first under this scope; the
  0.2.1 bump aligns the git tag with the scoped-commit savepoint so
  `git show v0.2.1` matches what's on npm byte-for-byte).
- No API or behavioural changes since 0.2.0.

## [0.2.0] — 2026-04-17

### Changed

- **Renamed package to `@cave-man/realtime-register-skills`.** The previous
  unscoped `realtime-register` name is retired before any npm publish. The
  scoped name avoids trademark confusion with Realtime Register B.V. and
  enables the agent-skill installer UX.
- `rtr --version` now reports `0.2.0`.

### Added

- **`skills` bin** — new installer entry point invokable via
  `npx @cave-man/realtime-register-skills <subcommand>` without a prior
  install. Subcommands: `install`, `uninstall`, `where`, `doctor`, and a
  pass-through `rtr` forwarder.
- **Autodetecting installer** covering Claude Desktop (macOS/Windows/Linux),
  Claude Code CLI (`~/.claude/skills`), Augment (`~/.augment/skills`), and a
  local-project fallback (`./skills/`). Overridable with `--target <dir>`
  or `$REALTIME_REGISTER_SKILL_DIR`.
- **`--global` flag** on `install` that additionally runs
  `npm install -g @cave-man/realtime-register-skills` to put the `rtr`
  binary on PATH.
- **`--dry-run`, `--force`, `--yes` flags** on `install`; `--target`, `--all`,
  `--dry-run` on `uninstall`.
- `src/lib/skill-paths.ts` — pure, read-only target-detection helpers.
- `src/cli/commands/install.ts`, `src/cli/commands/uninstall.ts` —
  installer implementation (~230 LoC combined).
- `src/cli/install-entry.ts` + `bin/skills.js` — CLI wiring and bin shim.

### Package

- `bin` entries: `skills` → `bin/skills.js` and `rtr` → `bin/rtr.js`.
- `files` extended to ship `scripts/` and `HANDOVER.md`.
- `publishConfig.access = "public"` so the scoped package publishes as
  public by default.

## [0.1.0] — 2026-04-17

First public release.

### Added

- Hand-curated YAML spec covering **109 operations** across 16 categories of
  the Realtime Register REST API v2, excluding SiteLock.
- `rtr` CLI with six subcommands: `list`, `describe`, `validate`, `generate`,
  `scrape`, `doctor`.
- JSON Schema derivation from YAML (`ajv` + `ajv-formats`) for validating
  request bodies, query params, and path params.
- Generated Markdown reference under `references/<category>.md` — one file per
  category, authoritative for agent retrieval.
- `SKILL.md` entry point defining when the skill should activate and the
  hard rules (camelCase, `period` in months, DNSSEC XOR, etc.).
- Audit tooling: `scripts/audit-refs.mjs`, `scripts/extract-fields.mjs`,
  `scripts/reconcile-sdk.mjs`.
- Documentation set under `docs/`: agent integration, CLI, spec format,
  fidelity policy.

### Verified

- All 109 operations carry `verified: docs`: path, URL parameters, query
  parameters, and request-content fields reconciled against the live HTML at
  `dm.realtimeregister.com/docs/api`.
- `rtr doctor` confirms all 109 `docUrl` slugs resolve with HTTP 200.
- `scripts/audit-refs.mjs` reports `problems: 0`.

### Categories (109 operations total)

| Category        | Ops | Notes                                               |
| --------------- | --- | --------------------------------------------------- |
| `domains`       | 13  | Core registrar surface, incl. 2 gateway ops         |
| `hosts`         | 5   | Host (nameserver) CRUD                              |
| `contacts`      | 11  | Contact CRUD + validation handlers                  |
| `dnsZones`      | 9   | `{zoneId}`-scoped; `/stats` + process ack-ds-update |
| `dnsTemplates`  | 5   | Customer-scoped (`{customer}/dnstemplates/…`)       |
| `validation`    | 2   | Validation categories under `/v2/validation/…`      |
| `ssl`           | 17  | Certificate lifecycle + product catalog             |
| `sslAcme`       | 7   | ACME subscription lifecycle                         |
| `notifications` | 5   | Notification/subscription management                |
| `processes`     | 5   | Async process polling                               |
| `customers`     | 2   | Customer info                                       |
| `brands`        | 10  | Brand CRUD + mail templates + locales               |
| `financial`     | 4   | Financial summaries                                 |
| `tlds`          | 2   | TLD metadata                                        |
| `providers`     | 7   | Providers + gateway-only registry accounts          |
| `misc`          | 5   | IsProxy + 4 ADAC WebSocket actions                  |

[Unreleased]: https://github.com/makafeli/realtime-register-skill/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/makafeli/realtime-register-skill/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/makafeli/realtime-register-skill/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/makafeli/realtime-register-skill/releases/tag/v0.2.2
[0.2.1]: https://github.com/makafeli/realtime-register-skill/releases/tag/v0.2.1
[0.2.0]: https://github.com/makafeli/realtime-register-skill/releases/tag/v0.2.0
[0.1.0]: https://github.com/makafeli/realtime-register-skill/releases/tag/v0.1.0
