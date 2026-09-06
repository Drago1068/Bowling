# ADR-002 — Server Sync Foundation (ARCH-001 Slice 2)

- **Status**: Proposed (pending Architecture Owner acceptance)
- **Slice**: ARCH-001 Slice 2 — NAS canonical persistence + server sync foundation
- **Owner**: ChatGPT (Architecture Owner); Implementers: OpenCode (domain/platform), this slice (server)

## Context

The mobile baseline (Slice 1) established offline-first canonical entities and a
durable outbox. Slice 2 provides the server half: a NAS that durably accepts
authoritative bowling facts without losing observations, duplicating
submissions, overwriting conflicting edits, or trusting client-derived scores.

## Decisions

### D1 — TypeScript/Node modular monolith on PostgreSQL

Server runtime stays TypeScript (Node), consistent with the accepted domain
foundation, reusing the portable domain value objects (entities, hashing,
versioning, correction, envelope). PostgreSQL is the authoritative persistence
for synchronized facts. No microservices, Kafka, Redis, generalized event
sourcing, or public-cloud correctness dependencies. The application boundary is
independent of HTTP (`server/application`), with a thin HTTP layer
(`server/api`).

### D2 — Canonical persistence model

A single `canonical_entities` table (JSONB payload + indexed metadata columns)
preserves the canonical synchronized representation without premature
per-bowling-entity decomposition. Identity `(entity_type, entity_id)` is the
unique key; `entity_version` is constrained `>= 1`. Immutable identity
(`entity_type`, `entity_id`, `origin_device_id`, `created_at`) is enforced at the
application layer and not part of the mutable update set.

### D3 — Idempotent submission identity

`submission_idempotency` keyed on `submission_id`. The server recomputes the
canonical payload hash (never trusts the client hash). Same `submission_id` +
same hash → replay prior result (`ALREADY_ACCEPTED`); same id + different hash →
`REJECTED` (submission-id collision, audited).

### D4 — No last-write-wins

UPDATE/CORRECT compare `expected_entity_version` against the canonical version
under a row lock (`SELECT ... FOR UPDATE`). On mismatch the incoming observation
is preserved as a durable `sync_conflicts` row (never discarded) and `CONFLICT`
is returned. Canonical state is not mutated.

### D5 — Transactional acceptance

A push applies within one transaction:
`idempotency lookup -> validate -> load/version-check -> (conflict | apply) ->
canonical write -> idempotency record -> audit -> change-feed record -> COMMIT`.
`ACCEPTED` is returned only after all of this is durably committed; there is no
partial-ACCEPTED window.

### D6 — Correction is auditable, not a rewrite

CORRECT references a target and `prior_entity_version`, preserves immutable
identity, increments the canonical version once, sets `data_quality=CORRECTED`,
and records lineage in the audit log. The correction is idempotent via
`submission_id`.

### D7 — Change feed for pull

`change_feed` is a monotonically orderable (`BIGSERIAL`) record of accepted
changes. Pull is cursor-based (`after`, `limit`) and non-destructive: repeating
a cursor yields the same ordered sequence.

### D8 — Protocol/schema compatibility gates

The server accepts `SYNC_PROTOCOL_VERSION=1` and schema versions `[1]`.
Unsupported protocol/schema are rejected explicitly (`UNSUPPORTED_PROTOCOL` /
`UNSUPPORTED_SCHEMA`), never silently coerced.

### D9 — Device identity is not authentication

`devices` records first/last seen only. `device_id` possession is not treated as
proof of user identity. Authentication is deferred and documented as
`AUTHENTICATION=NOT_YET_IMPLEMENTED`; the application boundary has a clear
insertion point.

## Consequences

- Raw bowling observations are canonical; the server does not trust client
  scoring.
- Conflict artifacts and change-feed records make later resolution/reconciliation
  possible without data loss.

## Deviation

None. No ARCH-001 contract (UUIDv7, versioning, envelope, hashing, correction,
sync states, outbox, SQLite) was changed. The accepted operation set remains
`CREATE | UPDATE | DELETE | CORRECT`; the mapping "ARCHIVE" in Slice 2 guidance
corresponds to the accepted `DELETE` (soft archive) operation.