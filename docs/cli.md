# CLI reference (`rtr`)

The `rtr` binary is a thin wrapper around the YAML specification in
`assets/spec/`. Every command reads the same single source of truth, so output
is stable regardless of network conditions except where noted.

```
rtr [command] [options]
```

Run `rtr --help` or `rtr <command> --help` for the authoritative flag list.

## `rtr list`

List every operation, or filter by category.

```bash
rtr list                      # 109 operations across 16 categories
rtr list --category domains   # only the 13 domain ops
```

Output columns: `operationId`, HTTP method, path, `verified` marker. Pipe
through `grep`/`awk` for scripted use.

## `rtr describe <operationId>`

Print the full contract for a single operation:

```bash
rtr describe createDomain                 # human-readable
rtr describe createDomain --format json   # machine-readable
```

Includes method, path, path params, query params, request-body fields (with
types, required flags, enums, nested objects), response descriptions, declared
error codes, gotchas, and worked examples. Use this as the authoritative
pre-flight reference before issuing a request.

With `--format json` (alias `-f json`) the output is a single pure-JSON
document on stdout: the operation entry, the fully-qualified `docUrl`, the
shared `auth` contract, and the derived JSON Schemas
(`schemas.body` / `schemas.query` / `schemas.path`, ajv draft-07 compatible).
Built for MCP bridges and other tooling — no second call needed to obtain the
validation schemas.

## `rtr validate <operationId>`

Validate a prospective request against the JSON Schema derived from the YAML.

```bash
rtr validate createDomain --body payload.json
rtr validate listDomains  --query query.json
rtr validate getDomain    --path-params path.json
```

The validator uses [`ajv`](https://ajv.js.org/) with `ajv-formats` for
`email`, `uri`, `date`, `date-time`, `ipv4`, and `ipv6`. All three flags can be
combined; each file is checked independently.

**Exit codes**

- `0` — payload passes schema.
- `1` — schema violation (errors printed as AJV messages), unknown
  `operationId`, or unreadable payload file.

## `rtr generate`

Render the YAML spec into human-readable Markdown under `references/`.

```bash
rtr generate                        # regenerate all 16 files
rtr generate --category ssl         # one file
rtr generate --out build/reference  # alternate output directory
```

This is what populates `references/<category>.md`; re-run after editing any
YAML.

## `rtr scrape <operationId>`

Fetch the live HTML documentation for an operation and print a spec skeleton
derived from the page's `URL fields`, `Request parameters`, and
`Request content` tables. Use this when upstream docs change and a spec entry
needs re-reconciling.

```bash
rtr scrape createDomain
```

Output is diff-ready against the corresponding YAML entry. Nothing is written
to disk — paste changes manually.

## `rtr doctor`

Verify every `docUrl` in the spec resolves with HTTP 200.

```bash
rtr doctor                  # checks all 109 URLs
rtr doctor --category ssl   # subset
```

Any non-200 line is printed; exits non-zero on the first failure. Run before
every release.

## Exit codes summary

| Code | Meaning                                                          |
| ---- | ---------------------------------------------------------------- |
| `0`  | Success                                                          |
| `1`  | Any failure: schema violation, doctor non-200, unknown operation, unreadable file |

## Environment

No environment variables are consumed; the CLI is fully offline except for
`rtr doctor` and `rtr scrape`, which perform HTTPS requests against
`dm.realtimeregister.com`.
