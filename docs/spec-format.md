# Spec format

Every category YAML in `assets/spec/` conforms to the structure documented
here. The format is intentionally hand-friendly — it is human-authored, not
generated from a schema, and prioritises readability over closed-world rigor.

## File layout

```yaml
category: domains          # short identifier, matches filename
label: Domains             # human label for generated headings
description: |             # multi-line, used as the `references/<cat>.md` intro
  Register, update, renew, ...

operations:
  - operationId: createDomain
    verified: docs           # docs | sdk
    method: POST             # GET | POST | PUT | PATCH | DELETE
    path: /v2/domains/{domainName}
    docUrl: /domains/create  # relative to docsBaseUrl
    async: true              # returns 202 + processId
    authScope: customer      # customer | gateway
    deprecated: false        # optional
    liveDiff: false          # optional; false = doc page can't be machine-diffed
    summary: …               # one-liner, used in `rtr list`
    pathParams:
      - { name: domainName, type: string, required: true, description: "…" }
    queryParams:
      - { name: quote, type: boolean, description: "…" }
    requestBody:
      contentType: application/json
      fields:                # a MAPPING keyed by field name, not a list
        customer:   { type: string, required: true, description: "…" }
        period:     { type: integer, description: "Months; 12 = one year." }
        contacts:   { type: array, itemsRef: DomainContactRef }
        billables:  { type: array, itemsRef: Billable }
    responses:
      "202": { description: "Process acknowledgement …" }
    errors:  [ InvalidParameter, DomainAlreadyRegistered ]
    gotchas: [ "`period` is in months" ]
    examples:
      - name: Register example.com for 1 year
        request: |
          { "registrant": "…", "period": 12 }
```

## Field reference

### Top-level

| Key           | Type   | Required | Notes                                 |
| ------------- | ------ | -------- | ------------------------------------- |
| `category`    | string | yes      | snake-/camel-case filename stem       |
| `label`       | string | yes      | human-friendly heading                |
| `description` | string | yes      | markdown, flowed                      |
| `operations`  | list   | yes      | one entry per endpoint                |

### Per operation

| Key           | Type     | Required | Notes                                         |
| ------------- | -------- | -------- | --------------------------------------------- |
| `operationId` | string   | yes      | camelCase, globally unique across categories  |
| `verified`    | enum     | yes      | `docs` or `sdk`; see `docs/fidelity.md`       |
| `method`      | enum     | yes      | HTTP verb                                     |
| `path`        | string   | yes      | absolute URL path, `/v2/…`                    |
| `docUrl`      | string   | yes      | appended to `docsBaseUrl` in `_shared.yaml`   |
| `async`       | boolean  | yes      | `true` if returns 202 + processId             |
| `authScope`   | enum     | yes      | `customer` or `gateway`                       |
| `deprecated`  | boolean  | no       | default `false`                               |
| `liveDiff`    | boolean  | no       | `false` = doc page cannot be machine-diffed; skipped by `scripts/diff-live.mjs` |
| `summary`     | string   | yes      | one-line                                      |
| `pathParams`  | list     | no       | `{ name, type, required, description }`       |
| `queryParams` | list     | no       | same shape as pathParams, plus defaults/ranges |
| `requestBody` | object   | no       | `{ contentType, fields: { <name>: <shape> } }` — fields is a mapping |
| `responses`   | map      | yes      | HTTP code → `{ description }`                 |
| `errors`      | list     | no       | error names resolvable in the global catalog  |
| `gotchas`     | list     | no       | free-form warnings rendered as bullets        |
| `examples`    | list     | no       | `{ name, request }` (request is JSON as a string or an object) |

### Field shape (values of the `requestBody.fields` mapping)

```yaml
registrant:
  type: string            # string | integer | number | boolean | array | object
  required: true
  description: Contact handle of the domain registrant.
  enum: [ … ]             # inline enum, or:
  enumRef: ContactRole    # reference into `_shared.yaml` enums
  minimum: 1              # for numeric
  maxLength: 40           # for string
  format: email           # ajv-formats shortcut
  items: string           # for array of primitives, or a nested shape
  itemsRef: Billable      # array of a shared type
  fields: { … }           # inline nested object (same shape recursively)
  fieldsRef: Zone         # nested object from a shared type
```

## Shared spec (`_shared.yaml`)

Top-level sections:

- **`auth`** — the API authentication contract (`Authorization: ApiKey <key>`
  header format plus the hard rules); rendered into every generated
  reference and included in `rtr describe --format json` output.
- **`enums`** — named value lists used across categories (for example
  `DomainStatus`, `ContactRole`, `BillableAction`).
- **`types`** — reusable nested-object shapes (for example `Billable`,
  `KeyData`, `DsData`, `DnsRecord`, `Dcv`, `ContactVerification`).
- **`errors`** — the global error catalog (`code`, `httpStatus`, description).

Resolve references with `enumRef:` (enums), `fieldsRef:` (nested object
types), or `itemsRef:` (array item types). Referencing a missing name is
caught by `node scripts/audit-refs.mjs`.

## Validation-only concerns

The JSON Schema emitted by `src/lib/schema.ts` honours:

- `required` (per-field)
- `enum` / `enumRef`, `const`, `minimum`, `maximum`, `minLength`, `maxLength`,
  `minItems`, `maxItems`, `default`
- `items` / `itemsRef` for arrays
- `fields` / `fieldsRef` with nested `required` for objects
- `format` shortcuts: `email`, `uri`, `date`, `date-time`, `ipv4`, `ipv6`
- `additionalProperties: false` everywhere (strict)

Anything outside this list (for example cross-field invariants like the
`keyData` XOR `dsData` rule) lives in `gotchas` and is the caller's
responsibility to enforce.
