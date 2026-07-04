# AGENTS.md

## What this repo is

A verified YAML spec of the Realtime Register REST API v2, a `rtr` CLI built
on that spec, and an installable agent skill (SKILL.md + references/) that
ships both to consumer projects.

## Golden rules

- `assets/spec/` is the only hand-edited source of truth. Never hand-edit
  `references/*.md` — they are generated (`node bin/rtr.js generate`) and a
  vitest sync test fails CI if they go stale.
- After ANY spec edit, run `npm run audit`.
- A contract change to a `verified: docs` operation must be re-verified
  against the live Realtime Register docs, then locked in with
  `node scripts/audit-refs.mjs --update-lock` — commit the updated
  `assets/spec/_fingerprints.json`.
- Wire format is camelCase. No exceptions.
- Auth header is `Authorization: ApiKey <key>` — never `X-API-KEY`, never
  Basic (deprecated).

## Commands

- `npm run verify` — the gate: build + lint + test + audit. Run before
  committing.
- `npm run build` — compile TypeScript (`tsc`).
- `npm run lint` — typecheck only (`tsc --noEmit`).
- `npm test` — run the vitest suite.
- `npm run audit` — build then check spec/reference/fixture consistency.
- `npm run generate` — regenerate `references/*.md` from the spec.
- `npm run doctor` — network: sanity-check API reachability/auth.
- `node bin/rtr.js scrape <operationId>` — network: pull one live doc page.
- `node scripts/diff-live.mjs` — network: full live-doc drift diff (build first).

## Layout

- `src/cli/` — the `rtr` CLI commands.
- `src/lib/` — spec loading, validation, generation, pointer-file logic.
- `scripts/` — standalone Node scripts (audit, diff-live, reconciliation).
- `assets/spec/` — hand-edited YAML spec + fingerprint lock file.
- `references/` — generated per-operation docs; do not hand-edit.
- `tests/` — vitest test suite.
- `docs/` — hand-written contributor/agent-integration docs.

## Conventions

- Conventional commits (`fix:`, `feat:`, `docs(scope):`, `chore:`).
- Tests live in `tests/` and use vitest.
- Keep files under 800 lines.
- TypeScript strict mode, ESM (NodeNext module resolution).
