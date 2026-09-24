# ADR-008 — B1 PinState Persistence and Sync Technical Contract

- **Status**: **ACCEPTED** by Architecture Authority (2026-09-21), including
  integrity safeguards in §2–§6. Implementation is **not** authorized.
- **Work package**: `BOWLING_ADR_008_TECHNICAL_ACCEPTANCE`
- **Requirements authority**: `docs/adr/ADR-007-pin-detail-and-analysis-requirements.md`
  (**ACCEPTED**; U1–U3 unchanged)
- **Baseline**: `arch/001-domain-sync-foundation` at
  `624f1ccd0c9c3f5b444470c5aace04310dfbc1cc`
  (tree `38a99b05dd589cdb5823311a8d78403d5e3e779c`)
- **Owner**: ChatGPT (Architecture Owner)

> **TECHNICAL CONTRACT ACCEPTED. IMPLEMENTATION NOT AUTHORIZED.**
> `ADR_008_ACCEPTED=true`
> `B1_TECHNICAL_CONTRACT=ACCEPTED`
> `IMPLEMENTATION_AUTHORIZED=false`
> `FIELD_VALIDATION=PAUSED`
> `PRODUCTION_RELEASE_AUTHORIZED=false`
> Accepted migrations/validation must not be executed until a separate B1
> implementation-authorization package explicitly grants code work.

---

## 0. Accepted technical direction

| Topic | Decision |
| --- | --- |
| Local save | Atomic multi-entity SQLite transaction: Roll ± PinState + outbox rows |
| Storage | Generic `canonical_entities` — **no dedicated PinState table** |
| Association DDL | Partial unique indexes: ≤1 **active** PinState per `roll_id` (SQLite + Postgres) |
| Sync | Separate existing envelopes — **no batch protocol** |
| Applicability field | `PinState.basis_roll_version` (explicit; required for EFFECTIVE) |
| Remove / re-add | Soft DELETE / archive; re-add = **new** UUIDv7 only |
| Server | Shape validation + association uniqueness; **no** reject solely because Roll missing |
| Retries | Stable entity ids + `submission_id`s; never mutate payload under an existing submission id |

Local TX atomicity ≠ atomic multi-entity server visibility.

---

## 1. Inspection constraints (cited)

| Fact | Path |
| --- | --- |
| PK `(entity_type, entity_id)` only | `server/migrations/001_sync_foundation.sql`, `src/persistence/sqlite/migrations.ts` |
| CREATE if row exists → CONFLICT (includes archived) | `server/sync/pushPipeline.ts` `applyCreate` |
| DELETE = archive + version bump | `applyArchive` |
| Push CONFLICT stores `incoming_payload` | `server/persistence/postgres/repositories.ts` `conflictRepo` |
| Client CONFLICT stores losing payload | `src/persistence/contracts.ts` `ConflictRecord.local_payload`; `conflictStore.ts` |
| Pull applies page + checkpoint in one TX | `src/sync/coordinator.ts` `pull` |
| Unhandled constraint failure aborts whole pull TX | SQLite/Postgres default — must not be left unhandled |

---

## 2. Index and migration policy (accepted)

### 2.1 Identical active-record predicate (both databases)

A PinState row is **active** for association uniqueness iff:

```text
entity_type = 'PinState' AND archived = false
```

(`archived = 0` on SQLite.) Soft-deleted / archived rows do **not** consume the
association slot.

### 2.2 Identical roll_id extraction

| Engine | Expression |
| --- | --- |
| SQLite | `json_extract(payload, '$.roll_id')` |
| PostgreSQL | `payload->>'roll_id'` |

Semantics: JSON text string equal to `PinState.roll_id`. NULL or missing
`roll_id` on an active row is **malformed**.

### 2.3 Indexes (approved DDL — not to be applied until B1 implementation auth)

**SQLite** — new migration version in `src/persistence/sqlite/migrations.ts`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_pinstate_active_roll
ON canonical_entities(
  json_extract(payload, '$.roll_id')
)
WHERE entity_type = 'PinState' AND archived = 0;
```

**PostgreSQL** — new version in `server/persistence/postgres/migrations.ts`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_pinstate_active_roll
ON canonical_entities ((payload->>'roll_id'))
WHERE entity_type = 'PinState' AND archived = FALSE;
```

