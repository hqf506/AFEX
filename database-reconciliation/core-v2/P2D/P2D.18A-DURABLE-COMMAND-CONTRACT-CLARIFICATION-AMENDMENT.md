## 1. Executive Summary

P2D.18A clarifies only the field types, conditional states, canonical bytes, timestamps, modifier structure, and enforcement responsibilities needed to implement P2D.19 and P2D.20 exactly.

The following existing decisions remain unchanged:

- Separate immutable payload relation.
- Payload version `order-command-payload-v1`.
- Fingerprint version `order-request-fingerprint-v1`.
- SHA-256 fingerprint.
- Maximum payload size of 256 KiB.
- Maximum 100 order lines.
- Multiple lines for the same catalog item are permitted.
- Line order affects fingerprint identity.
- Modifiers affect fingerprint identity.
- Money uses two-decimal strings.
- Quantities use canonical strings with at most three fractional digits.
- Forbidden credentials, tokens, PINs, and payment-card secrets are never stored.
- Context, command, and payload are created atomically.
- Invoice and invoice items remain authoritative committed financial truth.

Conventions used below:

- **Required/non-null:** key must exist and its value cannot be JSON null.
- **Required/nullable:** key must exist; JSON null is permitted only under the stated condition.
- **Optional/omitted:** key must be absent when unavailable. Explicit null is prohibited.
- Unless a different limit is stated, bounded contract/version strings are 1–128 Unicode scalar values and 512 UTF-8 bytes.
- Every JSON string must be valid Unicode and NFC-normalized.

## 2. Exact Payload Schema Matrix

### 2.1 Root envelope

| Field | JSON type | Presence/null | Bounds or values | Fingerprint |
|---|---|---|---|---|
| `payload_version` | string | Required/non-null | Exactly `order-command-payload-v1` | Included |
| `fingerprint_version` | string | Required/non-null | Exactly `order-request-fingerprint-v1` | Excluded |
| `command_type` | string | Required/non-null | Exactly `order.create` | Included |
| `tenant_id` | string | Required/non-null | Canonical UUID | Included |
| `branch_id` | string | Required/non-null | Canonical UUID | Included |
| `authenticated_actor_id` | string | Required/non-null | Canonical UUID | Included |
| `customer` | object | Required/non-null | Exact schema below | Included |
| `items` | array | Required/non-null | 1–100 elements | Included, array order retained |
| `pricing` | object | Required/non-null | Exact schema below | Included except derived fields |
| `vat` | object | Required/non-null | Exact schema below | Included |
| `discount` | object | Required/non-null | Exact schema below | Included |
| `payment` | object | Required/non-null | Exact schema below | Included except excluded evidence |
| `fulfillment` | object | Required/non-null | Exact schema below | Included |
| `order` | object | Required/non-null | Exact schema below | Included |
| `metadata` | object | Required/non-null | Exact schema below; total ≤4 KiB | Only `source_channel` |
| `versions` | object | Required/non-null | Exact schema below | Included except derived field |

No additional root keys are permitted. `issuance`, `retention`, and `archive` are relation/ledger lifecycle evidence and are not keys in payload v1.

### 2.2 Customer

| Field | JSON type | Presence/null | Bounds or values | Fingerprint |
|---|---|---|---|---|
| `mode` | string | Required/non-null | `existing`, `create`, `none` | Included |
| `customer_id` | string/null | Required/nullable | Canonical UUID when non-null | Included |
| `expected_record_version` | integer/null | Required/nullable | 1–9,223,372,036,854,775,807 | Included |
| `normalized_phone` | string/null | Required/nullable | 8–32 ASCII digits, optional leading `+` only when contractually normalized | Included |
| `display_phone` | string/null | Required/nullable | ≤64 scalars and 256 bytes | Included |
| `name` | string/null | Required/nullable | 1–200 scalars and 800 bytes when non-null | Included |
| `email` | string/null | Required/nullable | 3–320 scalars and 1,280 bytes when non-null | Included |
| `address` | string/null | Required/nullable | ≤1,000 scalars and 4 KiB | Included |
| `notes` | string/null | Required/nullable | ≤2,000 scalars and 8 KiB | Included |
| `allowed_update_fields` | array | Required/non-null | Unique sorted subset of `display_phone`, `name`, `email`, `address`, `notes`; maximum 5 | Included |
| `conflict_behavior` | string | Required/non-null | `reject`, `reuse_without_update`, `apply_allowed_updates` | Included |

