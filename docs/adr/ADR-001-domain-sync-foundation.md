# ADR-001 — Domain & Sync Foundation (ARCH-001 Slice 1)

- **Status**: Proposed (pending Architecture Owner acceptance)
- **Slice**: BOWLING ARCH-001 Slice 1
- **Owner**: ChatGPT (Architecture Owner); Implementer: OpenCode

## Context

Every future mobile and NAS component depends on the domain identity,
versioning, synchronization, and persistence foundations. This ADR records the
normative decisions that later slices and Cursor (mobile) must not contradict.

## Decisions

### D1 — Identity is UUIDv7, not PostgreSQL serials

Canonical entity identity is an offline-generatable UUIDv7 (RFC 9562),
time-ordered and globally unique. Namespaced with strong identity brands
(`UserId`, `GameId`, etc.) that are erased at runtime. Sequential backend IDs
are never used as domain identity.

The generator implements RFC 9562 "monotonicity within a process" (counter
method): a 74-bit monotonic tail anchored to a non-decreasing 48-bit logical
timestamp. A regressed or repeated wall-clock timestamp never moves the logical
clock backwards, and >4096 ids in one millisecond spill into the next logical
millisecond rather than wrapping a 12-bit counter. Result: lexically monotonic,
globally unique UUIDv7.

### D2 — Optimistic entity versioning

`entity_version` starts at `1` and increments exactly once per accepted semantic
mutation. Timestamps are never the sole concurrency mechanism. Mutations carry
`expected_entity_version`; a mismatch is a `StaleEntityVersionError`.

### D3 — Entity metadata

Every synchronized canonical entity carries: `id`, `schema_version`,
`entity_version`, `created_at`, `updated_at`, `origin_device_id`,
`data_quality`, plus optional `deleted` (soft archive).

### D4 — Data quality is honest

`data_quality` is one of `COMPLETE | PARTIAL | CORRECTED | INFERRED | UNKNOWN`.
`UNKNOWN` is first-class and legitimate. Code never manufactures unobserved
bowling facts.

### D5 — Mutation envelope

`protocol_version`, `submission_id` (client-generated UUIDv7), `device_id`,
`entity_type`, `entity_id`, `operation_type`, `expected_entity_version`,
`payload`, `payload_hash`, `created_at`. The same logical mutation retains the
same `submission_id` across retries.

### D6 — Deterministic payload hashing

`payload_hash` = SHA-256 over the canonical serialization. Canonical
serialization rules (normative):

1. Object keys sorted lexicographically at every nesting level (no reliance on
   insertion order).
2. Array element order preserved (arrays are not sorted).
3. Strings emitted verbatim as UTF-8.
4. Numbers via JSON formatting; only finite numbers permitted.
5. No insignificant whitespace.
6. `undefined`, functions, symbols, bigint, `NaN`, `±Infinity`, and non-plain
   objects (Date/Map/Set) are rejected up front, not silently coerced.

Invariants: same submission_id + same semantic payload → identical hash; same
submission_id + different payload → different hash.

### D7 — Sync state machine

States: `LOCAL_ONLY`, `QUEUED`, `SUBMITTED`, `ACCEPTED`, `CONFIRMED`,
`RETRYABLE_ERROR`, `CONFLICT`, `REJECTED`. NAS acceptance (`ACCEPTED`) is
distinct from client acknowledgement (`CONFIRMED`).

Legal transitions:

```
LOCAL_ONLY       -> QUEUED, REJECTED
QUEUED           -> SUBMITTED, REJECTED
SUBMITTED        -> ACCEPTED, RETRYABLE_ERROR, CONFLICT, REJECTED
ACCEPTED         -> CONFIRMED
RETRYABLE_ERROR  -> QUEUED, REJECTED
CONFLICT         -> QUEUED, REJECTED
CONFIRMED        -> (terminal)
REJECTED         -> (terminal)
```

`ACCEPTED` is terminal-until-acknowledged: it must not revert to uncertainty
about NAS commitment (no `ACCEPTED -> RETRYABLE_ERROR`). Client acknowledgement
failure is recovered by re-acknowledging/reconciling toward `CONFIRMED` while
the accepted server state is preserved.

### D8 — Persistence contracts (not a framework)

Explicit, domain-specific storage interfaces: canonical entities, device
identity, durable outbox, applied-change inbox, sync checkpoint, and
corrections. These are the stable seams Cursor binds a React Native SQLite
driver behind.

### D9 — SQLite baseline

Single `canonical_entities` table keyed by `(entity_type, id)` with JSON payload
plus indexed metadata columns, plus `device_identity`, `sync_outbox`,
`applied_changes`, `sync_checkpoint`, and `corrections` tables. Crash-safe via
SQLite WAL journal.

### D10 — Transactional outbox

A local mutation writes the canonical entity and its outbox entry in one
transaction; there is no state where either is durably ambiguous.

### D11 — Correction is append-only, atomically applied audit data

A `Correction` records target entity type/id, `prior_entity_version`,
`corrected_representation`, optional `change` delta, `reason`, `actor`,
`origin_device_id`, timestamps. Corrections never delete or silently overwrite
history; the original representation remains traceable.

Corrections are applied atomically: append the immutable correction record,
apply the corrected representation (preserving immutable id/type/origin/
created_at), increment the target `entity_version` exactly once, set
`data_quality=CORRECTED`, update `updated_at`, and enqueue a `CORRECT` outbox
mutation — all in one transaction. Any failure rolls back the whole operation.

## Consequences

- Identity and versioning are stable across offline creation, retry, sync,
  correction, restarts, and NAS reconciliation.
- No speculative frameworks (Redis, Kafka, event sourcing, microservices,
  GraphQL, vector DB) are introduced in this slice.
- Field-level domain modeling beyond identity/cross-references is deferred to a
  later authorized slice.

## Deviation / stop condition

This slice did not alter the stated architecture (UUIDv7 identity, optimistic
versioning, correction semantics, SQLite persistence, mutation-envelope
semantics, outbox model, data-quality semantics, or canonical/derived boundary).
No architectural deviation requiring a further ADR is reported.