### 2.4 Pre-index duplicate / malformation detection (mandatory)

**Before** `CREATE UNIQUE INDEX` on each database:

1. Enumerate all active PinState rows (`entity_type = 'PinState' AND NOT archived`).
2. **Fail the migration** (non-zero / thrown error) if any of:
   - missing/null/non-string `roll_id`;
   - two or more active rows share the same `roll_id`;
   - `standing_pins` present but not an array of distinct ints in 1..10
     (null `standing_pins` on active row = malformed under this contract).
3. On failure: **preserve all records**; do **not** delete, merge, rename
   identities, or auto-choose a winner. Operators resolve duplicates under
   Decision 4-4 / explicit repair **before** re-running migration.
4. On clean scan only: create the unique index.

B1 on this baseline has **no** production PinState rows; the scan is still
mandatory for safety on any DB that may contain them.

### 2.5 Legacy detail lacking `basis_roll_version`

| Condition | Reader state |
| --- | --- |
| Active PinState missing `basis_roll_version` or non-integer | **Never EFFECTIVE** |
| Must not invent / default a basis version from current Roll | Forbidden |

Treat as **STALE_DETAIL** if Roll exists (repair: correct or soft-delete and
re-add with explicit basis), or **MISSING_DEPENDENCY** only when Roll itself
is absent. Prefer **STALE_DETAIL** when Roll is present so repair is obvious.
Malformed shape → **INVALID_OBSERVATION** if Roll present and shape fails
§5; still never invent basis to become EFFECTIVE.

---

## 3. Basis version and rack applicability (accepted)

### 3.1 Necessary but not sufficient

`PinState.basis_roll_version === Roll.entity_version` is **necessary** for
**EFFECTIVE**. It is **not sufficient**.

Also required for EFFECTIVE:

1. Roll exists, not deleted; PinState active (not archived).
2. Pinfall/cardinality consistent with the pre-delivery rack count under
   ADR-007 rack rules (incl. tenth `10,9,1`).
3. If prior standing **identities** are known: standing set is a subset of
   that prior set; pinfall matches knock-downs from that set.
4. If prior identities unknown: cardinality-only checks; do not invent pins.
5. Game-graph rack dependencies available enough to evaluate (1)–(4). If an
   **earlier** delivery’s correction changes the remaining rack while this
   Roll’s `entity_version` is unchanged, later detail may become
   **INVALID_OBSERVATION** even though `basis_roll_version` still matches.

### 3.2 Reader taxonomy (exhaustive)

| State | Definition |
| --- | --- |
| **NOT_RECORDED** | Roll present; no active PinState for `roll_id` |
| **MISSING_DEPENDENCY** | Active PinState; linked Roll absent / not yet available — **unresolved**, not proven invalid |
| **EFFECTIVE** | §3.1 all pass |
| **STALE_DETAIL** | Active PinState; Roll present; basis missing/unequal to current Roll version (incl. legacy without basis) |
| **INVALID_OBSERVATION** | Versions align (or N/A) but rack/subset/cardinality **fails** with available facts — **proven invalid**, preserve for repair |
| **CONFLICTING_DETAIL** | >1 active PinState per `roll_id` (should not occur post-index; safety net) **or** open association conflict with a preserved competing payload |
| **ARCHIVED** | Soft-deleted PinState — not shown as recorded detail |

Never silent newest-wins across competing PinState IDs.

---

## 4. Conflict preservation (accepted)

### 4.1 Server: uniqueness collision on PinState CREATE

Losing observation must enter the established conflict path
(`conflictRepo.insert` with `incoming_payload`), plus durable idempotent
push result `CONFLICT` — same family as version conflicts in
`pushPipeline.ts` `recordConflict`.

**PostgreSQL containment (mandatory):** a unique violation aborts the current
statement and, if unhandled, the whole push transaction — so conflict /
idempotency rows would not commit.

Required pattern for PinState CREATE (and any insert that can hit
`ux_pinstate_active_roll`):