Empty strings are prohibited. Unavailable values use explicit JSON null.

### 2.3 Item lines

| Field | JSON type | Presence/null | Bounds or values | Fingerprint |
|---|---|---|---|---|
| `line_id` | string | Required/non-null | Canonical UUID; unique across payload | Included |
| `line_number` | integer | Required/non-null | 1–100; contiguous and equals array position | Included |
| `catalog_item_id` | string | Required/non-null | Canonical UUID | Included |
| `name_snapshot` | string | Required/non-null | 1–300 scalars and 1,200 bytes | Included |
| `sku_snapshot` | string/null | Required/nullable | 1–128 scalars and 512 bytes when non-null | Included |
| `category_snapshot` | string/null | Required/nullable | 1–200 scalars and 800 bytes when non-null | Included |
| `item_type_snapshot` | string | Required/non-null | `product` or `service` | Included |
| `quantity` | string | Required/non-null | Canonical quantity; `>0`; scale ≤3 | Included |
| `unit_snapshot` | string | Required/non-null | 1–64 scalars and 256 bytes | Included |
| `inventory_tracking_mode` | string | Required/non-null | `tracked_product`, `untracked_product`, `service` | Included |
| `fulfillment_class` | string | Required/non-null | `immediate`, `pickup`, `delivery`, `service` | Included |
| `line_note` | string/null | Required/nullable | ≤500 scalars and 2 KiB | Included |
| `modifiers` | array | Required/non-null | 0–20 flat modifier objects | Included in canonical modifier order |

No additional item keys are permitted.

### 2.4 Modifiers

| Field | JSON type | Presence/null | Bounds or values | Fingerprint |
|---|---|---|---|---|
| `modifier_id` | string | Required/non-null | Canonical UUID; unique within line | Included |
| `modifier_type` | string | Required/non-null | 1–64 scalars and 256 bytes | Included |
| `option_id` | string/null | Required/nullable | Canonical UUID when non-null | Included |
| `value` | string | Required/non-null | 1–256 scalars and 1 KiB | Included |
| `quantity` | string | Required/non-null | Canonical quantity; `>0`; scale ≤3 | Included |
| `price_adjustment` | string | Required/non-null | Canonical signed money | Included |

No additional modifier keys are permitted.

### 2.5 Pricing

| Field | JSON type | Presence/null | Bounds or values | Fingerprint |
|---|---|---|---|---|
| `currency` | string | Required/non-null | Exactly `SAR` | Included |
| `currency_precision` | integer | Required/non-null | Exactly `2` | Included |
| `subtotal` | string | Required/non-null | Canonical non-negative money | Included |
| `taxable_subtotal` | string | Required/non-null | Canonical non-negative money | Included |
| `total` | string | Required/non-null | Canonical non-negative money | Included |
| `rounding_strategy` | string | Required/non-null | `invoice-half-up-v1` | Included |
| `price_version` | string | Required/non-null | Bounded version string | Included |
| `branch_pricing_version` | string/null | Required/nullable | Conditional matrix below | Included |
| `quote_reference` | string | Required/non-null | 1–256 scalars and 1 KiB | Included |
| `quote_version` | string | Required/non-null | `financial-quote-v1` | Included |
| `quote_fingerprint` | string | Required/non-null | 64 lowercase hexadecimal characters | Included |
| `financial_engine_version` | string | Required/non-null | `financial-engine-v2-r1` | Included |
| `lines` | array | Required/non-null | Same length and order as `items` | Included except `net_amount` |
| `net_amount` | — | Forbidden at pricing root | — | — |

No additional pricing keys are permitted.

### 2.6 Pricing lines

| Field | JSON type | Presence/null | Bounds or values | Fingerprint |
|---|---|---|---|---|
| `line_id` | string | Required/non-null | Must equal corresponding item `line_id` | Included |
| `unit_price` | string | Required/non-null | Canonical non-negative money | Included |
| `pricing_source` | string | Required/non-null | `catalog_default` or `branch_override` | Included |
| `source_catalog_id` | string | Required/non-null | Canonical UUID matching item catalog ID | Included |
| `source_branch_price_id` | string/null | Required/nullable | Conditional matrix below | Included |
| `source_catalog_version` | string | Required/non-null | Bounded immutable version | Included |
| `source_branch_price_version` | string/null | Required/nullable | Conditional matrix below | Included |
| `gross_amount` | string | Required/non-null | Canonical non-negative money | Included |
| `discount_allocation` | string | Required/non-null | Canonical non-negative money | Included |
| `taxable_amount` | string | Required/non-null | Canonical non-negative money | Included |
| `vat_amount` | string | Required/non-null | Canonical non-negative money | Included |
| `net_amount` | string | Required/non-null | Canonical non-negative money; derived evidence | Derived/excluded |

