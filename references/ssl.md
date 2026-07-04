# SSL (`ssl`)

Order, validate, reissue, renew, and revoke SSL certificates. DCV
(Domain Control Validation) is the critical hand-off; see the DcvType enum
in _shared.yaml for accepted methods.

**Base URL:** `https://api.yoursrs.com`  
**Docs:** `https://dm.realtimeregister.com/docs/api`

**Auth:** `Authorization: ApiKey <your-api-key>`

## Authentication

- Authenticate every REST request with the header `Authorization: ApiKey <your-api-key>`. API keys are generated in the Realtime Register portal.
- There is NO `X-API-KEY` header in this API. Never use it.
- Basic (password-based) authentication is DEPRECATED upstream. Never suggest or generate it.
- Session authentication (`Authorization: Session <key>`) and `POST /v2/session` are deprecated in favor of API keys. Do not use.
- Customer-scope and gateway-scope endpoints (`authScope` on each operation) require different API keys. Never mix them.

## Operations

### `getCertificate`

`GET /v2/ssl/certificates/{id}`

Retrieve a certificate order and its current state.

- **Docs:** `https://dm.realtimeregister.com/docs/api/ssl/get`
- **Auth scope:** `customer`

**Path params**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes |  |

**Responses**

- `200` — Certificate object with `status`, `commonName`, `sans`, `dcv`, `validFrom`, `validUntil`.

**Errors:** `ObjectDoesNotExist`, `AuthorizationFailed`


### `listCertificates`

`GET /v2/ssl/certificates`

List certificate orders.

- **Docs:** `https://dm.realtimeregister.com/docs/api/ssl/list`
- **Auth scope:** `customer`

**Query params**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `fields` | `string` | no |  |
| `q` | `string` | no |  |
| `limit` | `integer` | no |  |
| `offset` | `integer` | no |  |
| `order` | `string` | no |  |

**Responses**

- `200` — Paginated envelope of Certificate objects.

**Errors:** `InvalidParameter`


### `getProduct`

`GET /v2/ssl/products/{id}`

Retrieve SSL product metadata (validation type, SAN limits, warranty).

- **Docs:** `https://dm.realtimeregister.com/docs/api/ssl/products/get`
- **Auth scope:** `customer`

**Path params**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes |  |

**Responses**

- `200` — Product object with `brand`, `validationType`, `maxSans`, `periods`.

**Errors:** `ObjectDoesNotExist`


### `listProducts`

`GET /v2/ssl/products`

List SSL products available to the authenticated customer.

- **Docs:** `https://dm.realtimeregister.com/docs/api/ssl/products/list`
- **Auth scope:** `customer`

**Query params**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `fields` | `string` | no |  |
| `q` | `string` | no | Filter, e.g. validationType:EV. |
| `limit` | `integer` | no |  |
| `offset` | `integer` | no |  |

**Responses**

- `200` — Paginated envelope of Product objects.

**Errors:** `InvalidParameter`


### `requestCertificate`

`POST /v2/ssl/certificates`  _async_

Place a new certificate order.

- **Docs:** `https://dm.realtimeregister.com/docs/api/ssl/request`
- **Auth scope:** `customer`

**Query params**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `quote` | `boolean` | no |  |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `product` | `string` | yes | SSL product identifier. |
| `period` | `integer` | yes | Validity period in MONTHS. |
| `csr` | `string` | yes | PEM-encoded PKCS#10 CSR. |
| `sans` | `string[]` | no | Subject Alternative Names. |
| `dcv` | `Dcv[]` | no | DCV method per FQDN. |
| `approver` | `Approver` | no | Organization contact for OV/EV issuance. |
| `organization` | `SslOrganization` | no |  |
| `language` | `string` | no |  |
| `billables` | `Billable[]` | no |  |
| `autoRenew` | `boolean` | no | Defaults to false. |

**Responses**

- `201` — Certificate order created; poll for issuance.
- `202` — { processId } — async issuance via SDK-level workflow.

**Errors:** `InvalidParameter`, `BillableAcknowledgmentNeededException`

**Gotchas**

- `period` is MONTHS; industry-standard max is 13.
- DV orders allow DCV via EMAIL/DNS/HTTP/HTTPS; OV/EV typically require EMAIL plus organization verification.
- CSR `commonName` must match the first SAN.


### `reissueCertificate`

`POST /v2/ssl/certificates/{id}/reissue`  _async_

Reissue a certificate with a new CSR or SAN set.

- **Docs:** `https://dm.realtimeregister.com/docs/api/ssl/reissue`
- **Auth scope:** `customer`

**Path params**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes |  |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `csr` | `string` | yes |  |
| `sans` | `string[]` | no |  |
| `dcv` | `Dcv[]` | no |  |

**Responses**

- `202` — { processId }

**Errors:** `InvalidParameter`, `ObjectDoesNotExist`


### `renewCertificate`

`POST /v2/ssl/certificates/{id}/renew`  _async_

Renew an existing certificate.

- **Docs:** `https://dm.realtimeregister.com/docs/api/ssl/renew`
- **Auth scope:** `customer`

**Path params**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes |  |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `period` | `integer` | yes | Months. |
| `csr` | `string` | yes |  |
| `dcv` | `Dcv[]` | no |  |
| `billables` | `Billable[]` | no |  |

**Responses**

- `202` — { processId }

**Errors:** `InvalidParameter`, `BillableAcknowledgmentNeededException`


### `revokeCertificate`