1. `SAVEPOINT pinstate_assoc` (name illustrative).
2. Attempt insert.
3. On unique_violation for `ux_pinstate_active_roll`:
   `ROLLBACK TO SAVEPOINT pinstate_assoc` (statement failure contained).
4. Then `recordConflict` + idempotent CONFLICT result inside the **same outer**
   push transaction.
5. Release savepoint on success.

Do **not** assume execution can continue after an unhandled unique violation.
Optional pre-lookup of an active peer by `roll_id` may reduce hits but does
**not** replace savepoint containment (races).

**SQLite server-analog / client push:** catch constraint error for that index,
do not leave the outer TX poisoned, then record CONFLICT equivalently.

### 4.2 Client push CONFLICT

Existing coordinator path: outbox → CONFLICT; `conflicts.record` with
`local_payload` = rejected envelope payload (`coordinator.ts`). Preserve
OPEN until explicit resolution. Do not overwrite canonical or invent a winner.

---

## 5. Delete / re-add ordering (accepted)

| Order | Outcome |
| --- | --- |
| DELETE (archive) then CREATE new id | ACCEPT when shape valid; unique slot free |
| CREATE new id while prior active still present | Unique collision → **CONFLICT** (§4); prior remains active; losing CREATE payload preserved in conflict / client conflict store |
| Retry same CONFLICT submission | Idempotent CONFLICT / do **not** change payload under that `submission_id`; do **not** busy-retry forever |
| After prior is archived (pulled or local) | Client issues a **new** CREATE with **new** `submission_id` and **new** PinState UUIDv7 |

**No automatic convergence** is promised when CREATE-before-DELETE occurs.
Terminal CONFLICT is the accepted outcome until a human/device repair issues a
fresh CREATE after observing archive. Existing version/conflict mechanisms are
sufficient; no batch dependency protocol is added.

Same-id CREATE after archive remains **impossible** (`applyCreate` if row
exists → CONFLICT). Re-add always new UUIDv7.

---

## 6. Local pull collision policy (accepted)

When a pulled PinState change would install a **second active** PinState for a
`roll_id` already held by a different local active id (pending outbox and/or
canonical):

1. **Detect before upsert** (query active PinState by extracted `roll_id`) so
   an unhandled UNIQUE error cannot abort the pull page transaction.
2. **Keep** the local active row in `canonical_entities`.
3. **Do not** install the remote row as canonical.
4. In the **same** pull transaction:
   - Record `ConflictRecord` (new local `conflict_id` UUIDv7):
     - `entity_type=PinState`, `entity_id` = **remote** id,
     - `local_payload` = **full remote PinState payload** (the observation
       excluded from canonical storage; documented overload of this field for
       **pull association conflicts**),
     - `canonical_entity_version` = local active PinState’s `entity_version`,
     - `status=OPEN`;
   - Mark the remote change **applied** in `applied_changes` so the pull
     checkpoint may advance (no live-lock);
   - Advance checkpoint with the rest of the page as today.
5. Reader: **CONFLICTING_DETAIL** for that `roll_id` until explicit repair.
6. If detection misses and SQLite raises UNIQUE: catch inside the per-change
   handling, apply steps 2–5, **never** commit a checkpoint advance without
   durable conflict recording, and **never** silently drop local or remote
   observation bytes.

Remote ARCHIVE of the competing id: apply normally (soft-delete remote id if
present, or no-op); may clear association conflict when only one active remains.

Preserve existing pull page atomicity: either the whole page TX commits
(including any association conflicts recorded) or it rolls back with
checkpoint unchanged.

---

## 7. Validation boundaries (accepted)

### 7.1 Local (before enqueue / on Fix)

- Shape: `roll_id`; `basis_roll_version` positive int on new writes;
  `standing_pins` = distinct ints 1..10, empty OK, null forbidden.
- Untouched selector → no PinState row.
- ≤1 active local PinState per `roll_id`.
- When Roll known: basis equals current Roll version; rack/subset/cardinality
  per ADR-007.

### 7.2 Server

- Shape as above on CREATE/UPDATE/CORRECT PinState payloads.
- Association via unique index + §4 savepoint → CONFLICT.
- **Do not** reject PinState CREATE solely because Roll has not arrived.
- Full rack graph checks are local + reader responsibilities for EFFECTIVE vs
  INVALID (B1).

