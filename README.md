# @cave-man/realtime-register-skills

[![npm](https://img.shields.io/badge/npm-%40cave--man%2Frealtime--register--skills-cb3837?logo=npm)](https://www.npmjs.com/package/@cave-man/realtime-register-skills)
[![licence](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A520.11-44883e?logo=node.js&logoColor=white)](https://nodejs.org)
[![operations](https://img.shields.io/badge/operations-109%2F109%20verified-2ea44f)](docs/fidelity.md)
[![categories](https://img.shields.io/badge/categories-16-4c8cbf)](#spec-layout)

A hand-curated, fidelity-verified specification and CLI for the
[Realtime Register](https://www.realtimeregister.com) REST API v2. Every
non-SiteLock endpoint — **109 operations across 16 categories** — is described
in machine-readable YAML, reconciled field-by-field against the live HTML
documentation at [`dm.realtimeregister.com/docs/api`](https://dm.realtimeregister.com/docs/api).

One package, two audiences:

- **AI agents** load `SKILL.md` + `references/*.md` as structured context and
  validate outgoing requests through `rtr validate`.
- **Human developers** use `rtr` at the terminal for schema-validated request
  construction, operation lookup, and doc-link auditing.

---

## Highlights

- **100 % fidelity** — all 109 operations carry `verified: docs` (path, URL
  params, query params, and request-body fields reconciled against the live
  HTML). See [`docs/fidelity.md`](docs/fidelity.md).
- **Runtime validation** — JSON Schemas derived from the YAML, evaluated by
  `ajv` with format checks for `email`, `uri`, `date`, `date-time`, `ipv4`,
  `ipv6`.
- **Agent-first docs** — `SKILL.md` + `references/<category>.md` are the only
  files an LLM needs to load; they are terse, structured, and stable.
- **Zero-surprise CLI** — six subcommands, no config files, no env vars, no
  network access except `doctor` and `scrape`.
- **CamelCase everywhere** — matches the official TypeScript SDK and the
  on-the-wire protocol.

---

## Quick start

### Install as an agent skill

Drop the skill (`SKILL.md` + `references/` + `assets/spec/`) into your agent
client's skills directory — one command, no prior install:

```bash
npx @cave-man/realtime-register-skills install
```

The installer auto-detects these targets. When multiple matches exist and
stdin is a TTY, you'll be prompted to choose one; non-interactive callers
(CI, `--yes`, piped input) get the first match:

### Install targets

| id               | Client(s)                                    | Path                                             |
| ----------------- | --------------------------------------------- | ------------------------------------------------- |
| `claude-desktop`  | Claude Desktop (macOS/Windows/Linux)          | `~/Library/Application Support/Claude/skills/` (macOS), `%APPDATA%\Claude\skills\` (Windows), `~/.config/Claude/skills/` (Linux) |
| `claude-code`     | Claude Code CLI                               | `~/.claude/skills/`                                |
| `agents-standard` | Codex CLI, Gemini CLI, Augment CLI (fallback) | `~/.agents/skills/`                                |
| `gemini`          | Gemini CLI                                    | `~/.gemini/skills/`                                |
| `codex`           | Codex CLI — **best effort / undocumented upstream** | `~/.codex/skills/`                           |
| `augment`         | Augment                                       | `~/.augment/skills/`                               |
| `project-agents`  | Local project (agentskills.io convention)     | `./.agents/skills/`                                |
| `project-local`   | Local project fallback                        | `./skills/`                                        |

Tools with no skills mechanism get a **pointer file** via `--pointer` instead
— a small sentinel-delimited block telling the agent where the skill lives:

| `--pointer` value | Tool     | File                                |
| ------------------ | -------- | ------------------------------------ |
| `junie`            | JetBrains Junie | `.junie/AGENTS.md`             |
| `copilot`          | GitHub Copilot  | `.github/copilot-instructions.md` |
| `cursor`           | Cursor          | `.cursor/rules/realtime-register.mdc` |
| `agentsmd`         | ~25 tools reading the [agents.md](https://agents.md) convention | `AGENTS.md` |

```bash
npx @cave-man/realtime-register-skills install                      # auto-detected skill target
npx @cave-man/realtime-register-skills install --pointer all        # + every pointer file
npx @cave-man/realtime-register-skills install --pointer junie,agentsmd
```

Pointer writes only ever touch the sentinel-delimited block they own; if the
target file already has unrelated content and no sentinel yet, the installer
prints the block instead of writing it, so you can add it by hand.

*Verified against official docs on 2026-07-04: developers.openai.com/codex/skills,
geminicli.com/docs/cli/skills/, docs.augmentcode.com/cli/skills,
junie.jetbrains.com/docs/guidelines-and-memory.html, docs.github.com,
cursor.com/docs/context/rules, agents.md. `~/.codex/skills/` is a best-effort
target — see github.com/openai/codex/issues/14337.*

Override with `--target <dir>` or the `REALTIME_REGISTER_SKILL_DIR` env var.
Installer subcommands:

```bash
npx @cave-man/realtime-register-skills install --dry-run           # preview
npx @cave-man/realtime-register-skills install --target ./skills   # explicit dir
npx @cave-man/realtime-register-skills install --global            # + npm i -g (rtr on PATH)
npx @cave-man/realtime-register-skills where                       # list detected targets
npx @cave-man/realtime-register-skills uninstall                   # remove the skill
npx @cave-man/realtime-register-skills uninstall --pointer all     # + remove pointer blocks
```

### Install the `rtr` CLI

```bash
# one-off (recommended)
npx @cave-man/realtime-register-skills rtr --help

# or globally
npm install -g @cave-man/realtime-register-skills
rtr --help
```

### Describe an operation

```bash
rtr describe createDomain
```

### Validate a request body before sending

```bash
cat > /tmp/register.json <<'JSON'
{
  "registrant": "H1234567",
  "period": 12,
  "ns": ["ns1.example.com", "ns2.example.com"],
  "privacyProtect": true
}
JSON

rtr validate createDomain --body /tmp/register.json
# → exits 0 if the body matches the schema, 1 otherwise
```

### Audit every documentation link

```bash
rtr doctor
# OK  200 createDomain      https://dm.realtimeregister.com/docs/api/domains/create
# OK  200 getDomain         https://dm.realtimeregister.com/docs/api/domains/get
# … 109 lines total, non-200s exit non-zero.
```

---

## CLI at a glance

Two binaries ship in this package:

**`skills`** — the installer entry point (`npx @cave-man/realtime-register-skills …`).

| Command                                      | Purpose                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| `skills install [--target <dir>] [--global]` | Install the skill into a detected or explicit target; optionally `npm i -g`.    |
| `skills uninstall [--target <dir>] [--all]`  | Remove the skill from one or all installed targets.                             |
| `skills where`                               | Print every known target and its install state.                                 |
| `skills doctor`                              | `rtr doctor` against the packaged spec.                                         |
| `skills rtr <subcommand> [...]`              | Pass-through to the `rtr` CLI below without a separate install.                 |

**`rtr`** — the operation / schema CLI.

| Command                                         | Purpose                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `rtr list [--category <name>]`                  | List all operations or one category.                                             |
| `rtr describe <operationId>`                    | Full contract for one operation: path, params, body, errors, gotchas, examples.  |
| `rtr validate <operationId> --body <file.json>` | Validate a request body, query, or path params against the schema.               |
| `rtr generate [--category <name>]`              | Render `references/<category>.md` from the YAML.                                 |
| `rtr scrape <operationId>`                      | Fetch the live HTML doc for an operation; print a spec skeleton.                 |
| `rtr doctor [--category <name>]`                | Verify every `docUrl` returns HTTP 200.                                          |

Full flag reference in [`docs/cli.md`](docs/cli.md).

---

## Spec layout

The source of truth is `assets/spec/`:

```text
assets/spec/
├── _shared.yaml        # enums and reusable nested types
├── domains.yaml        # 13 operations (11 customer + 2 gateway)
├── hosts.yaml          #  5 operations
├── contacts.yaml       # 11 operations
├── dnsZones.yaml       #  9 operations
├── dnsTemplates.yaml   #  5 operations
├── validation.yaml     #  2 operations
├── ssl.yaml            # 17 operations
├── sslAcme.yaml        #  7 operations
├── notifications.yaml  #  5 operations
├── processes.yaml      #  5 operations
├── customers.yaml      #  2 operations
├── brands.yaml         # 10 operations (CRUD + templates + locales)
├── financial.yaml      #  4 operations
├── tlds.yaml           #  2 operations
├── providers.yaml      #  7 operations (incl. gateway-only registry accounts)
└── misc.yaml           #  5 operations (IsProxy + 4 ADAC WebSocket actions)
```

Each operation carries `operationId`, `method`, `path`, `docUrl`, `async`,
`authScope`, `deprecated`, `verified`, `pathParams`, `queryParams`,
`requestBody.fields`, `responses`, `errors`, `gotchas`, and `examples`. Full
schema in [`docs/spec-format.md`](docs/spec-format.md).

---

## Using the skill from an AI agent

The `SKILL.md` file at the repo root is the canonical entry point. Load it
into your agent's system context along with the relevant
`references/<category>.md` file(s). A typical flow:

1. Agent receives user request ("renew example.com for two years").
2. Agent loads `SKILL.md` → learns the hard rules (camelCase, `period` in
   months, async polling, billable acknowledgment).
3. Agent loads `references/domains.md` → finds the `renewDomain` entry.
4. Agent builds the payload and calls `rtr validate renewDomain --body …`
   before issuing the HTTP request.
5. On HTTP 202, agent polls `/v2/processes/{processId}` via the `processes`
   category.

End-to-end integration notes, a programmatic validation snippet, and the
billable-acknowledgment / async-mutation patterns are documented in
[`docs/agent-integration.md`](docs/agent-integration.md).

---

## Fidelity markers

Every operation declares a `verified` marker:

- **`docs`** — path, URL parameters, query parameters, and request-content
  fields reconciled against the live HTML.
- **`sdk`** — derived from the public TypeScript SDK and the navigation slug
  only; no HTML-level reconciliation yet.

**As of v0.1.0, all 109 operations carry `verified: docs`.** Promotion
workflow, drift policy, and enforcement tooling are documented in
[`docs/fidelity.md`](docs/fidelity.md).

---

## Documentation index

| File                                                          | Audience    | Purpose                                               |
| ------------------------------------------------------------- | ----------- | ----------------------------------------------------- |
| [`SKILL.md`](SKILL.md)                                        | AI agents   | Skill card with activation rules and hard invariants  |
| [`references/<category>.md`](references/)                     | AI + human  | Per-category operation reference (generated)          |
| [`docs/agent-integration.md`](docs/agent-integration.md)      | Agent devs  | How to load the skill, validate payloads, handle async |
| [`docs/cli.md`](docs/cli.md)                                  | Humans      | Full CLI flag and exit-code reference                 |
| [`docs/spec-format.md`](docs/spec-format.md)                  | Contributors| YAML schema for every field in `assets/spec/`         |
| [`docs/fidelity.md`](docs/fidelity.md)                        | Maintainers | Reconciliation policy and drift detection             |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)                          | Contributors| How to land a PR                                      |
| [`HANDOVER.md`](HANDOVER.md)                                  | Maintainers | End-to-end project memory and onboarding guide        |
| [`CHANGELOG.md`](CHANGELOG.md)                                | Everyone    | Release history                                       |

---

## Requirements

- Node.js **20.11** or newer.
- No runtime Realtime Register account needed for the CLI — schema validation
  is local. You only need credentials to actually call `api.yoursrs.com`.

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). In short: never edit
`references/*.md` directly (they are generated), keep field names camelCase,
and run `rtr doctor` + `node scripts/audit-refs.mjs` before opening a PR.

---

## Licence

[MIT](LICENSE). Not affiliated with Realtime Register B.V.; this project
merely consumes their public documentation.
