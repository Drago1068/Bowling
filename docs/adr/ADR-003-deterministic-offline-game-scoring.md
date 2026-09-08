# ADR-003 — Deterministic Offline Game Scoring (ARCH-001 Slice 4)

- **Status**: Accepted (Architecture Authority requirements approval; implementation not authorized)
- **Slice**: BOWLING ARCH-001 Slice 4 — Deterministic Offline Game Scoring
- **Owner**: ChatGPT (Architecture Owner); Implementer: OpenCode (future, not authorized)
- **Work package**: `BOWLING_ARCH_001_SLICE_4_ARCHITECTURE_ACCEPTANCE_CLOSURE`

> **THIS DOCUMENT IS ACCEPTED REQUIREMENTS AND DESIGN ONLY.**
> `IMPLEMENTATION_AUTHORIZED=false`. Architecture Authority approved the Slice 4
> architectural direction and requirements after the clarifications in this record.
> No Slice 4 production behavior is implemented or authorized. Production code,
> migrations, dependencies, and sync contracts are unchanged by this work package.

---

## 1. Context and baseline

This specification is written against the accepted application baseline and the
accepted synchronization architecture, and it must not contradict them:

- **ADR-001 — Domain & Sync Foundation** (ARCH-001 Slice 1): UUIDv7 identity,
  optimistic entity versioning, honest `data_quality` (never manufacture
  unobserved facts), mutation envelope, canonical payload hashing, the sync
  state machine, SQLite baseline, transactional outbox, and append-only,
  atomically applied corrections.
- **ADR-002 — Server Sync Foundation** (ARCH-001 Slice 2): TypeScript/Node
  modular monolith on PostgreSQL, canonical persistence, idempotent submission
  identity, no last-write-wins, transactional acceptance, auditable correction,
  cursor-based change feed, protocol/schema gates, device identity is not
  authentication, and the accepted rule that **raw bowling observations are
  canonical; the server never trusts client-derived scores**.
- **Accepted application baseline** (Slice 3): commit
  `c04d46930b9644a05505615170892754830a0572` (tree
  `69f005eff08c8991bbc539e4c27c1a8c84b803b9`), merged fast-forward into the
  default branch, post-merge smoke verified.
- **Accepted synchronization contracts** (Slice 3 evidence): uncertain-delivery
  convergence via `ALREADY_ACCEPTED`, same `submission_id` replay, ACCEPTED
  receipt durability, restart recovery, false-sync prevention, pull atomicity,
  and the change-id-based rollback contract.

Accepted application bytes and accepted sync contracts are **frozen** (see
section 10). If a Slice 4 requirement would require changing one of the frozen
items, implementation of that requirement is **STOP / HOLD** with
`ARCHITECTURE_CONCERN=<exact issue>` recorded, and the requirement is returned
for Architecture Authority approval before any work proceeds.

---

## 2. Objective

`ARCH-001_SLICE_4_DETERMINISTIC_OFFLINE_GAME_SCORING`

One bowler can start, record, correct, complete, and reopen one standard
ten-pin bowling game **offline**, using durable observed bowling facts,
deterministic derived scoring, file-backed restart recovery, and the already
accepted (Slice 1–3) synchronization architecture.

The scoring rule authority is the pinned USBC Playing Rules, edition
`2026-2027` (Decision 4-1 APPROVED; see section 3). Scoring is never
re-derived from client behavior, and scoring output is never synchronized or
treated as an authoritative fact.

---

## 3. Ten-pin rule authority