### 7.3 Corrections invalidating downstream

Preserve downstream PinState; classify STALE_DETAIL or INVALID_OBSERVATION;
Decision 4-4 repair; no silent rewrite.

---

## 8. Atomic local save and retries (accepted)

1. Pinfall-only: existing single-entity `applyLocalMutation`.
2. Pinfall + detail: one `transaction()` — Roll, optional PinState, all outbox
   rows; or full rollback.
3. Multi-mutation helper; do not nest `applyLocalMutation`.
4. Retry: same Roll id, PinState id, submission ids, payloads.

---

## 9. Acceptance scenarios (contract tests when implementing)

1. Two-device competing CREATEs → one ACCEPT, one CONFLICT with preserved
   losing payload; savepoint containment on Postgres.
2. Roll↔detail CORRECT either order → STALE then repair with new basis.
3. Same-count different pins → CORRECT same PinState id.
4. Remove / retry DELETE / re-add new id; CREATE-before-DELETE → CONFLICT then
   fresh submission after archive.
5. PinState before Roll → MISSING_DEPENDENCY; no poison reject.
6. Legacy without basis → never EFFECTIVE.
7. Earlier-delivery correction invalidates later detail with unchanged later
   Roll version → INVALID_OBSERVATION.
8. Local pull association collision → local kept, remote in conflict record,
   checkpoint advances, no silent loss.
9. Atomic local rollback mid multi-mutate; stable submission replay.

---

## 10. B1 code boundary (after separate implementation authorization)

| Approved change | Notes |
| --- | --- |
| T1 Multi-entity local TX helper | Required |
| T2 Capture + direct frame/ball Fix | No analysis / no PinLeave |
| T3 Partial unique indexes + pre-index fail-closed scan | §2 |
| T4 `basis_roll_version` on PinState | Entity representation |
| T5 Server shape validation + savepoint CONFLICT | §4, §7 |
| T6 Reader taxonomy + pull association collision | §3, §6 |
| T7 Tests for §9 | Required |

---

## 11. Status

```ini
WORK_PACKAGE=BOWLING_ADR_008_TECHNICAL_ACCEPTANCE
RESULT=PASS
ADR_008_ACCEPTED=true
B1_TECHNICAL_CONTRACT=ACCEPTED
INDEX_AND_MIGRATION_POLICY=PRECHECK_FAIL_CLOSED_THEN_PARTIAL_UNIQUE_INDEX
BASIS_VERSION_AND_RACK_APPLICABILITY=NECESSARY_NOT_SUFFICIENT_PLUS_RACK_RULES
CONFLICT_PRESERVATION=SAVEPOINT_THEN_RECORD_CONFLICT_WITH_INCOMING_PAYLOAD
DELETE_READD_ORDERING=CREATE_BEFORE_DELETE_TERMINAL_CONFLICT_FRESH_SUBMISSION_AFTER_ARCHIVE
LOCAL_PULL_COLLISION_POLICY=KEEP_LOCAL_RECORD_REMOTE_IN_CONFLICT_ADVANCE_CHECKPOINT
LEGACY_COMPATIBILITY=NO_BASIS_NEVER_EFFECTIVE_NO_INVENTED_BASIS
DDL_CHANGES_REQUIRED=PARTIAL_UNIQUE_INDEX_UX_PINSTATE_ACTIVE_ROLL_SQLITE_AND_POSTGRES
ENTITY_OR_PROTOCOL_CHANGES_REQUIRED=PINSTATE_BASIS_ROLL_VERSION;SERVER_PINSTATE_SHAPE_VALIDATION;UNIQUE_VIOLATION_SAVEPOINT_CONFLICT;PULL_ASSOC_CONFLICT_HANDLING
UNRESOLVED_DECISIONS=none
IMPLEMENTATION_AUTHORIZED=false
FIELD_VALIDATION=PAUSED
PRODUCTION_RELEASE_AUTHORIZED=false
BASELINE_COMMIT=624f1ccd0c9c3f5b444470c5aace04310dfbc1cc
BASELINE_TREE=38a99b05dd589cdb5823311a8d78403d5e3e779c
```