No additional pricing-line keys are permitted.

### 2.7 VAT

| Field | JSON type | Presence/null | Bounds or values | Fingerprint |
|---|---|---|---|---|
| `mode` | string | Required/non-null | `exclusive`, `inclusive`, `exempt`, `zero_rated` | Included |
| `tax_inclusive` | boolean | Required/non-null | Must agree with mode | Included |
| `setting_id` | string/null | Required/nullable | Canonical UUID when non-null | Included |
| `rate` | string | Required/non-null | Canonical non-negative quantity, scale ≤3 | Included |
| `amount` | string | Required/non-null | Canonical non-negative money | Included |
| `rule_version` | string | Required/non-null | Bounded immutable version | Included |
| `effective_at` | string | Required/non-null | Canonical timestamp | Included |

No additional VAT keys are permitted.

### 2.8 Discount

| Field | JSON type | Presence/null | Bounds or values | Fingerprint |
|---|---|---|---|---|
| `id` | string/null | Required/nullable | Canonical UUID when non-null | Included |
| `source` | string | Required/non-null | `none`, `rule`, `manual` | Included |
| `name_snapshot` | string/null | Required/nullable | 1–200 scalars and 800 bytes | Included |
| `type` | string/null | Required/nullable | `percentage` or `fixed` | Included |
| `value` | string/null | Required/nullable | Canonical quantity for percentage; canonical money for fixed | Included |
| `amount` | string | Required/non-null | Canonical non-negative money | Included |
| `eligibility_version` | string/null | Required/nullable | Bounded immutable version | Included |
| `rule_version` | string/null | Required/nullable | Bounded immutable version | Included |

No additional discount keys are permitted.

### 2.9 Payment

| Field | JSON type | Presence/null | Bounds or values | Fingerprint |
|---|---|---|---|---|
| `method` | string | Required/non-null | `mada`, `cash`, `visa`, `cod` | Included |
| `amount_tendered` | string | Required/non-null | Canonical non-negative money | Included |
| `expected_status` | string | Required/non-null | `paid` or `pending` | Included |
| `cash_received` | string/null | Required/nullable | Canonical non-negative money | Included |
| `remaining_from_customer` | string | Required/non-null | Canonical non-negative money | Included |
| `cash_change` | string | Required/non-null | Canonical non-negative money | Included |
| `rule_version` | string | Required/non-null | Bounded immutable version | Included |
| `provider_reference` | string/null | Required/nullable | Non-secret reference, ≤256 scalars and 1 KiB | Excluded |
| `masked_instrument` | — | Forbidden in payload v1 | Must be stored only in separately approved payment evidence | Excluded/not stored |

No additional payment keys are permitted.

### 2.10 Fulfillment

| Field | JSON type | Presence/null | Bounds or values | Fingerprint |
|---|---|---|---|---|
| `method` | string | Required/non-null | `immediate`, `pickup`, `delivery`, `service` | Included |
| `branch_id` | string | Required/non-null | Canonical UUID; equals envelope branch | Included |
| `requested_at` | string/null | Required/nullable | Canonical timestamp when non-null | Included |
| `address` | string/null | Required/nullable | ≤1,000 scalars and 4 KiB | Included |
| `instructions` | string/null | Required/nullable | ≤1,000 scalars and 4 KiB | Included |

No additional fulfillment keys are permitted.

### 2.11 Order

| Field | JSON type | Presence/null | Bounds or values | Fingerprint |
|---|---|---|---|---|
| `note` | string/null | Required/nullable | ≤2,000 scalars and 8 KiB | Included |

No additional order keys are permitted.

### 2.12 Metadata