`POST /v2/ssl/certificates/{id}/revoke`  _async_

Revoke a certificate.

- **Docs:** `https://dm.realtimeregister.com/docs/api/ssl/revoke`
- **Auth scope:** `customer`

**Path params**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes |  |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `reason` | `string` | no |  |

**Responses**

- `202` — { processId }

**Errors:** `InvalidParameter`, `ObjectDoesNotExist`


### `resendDcv`

`POST /v2/ssl/certificates/{id}/resend-dcv`

Re-send the DCV email or re-check a DNS/HTTP DCV token.

- **Docs:** `https://dm.realtimeregister.com/docs/api/ssl/resenddcv`
- **Auth scope:** `customer`

**Path params**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes |  |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `fqdn` | `string` | yes |  |
| `dcvType` | `DcvType` | no |  |

**Responses**

- `200` — DCV request re-queued.

**Errors:** `InvalidParameter`, `ObjectDoesNotExist`


### `downloadCertificate`

`GET /v2/ssl/certificates/{id}/download`

Download the issued certificate in PEM or PKCS#7 format.

- **Docs:** `https://dm.realtimeregister.com/docs/api/ssl/download`
- **Auth scope:** `customer`

**Path params**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes |  |

**Query params**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `format` | `string` | no |  |

**Responses**

- `200` — Certificate chain.

**Errors:** `ObjectDoesNotExist`, `InvalidParameter`


### `scheduleValidationCall`

`POST /v2/ssl/certificates/{id}/schedule-validation-call`

Schedule an EV validation call with the CA.

- **Docs:** `https://dm.realtimeregister.com/docs/api/ssl/schedule-validation-call`
- **Auth scope:** `customer`

**Path params**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes |  |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `date` | `string` | yes |  |
| `voice` | `string` | yes |  |
| `contact` | `string` | yes | Name of the person to contact. |

**Responses**

- `200` — Validation call scheduled.

**Errors:** `InvalidParameter`, `ObjectDoesNotExist`


### `getDcvEmails`

`GET /v2/ssl/certificates/dcv-email-addresses`

List the approver email addresses accepted for EMAIL DCV on a given FQDN.

- **Docs:** `https://dm.realtimeregister.com/docs/api/ssl/dcvemailaddresslist`
- **Auth scope:** `customer`

**Query params**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `fqdn` | `string` | yes |  |

**Responses**

- `200` — Array of candidate email addresses (WHOIS + constructed).

**Errors:** `InvalidParameter`


### `sendSubscriberAgreement`

`POST /v2/ssl/certificates/{id}/send-subscriber-agreement`

Send (or re-send) the CA Subscriber Agreement email to the approver for certificates that require explicit acceptance.

- **Docs:** `https://dm.realtimeregister.com/docs/api/ssl/send-subscriber-agreement`
- **Auth scope:** `customer`

**Path params**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes |  |

**Responses**

- `200` — Subscriber-agreement email dispatched.

**Errors:** `InvalidParameter`, `ObjectDoesNotExist`

**Gotchas**

- Required for some OV/EV products on first issuance; a no-op once accepted.


### `addNoteDeprecated`

`POST /v2/ssl/certificates/{id}/add-note`

Attach a free-form note to a certificate order. DEPRECATED; use a ticketing system instead.

- **Docs:** `https://dm.realtimeregister.com/docs/api/ssl/add-note`
- **Auth scope:** `customer`

**Path params**

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | yes |  |

**Request body** (`application/json`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `note` | `string` | yes |  |

**Responses**

- `200` — Note stored.

**Errors:** `InvalidParameter`, `ObjectDoesNotExist`

**Gotchas**

- Marked Deprecated in the live documentation; new integrations should avoid this endpoint.


### `importCertificate`

`POST /v2/ssl/certificates/import`

Import an externally issued certificate so it can be tracked and renewed through the platform.

- **Docs:** `https://dm.realtimeregister.com/docs/api/ssl/import`
- **Auth scope:** `customer`

**Request body** (`application/json`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `certificate` | `string` | yes | PEM-encoded certificate (leaf). |
| `caBundle` | `string` | no | PEM-encoded intermediate chain. |
| `csr` | `string` | no | Original PEM-encoded CSR (if available). |
| `coverage` | `string` | no | Product identifier that the imported cert most closely matches. |

**Responses**

- `201` — Certificate imported; `id` returned for subsequent renew/revoke operations.

**Errors:** `InvalidParameter`


### `decodeCsr`

`POST /v2/ssl/decode-csr`

Decode a PEM-encoded CSR and return its parsed fields (commonName, SANs, organization, keyBits, signatureAlgorithm).

- **Docs:** `https://dm.realtimeregister.com/docs/api/ssl/decocdecsr`
- **Auth scope:** `customer`

**Request body** (`application/json`)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `csr` | `string` | yes | PEM-encoded PKCS#10 CSR. |

**Responses**

- `200` — Decoded CSR object.

**Errors:** `InvalidParameter`

**Gotchas**

- The live-docs slug is `decocdecsr` (sic); preserved for fidelity with the navigation menu.


### `generateAuthKey`

`POST /v2/ssl/generate-authkey`

Generate a new authKey used for ACME external-account-binding (EAB) or programmatic re-key operations.

- **Docs:** `https://dm.realtimeregister.com/docs/api/ssl/generate-authkey`
- **Auth scope:** `customer`

**Responses**

- `200` — `{ authKey }` — store securely; re-generating invalidates prior keys.