**No existing authority exists in this repository.** ADR-001 defers field-level
domain modeling ("scoring rules ... are intentionally OUT of scope until a later
authorized slice"); ADR-002 establishes that the server never trusts
client-derived scores but does not define scoring rules; README.md states there
is no scoring UI or logic; no existing domain test encodes scoring rules.

**Architecture Authority Decision 4-1: APPROVED. Rule reference pinned.**

```ini
RULE_AUTHORITY=USBC_PLAYING_RULES
RULE_EDITION=2026-2027
SCORING_DOMAIN=AMERICAN_TENPINS
RULE_REFERENCE_IMMUTABLE=true
HISTORICAL_RECOMPUTATION_RULESET_PINNED=true
EXTERNAL_FUTURE_RULE_CHANGES_DO_NOT_MUTATE_EXISTING_RESULTS=true
```

Governing body: United States Bowling Congress (`RULE_AUTHORITY=UNITED_STATES_BOWLING_CONGRESS`).
Rule set: USBC Playing Rules, edition **2026-2027**. Scoring domain: American Tenpins
(Chapter 2, Rule 2 of that edition).

Immutable in-repository provenance (artifact **not** stored; USBC copyright):
`docs/reference/usbc-playing-rules-2026-2027.provenance.md`

```ini
SOURCE_URL=https://images.bowl.com/bowl/media/assets/usbc/rules/general%20pdfs/usbc-playing-rulebook-26-27.pdf
LISTING_URL=https://bowl.com/rules
RETRIEVED_AT=2026-09-07T13:43:00Z
SOURCE_SHA256=4cb44a2a9d62fdf18957da2db4646e05342eebdc308cc56711a6249ad2cdddec
```

Do not substitute an unversioned phrase such as “current edition.” The scoring
engine must not silently change behavior when USBC publishes a later edition.
Future rule adoption requires an explicit architecture/version change. The same
accepted roll facts under this pinned 2026–2027 reference recompute identically.

If Architecture Authority later determines international scope, World Bowling
(WB) Rules remain an alternative authority; they are not adopted here. That
alternative would not change the derivation contract below.

---

## 4. Core scoring invariant

```
OBSERVED_ROLL_FACTS=AUTHORITATIVE
DERIVED_SCORE=NON_AUTHORITATIVE
```

Conceptual model (normative):

```
ROLL_FACTS
  → DETERMINISTIC_GAME_STATE
  → DERIVED_FRAME_SCORE
  → DERIVED_GAME_SCORE
```

Invariants:

- Scores, frame statuses (open/spare/strike), running totals, and the final
  total are **derived only**. There is **no authoritative score store**, no
  authoritative frame-score column, and no cached score trusted across reloads.
- The same accepted roll facts under the same pinned scoring-rule version recompute
  deterministically (identical derived game state) on every load.
- A score is never a sync payload; derived values are never represented as
  observed facts (`data_quality` remains honest — see ADR-001 D4).

---

## 5. Durable roll identity

Preserve accepted identity architecture: canonical entity identity is
offline-generatable, monotonic, globally unique **UUIDv7** (ADR-001 D1; RFC 9562).

Normative invariant:

```
ROLL_IDENTITY != DISPLAY_POSITION
```

A roll's identity must not depend on: frame number, roll number, array index,
display position, or score. Existing roll IDs are **not** replaced,
reinterpreted, combined with frame/roll position, or reused. A roll is the same
roll across retries, sync, correction, reopen, and restart regardless of where
it displays.

---

## 6. Minimum lifecycle

Define only the smallest lifecycle required for one bowler and one game.

| State | Definition |
| --- | --- |
| `NOT_STARTED` | A game identity (and any allowed frame identity/linkage) with **zero** roll facts. Valid. No roll is manufactured to represent creation. |
| `IN_PROGRESS` | A game whose first effective roll has been recorded and whose ordered, legal fact set does not yet fully resolve all ten frames. First-class and valid. |
| `COMPLETED` | A game whose ordered, legal fact set fully resolves all ten frames, including all tenth-frame bonus rolls required by the pinned rule reference. |

```ini
GAME_IDENTITY_MAY_EXIST_WITH_ZERO_ROLL_FACTS=true
ZERO_ROLL_GAME_STATE=NOT_STARTED
FIRST_EFFECTIVE_ROLL_TRANSITIONS_DERIVED_STATE_TO=IN_PROGRESS
LEGAL_COMPLETE_FACT_SET_TRANSITIONS_DERIVED_STATE_TO=COMPLETED
LIFECYCLE_FIELD_PERSISTED=false
```

```
START_GAME   = persist game identity and allowed frame identity/linkage. Does not require a roll. Does not manufacture a roll.
COMPLETE_GAME= no user action required; completion is DERIVED when the fact set legally resolves all frames.
REOPEN_GAME  = authorized correction activity on a completed game (see section 7).
ABANDON_GAME = NOT REQUIRED; there is no justified abandonment workflow in this slice.
```

`start = first roll` is **not** the creation of `game_id`. Game identity/linkage
may exist before any roll fact. The first effective (legal) roll transitions
derived state from `NOT_STARTED` to `IN_PROGRESS`. A legally complete fact set
transitions derived state to `COMPLETED`.

**Decision: lifecycle status is derived, not stored.** `NOT_STARTED`,
`IN_PROGRESS`, and `COMPLETED` are deterministic projections of the ordered fact
set (including the empty set), in line with the core invariant (section 4). Game
identity/linkage may be persisted. No authoritative lifecycle field, table, or
state machine is added. The UI never manufactures a creation roll or completion,
and a partial fact set is never presented as completed. See `DECISION_4-2`.

---

## 7. Reopen semantics

Required invariant: `COMPLETION_HISTORY_MUST_NOT_DISAPPEAR`.

Evaluate:

- **A.** transition back to an editable state while retaining completion history.
- **B.** keep completion immutable and permit corrections through the existing
  correction mechanism.

**Decision (recommended): B.** A completed game is deterministic from its
ordered fact set; there is nothing additional to "un-complete." Corrections to
the underlying observed facts flow through the already accepted append-only
correction/audit architecture (ADR-001 D11, ADR-002 D6), which never deletes or
silently overwrites history. `REOPEN_GAME` therefore means "authorized
correction of a completed game's facts via the existing `CORRECT` operation";
completion history (the original fact set and every correction) is preserved by
construction. See `DECISION_4-3`.

---

## 8. Observation contract

Minimum durable observed facts required to reconstruct a legal game
(inspect existing contracts first — verified against `src/entities.ts`):

| Fact | Required | Notes |
| --- | --- | --- |
| `roll_id` | yes | UUIDv7 roll identity (ADR-001 D1). |
| `game_id` | yes | via the domain relationship `Roll.frame_id → Frame.game_id` (accepted entity graph). |
| `observed_pinfall` | yes | integer 0..10 or null (null = not-yet-observed; never fabricated). Already validated at the server boundary (`server/validation/validate.ts`). |
| ordering field/relationship | yes | `Frame.frame_number` (1..10) + `Roll.roll_number`; explicit accepted domain fields (section 15). |
| `occurred_at` | no | not required to reconstruct or score a game; exclude unless Architecture Authority requires it for a product reason (`DECISION_4-5`). |
| correction linkage | yes | via the existing `Correction` entity: `target_entity_type/id`, `prior_entity_version`, `corrected_representation`, immutable audit lineage. |
| sync identity/version | yes | existing `entity_version`, `origin_device_id`, `created_at`, `schema_version` metadata (ADR-001 D3). |

Do **not** persist redundant values that are deterministically derivable:
scores, frame statuses, running totals, bonus counts, rack state, or
frame/roll attribution beyond the accepted `frame_number`/`roll_number`
relationships. Rack reset is a derivation consequence, not a stored fact
(`PinState`/`PinLeave` are accepted entities but are out of scope — shot
detail, per section 9 of this record's scope list).

---

## 9. Frame authority

Current status (verified): `Frame` is an **accepted canonical entity** in the
archived entity contract (`src/entities.ts`) with durable UUIDv7 identity,
`game_id`, and `frame_number`, and `Roll.frame_id` links rolls to frames.

**Decision (recommended): `FRAME=AUTHORITATIVE_ENTITY` for identity/linkage;
frame semantics are a deterministic derivation.** The durable frame facts are
`identity + game_id + frame_number` only. Everything else about a frame — which
rolls belong to it, its status (open/spare/strike), and its score — is derived
from the ordered roll facts under the pinned rule version. No new authoritative
frame-truth store or derived-score table is added for UI convenience; existing
frame identity is preserved. See `DECISION_4-6`.

---

## 10. Explicit ten-pin legality

The specification must explicitly cover the standard ten-pin cases per the
selected rule authority:

- **open frames**: two rolls, total < 10 → no bonus; frame score = pinfall sum.
- **spares**: two rolls, total == 10 → bonus = next one legal roll.
- **strikes**: first roll == 10 → frame ends after one roll; bonus = next two
  legal rolls.
- **tenth-frame open**: two rolls, total < 10 → game ends; frame score = sum.
- **tenth-frame spare**: two rolls totaling 10 → exactly one bonus roll.
- **tenth-frame strike**: three rolls allowed (strike + two bonus rolls).
- **tenth-frame bonus rolls**: after a strike, the rack resets for each bonus
  roll; after a spare, exactly one bonus roll with a full rack.
- **rack reset semantics**: derived, never stored; a strike (frames 1–9) resets
  the rack for the following frame; in the tenth, a strike resets the rack for
  each subsequent bonus roll.

No tenth-frame behavior is left implicit; the acceptance matrix (section 18)
enumerates every branch.

---

## 11. Pinfall validation

Deterministic domain rejection with explicit machine-readable domain error
codes (reuse the existing server `REASON_CODES` convention and the mobile
`rejected_invalid_mutation` presentation):

| Code | Condition |
| --- | --- |
| `PINFALL_LT_0` | `pinfall < 0` |
| `PINFALL_GT_10` | `pinfall > 10` |
| `IMPOSSIBLE_TWO_ROLL_TOTAL` | first two rolls of a frame sum > 10 (frames 1–9; and tenth frames before a strike on the first ball) |
| `INVALID_TENTH_BONUS` | bonus-sequence illegality: a third roll after a non-strike/non-spare tenth; a second bonus roll after a spare; more than two bonus rolls after a strike; bonus rolls on frames 1–9 |
| `ROLL_AFTER_COMPLETION` | any new non-correction roll on a completed game |
| `INVALID_STATE_TRANSITION` | correction/operation targeting a wrong `prior_entity_version`, or applied against an entity in a state that forbids it |

Rules:

- Never invent observations, never silently repair invalid input, never add
  manufactured zeros/misses, and never auto-complete a game.
- **Where legality can be decided from locally available facts, it is decided
  at the local domain boundary** (the mobile app operates offline; cross-fact
  legality such as `IMPOSSIBLE_TWO_ROLL_TOTAL` cannot be decided from a single
  isolated mutation). The server retains the existing per-observation checks
  (`roll.pinfall` integer 0..10, frame/game misc.; `server/validation/validate.ts`)
  and is not asked to reject legal-in-isolation facts.
- A synchronized fact set found, on complete re-derivation, to be illegal is
  surfaced as an honest domain state requiring repair — it is never patched,
  truncated, or re-scored (see section 14, `DECISION_4-4`).

---

## 12. Incomplete game semantics

Incomplete games are **first-class valid states**. No manufactured rolls, bonus
rolls, zeros, or completion are ever synthesized.

Required invariant:

```
UNRESOLVED_BONUS  →  FINAL_SCORE_NOT_AVAILABLE
```

- Known, resolved portions may be shown, but a game whose bonus is unresolved
  **never** presents a final total.
- The projection distinguishes:
  - **known** (facts fully consumed by prior frames),
  - **provisional** (a frame whose score depends on future legal rolls),
  - **final** (all frames resolved).
- `data_quality=PARTIAL` is honest and legitimate for an incomplete game
  (ADR-001 D4).

---

## 13. Bonus resolution

Specify unresolved scoring explicitly:

- **strike awaiting next two legal rolls**: frame shows `provisional (10 + …)`;
  finalizes when the next two legal rolls exist.
- **spare awaiting next one legal roll**: frame shows `provisional (10 + …)`;
  finalizes when the next legal roll exists.

Derived scores update automatically as future legal observations arrive. No
guessed bonus values are ever persisted. There is no snapshot of a score.

---

## 14. Correction architecture

Preserve the already accepted correction/audit mechanism exactly. No second
correction model is introduced.

```
ORIGINAL_OBSERVATION   the original roll/fact entity (retained, version lineage)
CORRECTION             append-only Correction record
EFFECTIVE_OBSERVATION  the corrected_representation that drives re-derivation
AUDIT_HISTORY          corrections table + entity version lineage
```

A correction is applied atomically by the existing mechanism
(`src/persistence/sqlite/applyCorrection.ts`, ADR-001 D11): append the immutable
correction record, apply the corrected representation (preserving immutable
id/type/origin/created_at), increment the target `entity_version` exactly once,
set `data_quality=CORRECTED`, and enqueue the `CORRECT` outbox mutation. Correcting
a roll re-derives the game state deterministically.

---

## 15. Correction dependency policy (mandatory design decision)

Example: rolls `7, 2, …`; roll 1 is corrected to `10` (`7 → X`).

Evaluate:

- **A.** Reject the correction until dependent later observations are corrected.
- **B.** Accept it and mark dependent observations `DOMAIN_INVALID_REQUIRING_REPAIR`.
- **C.** Preserve all observations and derive an invalid game state until explicit repair.

**Architecture Authority Decision 4-4: APPROVED (option C).**
`CORRECTION_DEPENDENCY_POLICY=PRESERVE_FACTS_AND_EXPOSE_DOMAIN_INVALID_REQUIRING_REPAIR`.

Append-only, never destructive: a correction is always recorded; roll
identity/order/pinfall of later facts are never deleted, moved, reinterpreted,
or renumbered. When a correction makes the derived fact set illegal (for example
`9, 3` after correcting a `7` to `9` where the recorded second roll makes a
two-roll total > 10), the game derivation is `DOMAIN_INVALID_REQUIRING_REPAIR`
and it remains a legal derivation target until the offending fact is itself
explicitly corrected. This is the smallest policy consistent with audit integrity
(ADR-001 D11) and honesty (ADR-001 D4); it adds no cross-observation rejection
machinery and never mutates later facts. No second correction model is introduced.

Deterministic attribution note: frame attribution is derived from the running
rule state. A `STRIKE→NON-STRIKE` correction changes, by derivation, which
frame subsequent recorded rolls belong to. This is deterministic scoring
semantics, not a reinterpretation of roll identity or pinfall; `ROLL_IDENTITY !=
DISPLAY_POSITION` (section 5) holds throughout.

---

## 16. Ordering semantics

Accepted deterministic ordering basis (already present in the accepted entity
contract):

```
ORDERING = (Frame.frame_number 1..10, Roll.roll_number within frame)
```

- `Frame.frame_number` and `Roll.roll_number` are explicit, accepted domain
  fields — the domain relationship, not incidental storage order.
- `roll_id` (UUIDv7, monotonic) is the stable tiebreak/identity for
  reconstructing roll sequence within a frame and across a game.
- Never rely on incidental database row order, UI array order, or post-sync
  insertion order unless they are explicitly guaranteed by the accepted
  contracts.

---

## 17. Sync compatibility

Preserve (no rewrite of Slice 3 sync contracts):

```
LOCAL_OFFLINE_FACTS → SYNC → CANONICAL_FACT_SET → DETERMINISTIC_RECOMPUTATION
```

- Sync transports observed facts only. Sync never defines scoring truth, and
  score artifacts are never sync payloads.
- A temporarily incomplete synchronized observation set **remains a valid
  incomplete domain state** (section 12) — no fabricated scores, no forced
  completion.
- Idempotency, receipts, ACCEPTED/CONFIRMED, pull atomicity, change-feed, and
  checkpoints are unchanged (section 10 frozen list).

## 18. Offline requirement

Without a server connection the mobile app must support:

```
START_GAME
RECORD_ROLL
VIEW_SCORE
CORRECT_ROLL
COMPLETE_GAME
REOPEN_OR_CORRECT_COMPLETED_GAME   (as permitted by section 7)
```

All operations are local mutations through the accepted transactional outbox;
offline operation is the primary path and never requires network.

---

## 19. File-backed recovery

Future acceptance must prove, using **real file-backed mobile persistence**
(never `:memory:` substitution):

```
START GAME
RECORD PARTIAL GAME
CLOSE APP / STORE
REOPEN
RELOAD DURABLE FACTS
RECOMPUTE IDENTICAL GAME STATE
CONTINUE GAME
```

Recomputation must be byte-deterministic for the derived game state under the
pinned rule version. Recovery is from SQLite, never from React state.

---

## 20. Thin mobile flow

Minimum required interaction:

```
START GAME → ENTER PINFALL → VIEW CURRENT SCORE SHEET → CORRECT ENTRY → COMPLETE → REOPEN / CORRECT IF PERMITTED
```

Required surfaces (minimal, additive to the existing color/behavior of the
diagnostic shell `apps/mobile/App.tsx`):

| Surface | Purpose | Visible states |
| --- | --- | --- |
| New Game | persist game identity/linkage; zero rolls | `NOT_STARTED` until first effective roll |
| Pinfall entry | enter observed pinfall 0..10 | per-roll; immediate derivation feedback |
| Score sheet | current derived state | known / provisional / final; running total; `FINAL_SCORE_NOT_AVAILABLE` when unresolved; `DOMAIN_INVALID_REQUIRING_REPAIR` carrier; sync badges reuse `SYNC_PRESENTATION_STATUSES` (`saved_locally`, `waiting_to_sync`, `synced`, …) |
| Correct entry | fix an entered roll | existing correction flow; reason captured (existing `reason`/`actor` contract) |
| Completed/reopen | read-only final + authorized correction | `COMPLETED`; corrections re-derive; completion history visible |

Controls: pinfall selection (0–10) and a correction entry point. Deterministic
domain-error feedback uses the explicit codes of section 11 surfaced through
the existing rejection/`rejected_invalid_mutation` presentation. No visual
redesign is performed in this work package.

---

## 21. Out of scope

Explicitly excluded unless required solely to preserve an already accepted
contract:

```
AUTHENTICATION
CONFLICT_RESOLUTION_UI
MULTI_BOWLER
TEAMS
LEAGUES
MATCH_PLAY
ANALYTICS
COACHING
SHOT_OR_PIN_LEAVE_DETAIL
BALL_TRACKING
LANE_CONDITIONS
HANDICAP
TOURNAMENTS
NAS_DEPLOYMENT
PUBLIC_CLOUD_DEPLOYMENT
NEW_TOOLING
DEPENDENCY_UPGRADES
```

---

## 22. Accepted architecture is frozen

Do not change, and Surface-4 requirements must not require changing: UUIDv7
semantics, correction/audit semantics, outbox semantics, submission receipts,
ACCEPTED/CONFIRMED behavior, pull atomicity, sync checkpoints, change-feed
contracts, idempotency semantics.

If Slice 4 appears to require any such change:

```
STOP
RESULT=HOLD
ARCHITECTURE_CONCERN=<exact issue>
```

---

## 23. Future automated acceptance matrix

### 23.1 Canonical scoring (pinned ordered roll vectors; expected totals)

A golden total without its exact ordered roll sequence is **not** sufficient
acceptance evidence. Expected totals below are unchanged. Regression vectors are
the integer pinfall sequences (left-to-right, one delivery per value). Compact
`X`/`/` notation is commentary only.

```ini
PERFECT_GAME=300
ALL_SPARES=150
GUTTER_GAME=0
OPEN_FRAMES=80
MIXED_GAME=169
```

| Test | Ordered pinfall sequence | Expected total |
| --- | --- | --- |
| `PERFECT_GAME` | `10,10,10,10,10,10,10,10,10,10,10,10` (12 rolls) | **300** |
| `ALL_SPARES` | `5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5` (21 rolls) | **150** |
| `GUTTER_GAME` | `0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0` (20 rolls) | **0** |
| `OPEN_FRAMES` | `5,3,5,3,5,3,5,3,5,3,5,3,5,3,5,3,5,3,5,3` (20 rolls) | **80** |
| `MIXED_GAME` | `10,3,6,9,1,7,2,10,10,8,2,9,0,10,7,3,9` (17 rolls) | **169** |

`MIXED_GAME` breakdown (pinned): F1 strike + `3,6` = 19; F2 `3,6` = 9; F3 `9,1`
spare + `7` = 17; F4 `7,2` = 9; F5 strike + `10,8` = 28; F6 strike + `8,2` = 20;
F7 `8,2` spare + `9` = 19; F8 `9,0` = 9; F9 strike + `7,3` = 20; F10 `7,3,9` = 19
→ total **169**.

### 23.2 Tenth-frame branches

| Test | Sequence (tenth frame) | Expectation |
| --- | --- | --- |
| `TENTH_OPEN` | `3 4` | frame 7; game ends; no bonus |
| `TENTH_SPARE_BONUS` | `7 3 8` | frame 18 |
| `TENTH_STRIKE_STRIKE_STRIKE` | `X X X` | 30 |
| `TENTH_STRIKE_STRIKE_NON_STRIKE` | `X X 9` | 29 |
| `TENTH_STRIKE_NON_STRIKE_VALID_SECOND` | `X 7 3` | 20 |
| `TENTH_LEGALITY_BRANCHES` | all rack-reset and pinfall-legality branches required by the selected rules authority (section 3/10) | each deterministic PASS with expected derived frames |

### 23.3 Incomplete states

| Test | State | Required behavior |
| --- | --- | --- |
| `INCOMPLETE_OPEN_FRAME` | F1 recorded `7`, no second roll | frame known-partial; total not final |
| `UNRESOLVED_SPARE` | `7 /` awaiting next roll | provisional; `FINAL_SCORE_NOT_AVAILABLE` |
| `UNRESOLVED_STRIKE` | `X` awaiting next two rolls | provisional; `FINAL_SCORE_NOT_AVAILABLE` |
| `PARTIAL_TENTH` | one tenth-frame roll recorded (open or strike) | valid; not completed; no manufactured bonus |

Verify: `NO_MANUFACTURED_ROLLS`, `NO_FALSE_FINAL_TOTAL`, `DETERMINISTIC_PARTIAL_STATE`.

### 23.4 Invalid inputs

| Test | Input | Expected reject code |
| --- | --- | --- |
| `NEGATIVE_PINFALL` | `-1` | `PINFALL_LT_0` |
| `PINFALL_GT_10` | `11` | `PINFALL_GT_10` |
| `IMPOSSIBLE_TWO_ROLL_TOTAL` | `8` then `5` | `IMPOSSIBLE_TWO_ROLL_TOTAL` |
| `INVALID_TENTH_BONUS` | open tenth + third roll; spare + two bonuses | `INVALID_TENTH_BONUS` |
| `ROLL_AFTER_COMPLETION` | new roll on completed game | `ROLL_AFTER_COMPLETION` |
| `INVALID_STATE_TRANSITION` | wrong `prior_entity_version`; operation on non-editable state | `INVALID_STATE_TRANSITION` / `StaleEntityVersionError` |

### 23.5 Corrections

| Test | Scenario | Required behavior |
| --- | --- | --- |
| `OPEN_TO_SPARE` | correct `5 3` → `5 /` | re-derives spare; audit intact |
| `OPEN_TO_STRIKE` (where legally meaningful) | correct `5 3` → `X` with valid successor facts | re-derives strike bonus deterministically |
| `STRIKE_TO_NON_STRIKE` | correct `X` → `8` (frame becomes awaiting) | derivation re-attributes subsequent rolls; identity/pinfall preserved |
| `TENTH_FRAME_CORRECTION` | correct any tenth-frame fact within tenth legality | re-derives tenth frame |
| `CORRECTION_AFTER_COMPLETION` | correct a completed game's fact | completed game re-derives; completion history retained |
| `CORRECTION_AFFECTING_LATER_LEGALITY` | e.g., correct `7` → `9` where next recorded roll makes total > 10 | `DOMAIN_INVALID_REQUIRING_REPAIR` until that fact is corrected |

Verify audit history remains intact (append-only; original representations
traceable) for every correction test.

---

## 24. Sync regression preservation

Future Slice 4 acceptance must preserve applicable Slice 3 regression evidence
(no new architecture review of these accepted behaviors):

```
UNCERTAIN_DELIVERY
SAME_SUBMISSION_ID_REPLAY
ACCEPTED_RECEIPT_DURABILITY
RESTART_RECOVERY
FALSE_SYNC_PREVENTION
PULL_ATOMICITY
REAL_CHANGE_ID
```

---

## 25. Automated versus device acceptance

Separate:

```
AUTOMATED_DOMAIN_ACCEPTANCE      scoring derivation + legality + corrections (deterministic)
AUTOMATED_PERSISTENCE_ACCEPTANCE file-backed restart recovery; durable facts; corruption honesty
AUTOMATED_SYNC_ACCEPTANCE        fact sync; incomplete-set handling; Slice 3 regression keys preserved
MOBILE_TYPECHECK                 existing `npm run typecheck:mobile`
MOBILE_BUILD                     existing Expo export/bundle audit path
```

from:

```
ACTUAL_DEVICE_UI_ACCEPTANCE      manual device/emulator scoring interaction
```

`DEVICE_ACCEPTANCE_REQUIRED=true` — score entry and correction are primary
mobile interactions. Device testing supplements but never replaces the
deterministic automated gates.

---

## 26. Product decisions (`DECISION_ID`)

### DECISION_4-1 — Ten-pin rules authority
- QUESTION: Which rules authority defines legal ten-pin scoring?
- OPTIONS: (a) USBC Rules of Bowling; (b) World Bowling (WB) Rules
- RECOMMENDED_OPTION: (a) USBC Rules of Bowling
- DECISION: APPROVED — (a) `RULE_AUTHORITY=USBC_PLAYING_RULES`
  (United States Bowling Congress), `RULE_EDITION=2026-2027`,
  `SCORING_DOMAIN=AMERICAN_TENPINS`
- RATIONALE: recognized standard authority for the United States-focused
  offline-first product; normative scoring/legality.
- RULE_REFERENCE: pinned to the official BOWL.com 2026–2027 Playing Rules PDF
  (`SOURCE_SHA256=4cb44a2a9d62fdf18957da2db4646e05342eebdc308cc56711a6249ad2cdddec`).
  Provenance: `docs/reference/usbc-playing-rules-2026-2027.provenance.md`.
- HISTORICAL_RECOMPUTATION: must not change when later external USBC publications change.
- ARCHITECTURE_IMPACT: the pinned exact rule reference is an input to
  deterministic derivation; no authoritative score storage.
- IMPLEMENTATION_IMPACT: derivation tables/cases per the pinned exact reference
  only after that reference exists.
- APPROVAL_REQUIRED=true
- APPROVED=true

### DECISION_4-2 — Lifecycle storage
- QUESTION: Are `NOT_STARTED`/`IN_PROGRESS`/`COMPLETED` stored or derived?
- OPTIONS: (a) derived from the ordered fact set; (b) durable lifecycle state field
- RECOMMENDED_OPTION: (a) derived
- DECISION: (a) derived. `LIFECYCLE_FIELD_PERSISTED=false`. Game identity/linkage
  may be persisted with zero roll facts (`NOT_STARTED`). First effective roll
  derives `IN_PROGRESS`. A legally complete fact set derives `COMPLETED`. No
  manufactured creation roll.
- RATIONALE: consistent with the core invariant; no separate authoritative
  lifecycle truth; honest without manufacturing completion or a start roll.
- ARCHITECTURE_IMPACT: none to sync; lifecycle is a projection.
- IMPLEMENTATION_IMPACT: no new column/state machine.
- APPROVAL_REQUIRED=false

### DECISION_4-3 — Reopen semantics
- QUESTION: How is a completed game reopened?
- OPTIONS: (a) transition back to editable while retaining completion history;
  (b) completion immutable + corrections via the existing mechanism
- RECOMMENDED_OPTION: (b)
- RATIONALE: smallest; uses accepted audit/correction; completion history is
  preserved by construction (`COMPLETION_HISTORY_MUST_NOT_DISAPPEAR`).
- ARCHITECTURE_IMPACT: none.
- IMPLEMENTATION_IMPACT: no new workflow state.
- APPROVAL_REQUIRED=false

### DECISION_4-4 — Correction dependency policy
- QUESTION: What happens when a correction affects later legality?
- OPTIONS: (a) reject until dependents corrected; (b) accept + mark dependents
  repair-required; (c) accept + preserve all facts + derive invalid state until
  explicit repair
- RECOMMENDED_OPTION: (c)
- DECISION: APPROVED — (c)
  `CORRECTION_DEPENDENCY_POLICY=PRESERVE_FACTS_AND_EXPOSE_DOMAIN_INVALID_REQUIRING_REPAIR`
- RATIONALE: smallest defensible policy consistent with audit integrity and
  honesty; never deletes/moves/reinterprets later rolls; roll identity and
  pinfall preserved.
- ARCHITECTURE_IMPACT: re-derivation responds to repair; no mutation of later facts.
- IMPLEMENTATION_IMPACT: derive `DOMAIN_INVALID_REQUIRING_REPAIR` projection state.
- APPROVAL_REQUIRED=true (not governed by accepted ADRs)
- APPROVED=true

### DECISION_4-5 — `occurred_at`
- QUESTION: Is an observed `occurred_at` required for a roll?
- OPTIONS: (a) not required; (b) required
- RECOMMENDED_OPTION: (a)
- RATIONALE: scoring and reconstruction are order-based, not time-based;
  not required by the rule authority.
- ARCHITECTURE_IMPACT: none.
- IMPLEMENTATION_IMPACT: excludes a redundant timestamp field.
- APPROVAL_REQUIRED=false

### DECISION_4-6 — Frame authority
- QUESTION: Is `Frame` authoritative or derived?
- OPTIONS: (a) authoritative identity/linkage only + derived semantics;
  (b) fully durable frame projection
- RECOMMENDED_OPTION: (a)
- RATIONALE: preserves accepted frame identity while avoiding redundant frame
  score/status truth for UI convenience.
- ARCHITECTURE_IMPACT: none; preserves existing entity contract.
- IMPLEMENTATION_IMPACT: derive frame semantics from ordered roll facts.
- APPROVAL_REQUIRED=false

### DECISION_4-7 — Ordering basis
- QUESTION: What establishes roll reconstruction order?
- OPTIONS: (a) `(Frame.frame_number, Roll.roll_number)` + UUIDv7 tiebreak;
  (b) incidental row/array order
- RECOMMENDED_OPTION: (a)
- RATIONALE: uses only accepted explicit domain relationships; never incidental
  storage order.
- ARCHITECTURE_IMPACT: none.
- IMPLEMENTATION_IMPACT: determinism source for derivation.
- APPROVAL_REQUIRED=false

---

## 27. Expected module impact (future implementation)

Based on inspection of the accepted tree; no placeholder modules are created.

- **Domain scoring (new):** `src/scoring/*` — deterministic derivation,
  frame projection, legality, explicit error codes. (Names indicative;
  finalized at implementation.)
- **Domain model review (likely unchanged):** `src/entities.ts` — lifecycle is
  derived (DECISION_4-2), so no mandatory field change.
- **Unchanged, reused:** `src/identity/*` (`uuidv7.ts`, `ids.ts`),
  `src/versioning.ts`, `src/correction.ts`,
  `src/persistence/sqlite/*` (entities/outbox/corrections/conflicts/applied/
  checkpoint stores), `src/sync/*` (frozen), `src/portable.ts` (public surface).
- **Server boundary:** `server/validation/validate.ts` — keep per-observation
  checks; no cross-fact rejection imposed server-side. `server/sync/*` frozen.
- **Mobile:** `apps/mobile/App.tsx` + `apps/mobile/src/*` — add minimal scoring
  surfaces (New Game / Pinfall entry / Score sheet / Correct / Completed-reopen);
  reuse `SYNC_PRESENTATION_STATUSES`.
- **Tests:** new deterministic scoring/correction/legality/persistence recovery
  suites under `tests/*`; preservation of server E2E evidence in
  `server/test/e2e.sync.test.ts`; `server/test/sync.integration.test.ts`
  unchanged in scope.

---

## 28. Approval and status

```ini
ARCHITECTURE_AUTHORITY_REVIEW=BOWLING_ARCH_001_SLICE_4
RESULT=APPROVED
DECISION_4-1_TEN_PIN_AUTHORITY=APPROVED
DECISION_4-4_CORRECTION_DEPENDENCY_POLICY=APPROVED
ARCHITECTURAL_DIRECTION=ACCEPTED
SLICE_4_REQUIREMENTS=ACCEPTED_AFTER_REQUIRED_CLARIFICATIONS
PRODUCTION_IMPLEMENTATION_AUTHORIZED=false
```

- This record is **Accepted** as Slice 4 requirements/design after the required
  clarifications (exact rule-reference pinning, zero-roll `NOT_STARTED` derived
  lifecycle, pinned golden roll vectors).
- `IMPLEMENTATION_AUTHORIZED=false` until Architecture Authority opens a Slice 4
  implementation gate against this committed documentation baseline.
- Rule-reference pinning is **closed**: `RULE_EDITION=2026-2027`,
  `RULE_REFERENCE_IMMUTABLE=true`. Scoring implementation is still unauthorized
  until that implementation gate.
- `CURRENT_GATE=ARCHITECTURE_ACCEPTANCE`
- `GATE_STATUS=APPROVED_IMPLEMENTATION_UNAUTHORIZED`
- `NEXT_ACTION=RETURN_TO_ARCHITECTURE_AUTHORITY_FOR_SLICE_4_IMPLEMENTATION_AUTHORIZATION`

Nothing in this document rewrites, amends, or re-opens the recorded Slice 3
independent review verdict (HOLD) or the Slice 3 closure evidence. Accepted
Slice 1–3 application bytes and sync contracts remain frozen.

---

## 29. Unresolved approval items

1. Ten-pin rules authority adoption (`DECISION_4-1`) — **APPROVED** and
   **pinned**: `RULE_AUTHORITY=USBC_PLAYING_RULES`, `RULE_EDITION=2026-2027`.
   Immutable provenance is `docs/reference/usbc-playing-rules-2026-2027.provenance.md`.
2. Correction dependency policy (`DECISION_4-4`) — **APPROVED** (preserve facts
   and expose `DOMAIN_INVALID_REQUIRING_REPAIR`).
3. `DECISION_4-2`, `DECISION_4-3`, `DECISION_4-5`, `DECISION_4-6`, `DECISION_4-7`
   remain as recorded (derived lifecycle including zero-roll `NOT_STARTED`;
   reopen via existing corrections; `occurred_at` not required; frame identity
   authoritative / semantics derived; `(frame_number, roll_number, UUIDv7
   tiebreak)` ordering) unless Architecture Authority later overrides.

---

## 30. Formal Slice 4 closure (additive; does not rewrite §28)

Section 28 remains the architecture-acceptance snapshot
(`APPROVED_IMPLEMENTATION_UNAUTHORIZED` at that time). Architecture Authority
later authorized implementation, closed P1, and accepted physical-device
evidence. Formal closure is recorded in `PROJECT_STATUS.md` and
`docs/evidence/arch-001-slice-4-formal-closure.md`.

```ini
SLICE_4_FORMALLY_CLOSED=true
SLICE_4_IMPLEMENTATION_ACCEPTED=true
SLICE_5_IMPLEMENTATION_AUTHORIZED=false
```