| Field | JSON type | Presence/null | Bounds | Fingerprint |
|---|---|---|---|---|
| `source_channel` | string | Required/non-null | `pos`, `admin`, `api` | Included |
| `request_reference` | string/null | Required/nullable | ≤512 UTF-8 bytes | Excluded |
| `offline_draft_id` | string/null | Required/nullable | Canonical UUID or approved `pos-draft-` identifier, ≤128 bytes | Excluded |
| `correlation_id` | string | Required/non-null | Safe 1–128-character correlation format | Excluded |
| `device_id` | string/null | Required/nullable | Pseudonymous, 1–128 ASCII safe characters | Excluded |
| `pos_terminal_id` | string/null | Required/nullable | Pseudonymous, 1–128 ASCII safe characters | Excluded |
| `client_version` | string/null | Required/nullable | 1–64 ASCII safe characters | Excluded |

No other metadata keys are permitted. Every individual metadata string is limited to 512 UTF-8 bytes.

Resolution of ambiguous fields:

- `metadata.trace_id`: forbidden in payload; external observability only.
- `metadata.feature_flags`: forbidden in payload v1. Behaviorally relevant decisions are represented by explicit version fields.
- `metadata.device_id`: permitted only as a pseudonymous identifier; excluded from fingerprint.
- `metadata.pos_terminal_id`: permitted only as a pseudonymous identifier; excluded from fingerprint.

### 2.13 Versions

| Field | JSON type | Presence/null | Bounds or value | Fingerprint |
|---|---|---|---|---|
| `customer_engine` | string | Required/non-null | Bounded explicit version | Included |
| `financial_engine` | string | Required/non-null | `financial-engine-v2-r1` | Included |
| `inventory_engine` | string | Required/non-null | Bounded explicit version | Included |
| `numbering_engine` | string | Required/non-null | Bounded explicit version | Included |
| `authorization_contract` | string | Required/non-null | Bounded explicit version | Included |
| `payload_contract` | string | Required/non-null | Exactly `order-command-payload-v1` | Derived/excluded |

No additional version keys are permitted.

## 3. Conditional State Matrices

### 3.1 Customer modes

| Mode | Customer ID | Record version | Phone/name fields | Allowed updates | Conflict behavior |
|---|---|---|---|---|---|
| `existing` | Required non-null | Required non-null | Snapshots may be non-null; unavailable optional snapshot fields use explicit null | Empty or selected update fields | `reject`, `reuse_without_update`, or `apply_allowed_updates` |
| `create` | Explicit null | Explicit null | `normalized_phone` and `name` required non-null; other fields may be explicit null | Must be empty | Exactly `reject` |
| `none` | Explicit null | Explicit null | All customer value fields explicit null | Must be empty | Exactly `reject` |

For `existing`:

- `apply_allowed_updates` requires a non-empty `allowed_update_fields`.
- Other conflict behaviors require an empty list.
- A listed update field must have a non-null corresponding value.

### 3.2 Discount states

| Source | ID | Name | Type | Value | Amount | Eligibility version | Rule version |
|---|---|---|---|---|---|---|---|
| `none` | null | null | null | null | `0.00` | null | null |
| `rule` | UUID | non-null | percentage/fixed | canonical value | canonical amount | non-null | non-null |
| `manual` | null | non-null | percentage/fixed | canonical value | canonical amount | null | non-null approval/version reference |

Percentage values are canonical quantities in the inclusive range `0..100`. Fixed values are canonical non-negative money.

### 3.3 Payment methods

| Method | Expected status | Amount tendered | Cash received | Remaining | Change | Provider reference |
|---|---|---|---|---|---|---|
| `cash` | `paid` | Non-negative money | Non-null; must cover total | `0.00` | Non-negative money | null |
| `mada` | `paid` | Equals total | null | `0.00` | `0.00` | Optional non-secret reference |
| `visa` | `paid` | Equals total | null | `0.00` | `0.00` | Optional non-secret reference |
| `cod` | `pending` | Canonical non-negative money | Non-null | Canonical non-negative money | `0.00` | null |

This amendment freezes structural relationships, not a new payment business rule. Runtime and Executor must continue applying the approved financial/payment calculations.

`masked_instrument` is forbidden in payload v1.

### 3.4 Pricing sources

| Source | Branch pricing version | Branch price ID | Branch source version |
|---|---|---|---|
| `catalog_default` | Explicit null | Explicit null | Explicit null |
| `branch_override` | Required non-null | Required canonical UUID | Required non-null |

