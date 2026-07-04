# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] — 2026-07-04

### Added

- Added: rtr describe --format json (machine-readable operation contract incl. derived JSON Schemas and auth block).
- Added: authentication contract (ApiKey header) in _shared.yaml, SKILL.md, and all generated references; Basic/session auth flagged deprecated.
- Added: spec audit now validates method/type/path values, enforces the billable invariant, and verifies a fidelity fingerprint lock (assets/spec/_fingerprints.json).
- Added: test coverage for schema derivation (all-operations Ajv compile gate), reference generation (committed-references sync check), the validate CLI, and loader error paths.
- Added: skill install targets for the agentskills.io standard dir (Codex/Gemini/Augment), Gemini CLI, Codex CLI; --pointer generates .junie/AGENTS.md, .github/copilot-instructions.md, .cursor/rules/*.mdc and AGENTS.md pointer blocks; SKILL.md documents the npx fallback when rtr is not on PATH.
- Added: npm run verify one-command gate; AGENTS.md/CLAUDE.md for agent contributors.

### Fixed

- Fixed: createDnsZone now declares billables, so the documented BillableAcknowledgmentNeededException resubmit passes rtr validate.
- Fixed: getDcvEmails, resendDcv, scheduleValidationCall and sendSubscriberAgreement pointed at nonexistent /v2/ssl/certificates/... paths; corrected to the live process-scoped endpoints.
- Fixed: field-level reconciliation of 21 operations against live docs — requestCertificate customer/san, generateAuthKey body, contact verifications, brand contact/replyTo emails, ACME update fields, quote/fields query params.
- Fixed: weekly drift check now actually compares required body fields; scraper surfaces parse failures instead of defaulting to GET.
- Fixed: 24 path/method corrections from the first real live-docs diff (revoke/cancel are DELETE, exchangerates/registryAccounts/import/authkey paths, param renames); non-diffable doc pages now marked liveDiff: false.
- Fixed: downloadCertificate path/pathParams renamed {id} → {certificateId} to match the live docs page's URL-fields table.
- Fixed: getBrandTemplate no longer declares a nonexistent locale query param; live docs only list fields.

### Security

- Security: resolved high-severity advisories in transitive deps (fast-uri via ajv, undici via cheerio).

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

[Unreleased]: https://github.com/makafeli/realtime-register/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/makafeli/realtime-register/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/makafeli/realtime-register/releases/tag/v0.2.2
[0.2.1]: https://github.com/makafeli/realtime-register/releases/tag/v0.2.1
[0.2.0]: https://github.com/makafeli/realtime-register/releases/tag/v0.2.0
[0.1.0]: https://github.com/makafeli/realtime-register/releases/tag/v0.1.0