For every pricing line:

- `source_catalog_id` equals the corresponding item’s `catalog_item_id`.
- `source_catalog_version` is always required.
- Root `branch_pricing_version` must be non-null if any line uses `branch_override`.
- Root `branch_pricing_version` must be null if no line uses `branch_override`.

### 3.5 VAT states

| Mode | `tax_inclusive` | Rate | Setting ID |
|---|---:|---|---|
| `exclusive` | false | Greater than zero | Required UUID |
| `inclusive` | true | Greater than zero | Required UUID |
| `exempt` | false | `0` | Nullable |
| `zero_rated` | false | `0` | Required UUID |

VAT amount remains canonical money and must agree with the authoritative quote.

### 3.6 Fulfillment states

| Method | `requested_at` | Address | Instructions |
|---|---|---|---|
| `immediate` | Explicit null | Explicit null | Optional explicit-null/non-null |
| `pickup` | Optional canonical timestamp | Explicit null | Optional explicit-null/non-null |
| `delivery` | Optional canonical timestamp | Required non-null | Optional explicit-null/non-null |
| `service` | Optional canonical timestamp | Explicit null | Optional explicit-null/non-null |

`branch_id` is always required and equals the envelope branch.

“Optional” in this state table means the key remains present and uses explicit null when no value exists.

## 4. Canonical JSON Byte Contract

### 4.1 Canonical domain

The canonicalizer accepts only:

- JSON objects
- JSON arrays
- NFC strings
- integers where the schema specifies integer
- booleans
- null

Money and quantities are JSON strings. Other JSON numbers are prohibited except schema-declared integers.

### 4.2 Duplicate keys

Duplicate keys are rejected before conversion to an ordinary object or PostgreSQL JSONB.

Runtime must parse through a duplicate-aware parser or construct the payload from typed data without parsing caller-provided JSON.

PostgreSQL must reject a submitted canonical byte sequence unless independently reserializing the parsed payload produces exactly the submitted bytes. This detects duplicate-key, key-order, whitespace, and escaping deviations because JSONB cannot reproduce a noncanonical input.

### 4.3 Object-key ordering

Object keys are sorted by Unicode scalar-value sequence:

1. Compare the first Unicode scalar value.
2. Continue scalar by scalar.
3. If one key is a prefix of another, the shorter key sorts first.
4. Locale collation is forbidden.
5. UTF-16 code-unit ordering is not the contract.

For valid NFC strings, UTF-8 binary ordering produces the same ordering as Unicode scalar-value ordering. PostgreSQL implementations may therefore use bytewise UTF-8 ordering only after validating UTF-8 and NFC.

### 4.4 String serialization

- Strings are normalized to NFC before serialization.
- Output is valid UTF-8.
- `"` is escaped as `\"`.
- `\` is escaped as `\\`.
- U+0000 through U+001F are escaped as `\u00XX` using uppercase hexadecimal digits.
- No short escape forms such as `\n`, `\t`, `\b`, `\f`, or `\r` are emitted.
- `/` is not escaped.
- Printable non-ASCII characters are emitted as their literal UTF-8 sequence.
- U+2028 and U+2029 are emitted literally.
- Valid surrogate pairs are converted to their Unicode scalar value.
- Unpaired surrogate values are rejected.
- No other character is escaped.

### 4.5 Scalars

- JSON null serializes as `null`.
- Boolean values serialize as `true` or `false`.
- Schema-declared integers serialize as minimal base-10 ASCII without leading zeros or a leading plus.
- Negative integers are not permitted by payload v1.
- Money and quantity values serialize as their canonical JSON strings.
- No floating-point JSON number is permitted.

### 4.6 Arrays

- `items` retain ascending `line_number` order.
- `pricing.lines` retain corresponding item order.
- `allowed_update_fields` are sorted by Unicode scalar-value ordering and contain no duplicates.
- `modifiers` are sorted by the frozen modifier comparator.
- All other payload-v1 arrays preserve their schema-defined order.
- Array elements are comma-separated with no whitespace.

### 4.7 Objects and whitespace

Objects serialize as:

```text
{"key":value,"next":value}
```

Rules:

- Keys use the ordering above.
- A colon separates key and value.
- A comma separates members.
- No spaces, tabs, line breaks, byte-order mark, or trailing newline are permitted.
- Optional omitted fields do not appear.
- Required nullable fields appear with `null`.

### 4.8 Fingerprint projection

The projection is constructed from the validated payload, not accepted as an independent authority.

It contains every field classified **Included**.

It omits:

- `fingerprint_version`
- `pricing.lines[].net_amount`
- `payment.provider_reference`
- all metadata except `metadata.source_channel`
- `versions.payload_contract`

Fields classified as internal-only do not exist in payload v1.

The projection is serialized using this same canonical byte algorithm.

The request fingerprint is:

```text
SHA-256(canonical fingerprint-projection UTF-8 bytes)
```

Caller-provided projection bytes may be supplied for verification, but PostgreSQL must derive the authoritative projection from the validated payload and reject any mismatch.

### 4.9 Payload size

`canonical_size_bytes` is:

```text
octet length of canonical full-payload UTF-8 bytes
```

The exact same full-payload bytes are used for size verification and immutable archival equality. They are not the fingerprint input because the fingerprint uses the classified projection.

PostgreSQL JSONB textual output is not the normative canonical representation.

## 5. Timestamp Contract

Canonical timestamps use exactly:

```text
YYYY-MM-DDTHH:mm:ss.SSSSSSZ
```

Requirements:

- Gregorian calendar.
- UTC only.
- Literal `T`.
- Six fractional-second digits, representing microseconds.
- Literal uppercase `Z`.
- No numeric offset.
- No omitted fractional component.
- No leap-second value.
- Year range `0001..9999`.
- Zero-padded month, day, hour, minute, and second.
- No surrounding whitespace.
- Represents a valid calendar timestamp.
- PostgreSQL validation must parse the value and reformat it to the same lexical representation.
- Runtime values with millisecond precision append three zero digits.
- Runtime must reject values with precision finer than microseconds rather than round them.

Examples:

- Valid: `2026-07-30T12:34:56.000000Z`
- Valid: `2026-07-30T12:34:56.123456Z`
- Invalid: `2026-07-30T12:34:56Z`
- Invalid: `2026-07-30T12:34:56.123Z`
- Invalid: `2026-07-30T15:34:56.123456+03:00`

Database issuance timestamps remain relational lifecycle fields and do not enter the fingerprint.

## 6. Modifier Contract

Modifiers are **flat only** in payload v1.

- A modifier object cannot contain child modifiers, options arrays, or arbitrary nested objects.
- Each item contains one `modifiers` array.
- Maximum modifiers per item: 20.
- Maximum modifier nesting depth: one modifier object below its item.
- The former general “maximum nested modifier depth 3” does not apply to payload v1 and is superseded by this clarification.
- Adding recursive or grouped modifiers requires a new payload version.

Canonical modifier ordering:

1. `modifier_type` by Unicode scalar-value order.
2. `modifier_id`.
3. `option_id`, null before non-null.
4. `value` by Unicode scalar-value order.
5. Canonical quantity by numeric value, with lexical form as deterministic tie-breaker.
6. Canonical price adjustment by numeric value, with lexical form as deterministic tie-breaker.

Because canonical numeric lexical forms are unique for a numeric value, the tie-breaker cannot normally distinguish two valid payload-v1 values.

The stored modifier array must already be in canonical order. PostgreSQL must reject unsorted arrays; it must not silently reorder submitted intent.

## 7. Runtime/PostgreSQL Responsibility Matrix

| Contract | Runtime MUST enforce | PostgreSQL MUST revalidate | PostgreSQL cannot safely prove | Attestation can verify |
|---|---:|---:|---:|---:|
| Exact keys and JSON types | Yes | Yes | No | Validation logic presence |
| Required/null/omitted states | Yes | Yes | No | State-matrix logic presence |
| String and byte limits | Yes | Yes | No | Limit constants |
| Decimal input normalization | Yes | Canonical output form | Original pre-normalized intent | Regex and bounds |
| Money scale | Yes | Yes | No | Regex/constants |
| UUID canonical form | Yes | Yes | No | UUID regex/checks |
| Timestamp canonical form | Yes | Yes | No | Format checks |
| Line order and identity | Yes | Yes | No | Ordering checks |
| Modifier order | Yes | Yes | No | Comparator checks |
| Duplicate JSON keys | Yes | Canonical-byte equality | Original duplicates after JSONB conversion, absent original bytes | Equality requirement |
| Unicode validity | Yes | Database encoding guarantees | Original rejected surrogate sequence after client decoding | UTF-8 database requirement |
| Unicode NFC | Yes | Use normalization support where available | Cross-runtime Unicode-version equivalence | NFC check presence |
| Unicode scalar key ordering | Yes | Canonical reserialization | Equivalence across differing Unicode implementations without version pinning | Serializer contract |
| Canonical escaping | Yes | Byte-for-byte reserialization | Original transport transformations outside function input | Serializer checks |
| Sensitive key rejection | Yes | Exact allowlists and recursive forbidden-name defense | Secret content hidden inside permitted prose | Allowlists/denylist presence |
| Secret-content detection | Yes | Bounded defensive patterns where safe | Whether arbitrary prose is truly a secret | Cannot fully attest |
| Fingerprint projection | Yes | Derive independently | Business correctness of future version meanings | Projection field inventory |
| Fingerprint hash | May calculate for comparison | Authoritative SHA-256 | No | Hash expression |
| Canonical payload size | Yes | Authoritative byte length | No | Size binding |
| Tenant/branch/actor authorization | Trusted adapter | Authoritative DB evidence | Browser-session provenance without trusted adapter | Dependency and role checks |
| Acquisition locking | No | Yes | Runtime scheduling | Lock expression/order |
| Atomic three-record creation | No | Yes | Commit outcome before execution | Insert and transaction structure |
| RLS/ACL/ownership | No | Database enforcement | No | Exact catalog checks |
| Free-text business appropriateness | Yes | Length/type only | Semantic intent | No |
| External provider-reference secrecy | Yes | Shape/length and forbidden-key checks | Whether opaque value embeds a secret | Partial |

## 8. Normative Amendment Rules

### MUST

1. Payload v1 must contain exactly the root and nested keys defined by this amendment.
2. Every required nullable key must be present and use JSON null when unavailable.
3. No unspecified key is permitted.
4. The discount object must always exist, including the `none` state.
5. Metadata must use snake_case field names exactly as specified.
6. `trace_id`, `feature_flags`, and `masked_instrument` must not appear in payload v1.
7. Device and terminal IDs must be pseudonymous bounded identifiers.
8. All money and quantity values must be canonical JSON strings.
9. All UUID strings must be lowercase canonical hyphenated UUIDs.
10. All canonical timestamps must use six-digit UTC microsecond format.
11. Modifiers must be flat and already canonically sorted.
12. Runtime must produce canonical bytes using the frozen algorithm.
13. PostgreSQL must derive the authoritative projection from the validated payload.
14. PostgreSQL must hash its canonical projection bytes, not arbitrary caller text.
15. PostgreSQL must bind `canonical_size_bytes` to canonical full-payload bytes.
16. PostgreSQL must reject submitted canonical bytes that differ from its canonical reserialization.
17. Attestation must verify the presence and static shape of these enforcement boundaries.
18. Secret-content detection in permitted prose remains a Runtime responsibility and must not be represented as fully database-provable.

### MUST NOT

1. This amendment must not change payload or fingerprint version identifiers.
2. It must not change line-order participation in the fingerprint.
3. It must not merge duplicate catalog lines.
4. It must not add recursively nested modifiers.
5. It must not use PostgreSQL JSONB textual output as canonical bytes.
6. It must not accept floating-point JSON numbers for money or quantity.
7. It must not permit raw feature-flag collections.
8. It must not permit trace IDs in the payload.
9. It must not persist masked payment evidence without a future separately versioned approval.
10. It must not claim PostgreSQL can identify every secret embedded in permitted prose.
11. It must not change invoice/invoice-item authority over committed financial truth.
12. It must not activate Runtime or Executor behavior.

### SHALL

1. P2D.18A shall be interpreted together with P2D.17 and P2D.18.
2. Where this amendment resolves ambiguity, this amendment controls.
3. All unamended P2D.17 and P2D.18 decisions remain normative.
4. Any incompatible future field, state, canonicalization, or projection change shall require a new payload or fingerprint version.
5. Runtime and PostgreSQL shall implement independently testable canonicalizers against the same frozen vectors before activation.

## 9. Readiness Decision

The exact payload schema, conditional states, canonical bytes, timestamps, modifier structure, and enforcement responsibilities are now frozen without changing the approved storage or acquisition architecture.

READY TO REVISE P2D.19 AND P2D.20