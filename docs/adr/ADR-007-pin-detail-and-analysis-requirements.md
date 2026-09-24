# ADR-007 — Pin Detail, Direct Frame Correction, and Analysis

- **Status**: **ACCEPTED** by Architecture Authority (2026-09-21).
  Requirements accepted. **Implementation is not authorized.**
- **Work package**: `BOWLING_ADR_007_REQUIREMENTS_ACCEPTANCE`
- **Prior draft package**: `BOWLING_PIN_DETAIL_ANALYSIS_REQUIREMENTS`
- **Baseline**: integrated first-use package on
  `arch/001-domain-sync-foundation` at
  `624f1ccd0c9c3f5b444470c5aace04310dfbc1cc`
  (tree `38a99b05dd589cdb5823311a8d78403d5e3e779c`).
- **Distinct from**: Slice 6 acceptance tag `v0.6.0-arch001-slice6`
  (`94cfc4b8ef54cc7501b9dd143d948566fd861fa2`). Do not invent a new tag or
  slice number in this package.
- **Owner**: ChatGPT (Architecture Owner)

> **REQUIREMENTS ACCEPTED. IMPLEMENTATION NOT AUTHORIZED.**
> `IMPLEMENTATION_AUTHORIZED=false`. `FIELD_VALIDATION=PAUSED`.
> `PRODUCTION_RELEASE_AUTHORIZED=false`.
> B1 technical persistence/sync contract is **accepted** in
> `docs/adr/ADR-008-b1-pinstate-persistence-sync-contract.md`
> (`ADR_008_ACCEPTED=true`, `B1_TECHNICAL_CONTRACT=ACCEPTED`).
> Implementation remains unauthorized until a separate B1 package.

---

## 1. Confirmed user needs (accepted)

1. For each delivery, record **pinfall** (pins knocked down on that ball).
2. For each delivery, optionally identify **which numbered pins remain**.
3. After a game, and across historical games, review **analysis** (metrics
   defined here; trends deferred).
4. When correcting, prefer **selecting the frame/ball directly**.

**Product constraints already in force:**

- Scoring remains **derived** from observations (ADR-003).
- Never invent exact pin identities from pinfall alone.
- Existing pinfall-only games remain readable and scorable.
- Append-only correction audit (Decision 4-4) preserved.
- Offline persistence and accepted sync identity/versioning remain.

---

## 2. Approved decisions (Architecture Authority, 2026-09-21)

| ID | Decision | Status |
| --- | --- | --- |
| **U1** | Pinfall per delivery; frame/game scores calculated by the app | **ACCEPTED** |
| **U2** | Pinfall first, optional numbered standing pins, then **explicit save** | **ACCEPTED** |
| **U3** | First-ball pinfall/strike rate; common leaves; spare opportunities/conversions | **ACCEPTED** |
| **Trends** | Historical trends | **DEFERRED** |

```ini
U1=PINFALL_PER_DELIVERY_FRAME_GAME_SCORES_CALCULATED
U2=PINFALL_FIRST_OPTIONAL_STANDING_PINS_EXPLICIT_SAVE
U3=FIRST_BALL_PINFALL_STRIKE_RATE;COMMON_LEAVES;SPARE_OPPORTUNITIES_CONVERSIONS
HISTORICAL_TRENDS=DEFERRED
B1_STORAGE=ROLL_PLUS_OPTIONAL_PINSTATE
PINLEAVE_WRITES_IN_B1=false
B1_SCOPE=CAPTURE_AND_DIRECT_FRAME_BALL_FIX_ONLY
ANALYSIS_IMPLEMENTATION_IN_B1=false
```

### 2.0 Proposed graphical capture redesign (PENDING USER APPROVAL — 2026-09-23)

> **Not approved.** Does **not** supersede accepted U2 until the user accepts the
> redesign. Technical agent PASS does not override user rejection of the current
> B1 entry experience (`USER_PIN_SELECTOR_ACCEPTANCE=HOLD`).

| Topic | Proposal (pending) |
| --- | --- |
| Capture default | **Rack-first** detailed entry instead of pinfall-first U2 |
| Pin selection meaning | **Selected = standing** (never knocked down); tap again clears |
| Instruction | “Tap the pins still standing.” |
| Persistence | Explicit **Save** only; taps alone do not write |
| Untouched vs none | Untouched ≠ strike / ≠ empty standing; empty requires explicit confirmation |
| Unknown prior rack | Do **not** invent identities; secondary pinfall-only path |
| Scorecard | X / / / miss mark / blank; pending totals; tap frame to correct |
| Prototype | `prototypes/graphical-entry/` (isolated; not production) |

#### User design feedback (2026-09-23) — refinements requested

`USER_DESIGN_ACCEPTANCE=CHANGES_REQUESTED` (not final approval of capture default).

| Feedback | Status in prototype |
| --- | --- |
| Selected = standing | **Accepted** (YES) |
| Rack-first simpler | **YES, with changes** |
| Frame-tap correction natural | **Accepted** (YES) |
| **Refinement 1** — Tenth-frame strikes display **X** (incl. fills: `X X X`, `X 9 /`, `9 / X`); pin #10 and numeric scores stay numeric | Prototype updated; pending re-review |
| **Refinement 2** — Context-aware **Spare** after non-strike first delivery (incl. miss) and tenth `X 9` fill; not offered on fresh post-strike racks; explicit Save | Prototype updated; pending re-review |
| **Refinement 3** — Successful Save **auto-advances** to next legal delivery; remaining standing rack carries forward; untouched draft stays safe | Prototype updated; pending re-review |

Capture-default change (U2 → rack-first) remains **PENDING** final user approval.

```ini
PROPOSED_CAPTURE_DEFAULT=RACK_FIRST_SELECTED_MEANS_STANDING
PROPOSED_REPLACES_U2_PINFALL_FIRST=PENDING_USER_APPROVAL
USER_PIN_SELECTOR_ACCEPTANCE=HOLD
REASON=USER_REPORTS_CONFUSING_ENTRY
USER_DESIGN_ACCEPTANCE=PENDING
GRAPHICAL_ENTRY_PROTOTYPE=prototypes/graphical-entry/index.html
GRAPHICAL_ENTRY_REFINEMENTS=TENTH_X_NOTATION,CONTEXT_AWARE_SPARE,AUTO_ADVANCE_AFTER_SAVE
```

### 2.1 Incomplete and repair-needed games (analysis)

- **Exclude** from analysis rates and common-leave distributions.
- **List separately** and show **exclusion counts**.
- Do **not** hide them from ordinary game history.

### 2.2 B1 storage and scope

| Item | Decision |
| --- | --- |
| Storage | Existing `Roll` + optional `PinState` linked by `roll_id` |
| `PinLeave` writes in B1 | **false** |
| B1 scope | Capture + direct frame/ball Fix **only** |
| Analysis implementation in B1 | **false** (metrics specified here for later B2/B3) |

---

## 3. Existing contracts (inspected; preserved)

### 3.1 Entities already in the accepted graph (`src/entities.ts`)

```ts
PinState { roll_id, standing_pins: number[] | null }
PinLeave { pin_state_id, arrangement: number[] | null }
Roll     { frame_id, roll_number, pinfall: number | null }
```

ADR-003: `PinState`/`PinLeave` are accepted entities but were out of scope for
Slice 4 scoring. Baseline entry writes **`Roll.pinfall` only**. No production
`PinState`/`PinLeave` write path and **no** `pin_state` persistence tables were
found under `src/persistence` on this baseline — activating optional
`PinState` writes in B1 may require schema/storage work that must be
**identified for AA approval**, not assumed authorized by this ADR.

### 3.2 Correction contract

Append-only `Correction`: target type/id, prior version, corrected
representation, optional `change`, reason, actor
(`applyCorrection.ts`, ADR-001 D11). Decision 4-4 leftover-fact / repair
semantics remain.

### 3.3 Direct frame selection

Presentation only: tap scorecard frame/ball → select durable `Roll` for Fix.
Domain identity and audit unchanged.

---

## 4. Observation integrity (accepted)

Pin numbering: standard rack **1–10** (head pin = 1).

### 4.1 What is recorded per delivery

| Observation | Meaning | Encoding |
| --- | --- | --- |
| Pinfall | Count knocked down on that delivery | Existing `Roll.pinfall` (0..10 or null) — **required** |
| Standing after | Numbered pins still standing after the delivery | Optional `PinState.standing_pins` linked by `roll_id` (U2) |
| Standing before | Pins standing before the delivery | **Derived** only — never a second inventable store |
| Leave arrangement | Named arrangement | **Not written in B1** (`PINLEAVE_WRITES_IN_B1=false`) |

### 4.2 Unknown vs empty vs known identities

Distinguish three knowledge states — never collapse them:

| Knowledge | Meaning | Allowed derivation |
| --- | --- | --- |
| **Known full rack** | Pre-delivery standing set is pins 1–10 (frame-opening or after an accepted rack reset) | Subset validation against {1..10} when standing detail is recorded |
| **Known remaining identities** | Prior delivery has an **explicit** nonempty (or empty) standing set recorded | Later standing set **must be a subset** of that prior set until a rack reset |
| **Known remaining count, unknown identities** | Pinfall history implies how many pins remain, but prior standing identities were **not recorded** | Validate **cardinality** of pinfall against remaining count only. **Do not invent** identities. **Do not imply** subset validation occurred |

**Never reconstruct pin identities from pinfall alone.**

### 4.3 Null / absent vs empty set vs untouched selector

| Encoding | Meaning |
| --- | --- |
| No `PinState` row, or `standing_pins = null` | **Not recorded** |
| Explicitly saved `standing_pins = []` | **No pins standing** (only when consistent with pinfall and rack) |
| Untouched pin selector at save | Must **not** silently persist an empty set; omit `PinState` / leave null |

### 4.4 Cardinality and subset rules

1. Pinfall must be consistent with the pre-delivery **rack count** under
   accepted rack-reset rules (section 4.5), including tenth `10,9,1`.
2. When a **known prior standing set** exists: recorded later standing pins
   must be a **subset** until rack reset; pinfall must equal
   `|prior| - |later|` (or equivalent knock-down count from that set).
3. When prior identities are **unknown**: enforce pinfall vs remaining
   **count** only; do not invent pins or pretend subset checks ran.
4. Mismatch → reject at entry/correction time (or Decision 4-4 repair path
   for already-persisted incompatible later detail).

### 4.5 Rack-reset / standing-before rules (verified vs ADR-003)

**Authority:** ADR-003 §10–§11 plus accepted tenth-frame legality in
`src/scoring/validate.ts` (including closed `10,9,1`).

ADR-003 prose (“in the tenth, a strike resets the rack for each subsequent
bonus roll”) is **not** read as “every fill ball is always a fresh rack.”

| Situation | Pre-delivery rack for pin detail |
| --- | --- |
| Frames 1–9, first ball | Full rack (1–10) |
| Frames 1–9, second ball after non-strike | Remaining after first ball |
| Frames 1–9 after strike/spare | Next frame starts full rack |
| Tenth, ball 1 | Full rack |
| Tenth, ball 2 after ball-1 **strike** | **Full rack** |
| Tenth, ball 2 after ball-1 **non-strike** | Remaining after ball 1 |
| Tenth, ball 3 after **spare** | **Full rack** |
| Tenth, ball 3 after strike + strike | **Full rack** |
| Tenth, ball 3 after strike + ball-2 **&lt; 10** | **Remaining after ball 2 — not fresh** |

**Canonical `10,9,1`:** ball 3 is on remaining pin(s) after ball 2; pinfall
0 or 1 only; standing-before is not pins 1–10.

### 4.6 Correction integrity

1. Corrections of pinfall and/or standing pins are **append-only**.
2. Correcting an earlier observation **must not silently rewrite** subsequent
   pin-detail rows.
3. If later pin detail becomes incompatible, mark / surface
   `DOMAIN_INVALID_REQUIRING_REPAIR` (Decision 4-4) and require **explicit**
   repair — do not invent leaves.
4. Offline + sync (when PinState writes are activated under approved
   schema/sync): existing metadata, outbox, and versioning.
5. Existing pinfall-only games: scorable; pin detail = **Not recorded**. No
   historical backfill.

---

## 5. Capture and correction flow (accepted)

### 5.1 Ordinary entry (U2)

1. *How many pins did you knock down on this ball?*
2. *Which pins are still standing? (optional)* — only offer pins that are
   known standing before this delivery when identities are known; otherwise
   optional detail may be skipped or offered only under full-rack knowledge.
3. **Explicit save** (required). Untouched selector → not recorded.
4. Confirmation: *Saved: Frame {n}, {ordinal} ball = {pinfall}*  
   If standing recorded: *Standing: {numbers}*  
   If skipped: *Pin detail not recorded for this ball.*

### 5.2 Direct frame / ball Fix

1. Tap a played scorecard frame/ball mark.
2. Fix mode with that durable roll selected.
3. *Change Frame {n}, {ordinal} ball. It is now {pinfall}. What did you
   actually knock down?*
4. *Update which pins are still standing? (optional)* — same unknown/empty
   rules.
5. Existing correction persistence; Cancel changes nothing.
6. Decision 4-4 repair copy when later balls / pin detail become illegal.

### 5.3 Screen flow (product; analysis UI later)

```
Active game
  → pinfall → optional standing pins → explicit save
  → scorecard (tap frame/ball to Fix)
Previous games
  → Open / resume (unchanged history visibility)
```

Analysis screens are **out of B1** (`ANALYSIS_IMPLEMENTATION_IN_B1=false`).

---

## 6. Analysis metric definitions (accepted; not implemented in B1)

### 6.0 Eligibility shared by rate metrics

- Incomplete games and games in `DOMAIN_INVALID_REQUIRING_REPAIR`:
  **exclude** from rates and common-leave distributions; **list separately**;
  show **exclusion counts**; still appear in ordinary game history.
- Use **current corrected** pinfall / standing facts where present.
- Analysis is **derived** — never a second authoritative score store.
- No causal coaching claims unsupported by recorded data.

### 6.1 First-ball pinfall / strike rate

| Field | Definition |
| --- | --- |
| Eligible deliveries | **Frame-opening** deliveries only: roll 1 of frames **1–10** |
| Excluded | All tenth-frame **fill** deliveries (balls 2–3); non-opening balls in 1–9 |
| Pinfall-only games | **Eligible** when the game is otherwise valid and complete |
| Strike | Frame-opening pinfall == 10 |
| Strike-rate denominator | Count of eligible frame-opening deliveries with recorded pinfall in the scope (per-game or historical set after exclusions) |
| Strike rate | (count of strikes among those deliveries) / (strike-rate denominator) |
| Average first-ball pinfall | (sum of eligible frame-opening pinfalls) / (same denominator) |
| Coverage | Always show sample size *Based on {n} first balls*; show exclusion counts for incomplete/repair games |

### 6.2 Common leaves (v1)

| Field | Definition |
| --- | --- |
| Eligible deliveries | **Frame-opening** deliveries only, frames **1–10** |
| Excluded | Tenth-frame **fill** deliveries; incomplete/repair games (per 6.0) |
| Counted observations | Only **explicitly recorded, nonempty** standing sets (`standing_pins` present, length ≥ 1) |
| Not counted | Missing detail; explicitly empty `[]` (all down / strike leave) as a “leave” frequency item; invented identities |
| Calculation | Frequency of exact standing sets (and optional per-pin residuals) among counted observations |
| Later-ball detail | **Preserve** in storage when recorded; **do not include** in this v1 metric |
| Coverage | Show eligible recorded observation count, **missing-detail** counts, and sample size |

### 6.3 Spare opportunities and conversions

| Field | Definition |
| --- | --- |
| Frames | **1–9 only** (tenth excluded from this metric) |
| Opportunity | Non-strike **first** delivery (`pinfall < 10`) in an **eligible completed** frame (second ball exists; game not excluded under 6.0) |
| Conversion | From accepted pinfall facts: first + second == 10 |
| Overall conversion rate | conversions / opportunities — **does not require** pin identities |
| Leave-specific breakdowns | Require recorded **first-ball** standing pins; must show **coverage** (recorded vs missing detail) |
| Incomplete frame | Not an opportunity until the second ball exists |

### 6.4 Historical trends — **DEFERRED**

Out of all current analysis implementation boundaries until a later AA package.

---

## 7. Schema / sync impact (requirements level)

| Item | Status under this ADR |
| --- | --- |
| `Roll.pinfall` | Unchanged; required |
| `PinState` | Intended B1 optional writes linked to `roll_id` — **entity already accepted**; write-path activation **not** authorized here |
| `PinLeave` | No writes in B1 |
| Sync / persistence design | Proposed in **ADR-008** (awaiting technical approval) |

**Technical contract:** `docs/adr/ADR-008-b1-pinstate-persistence-sync-contract.md`
(`ADR_008_ACCEPTED=true`, `B1_TECHNICAL_CONTRACT=ACCEPTED`,
`IMPLEMENTATION_AUTHORIZED=false`). Includes partial unique indexes (with
fail-closed precheck), `basis_roll_version`, reader taxonomy, savepoint
conflict preservation, delete/re-add ordering, and local pull association
collision policy. U1–U3 unchanged.

---

## 8. Accepted implementation boundaries

| Boundary | Contents | Status |
| --- | --- | --- |
| **B1** | Capture (pinfall + optional standing + explicit save); direct frame/ball Fix; rack-aware validation (incl. `10,9,1`); unknown/empty integrity; correction audit; offline/restart preservation | **Recommended next**; **not authorized** |
| **B2** | Per-game analysis: §6.1–6.3 | After B1 accepted |
| **B3** | Historical aggregation of §6.1–6.3 | After B2 |
| **Later** | Historical trends | Deferred |

```ini
B1_SCOPE=CAPTURE_AND_DIRECT_FRAME_BALL_FIX_ONLY
ANALYSIS_IMPLEMENTATION_IN_B1=false
B1_IMPLEMENTATION_AUTHORIZED=false
```

---

## 9. Non-goals

- Inventing historical leaves or pin identities from pinfall.
- Treating every tenth-frame fill as a fresh rack.
- Causal coaching tips.
- Manual authoritative frame totals.
- Analysis UI or metric computation in B1.
- `PinLeave` writes in B1.
- Implementation, commits, pushes, tags, production release, or field
  validation in this acceptance package.

---

## 10. Approval status

```ini
ARCHITECTURE_AUTHORITY_REVIEW=BOWLING_ADR_007_REQUIREMENTS_ACCEPTANCE
RESULT=PASS
ADR_007_ACCEPTED=true
ANALYSIS_DEFINITIONS_RECORDED=true
UNKNOWN_PIN_IDENTITY_RULES_RECORDED=true
CORRECTION_INTEGRITY_RECORDED=true
B1_BOUNDARY_DEFINED=true
B1_IMPLEMENTATION_AUTHORIZED=false
HISTORICAL_TRENDS=DEFERRED
TENTH_RACK_RULES_VERIFIED_VS_ADR003_AND_VALIDATE_TS=true
EXAMPLE_10_9_1=BALL3_ON_REMAINING_PINS_NOT_FRESH_RACK
SCHEMA_OR_SYNC_DECISIONS_OUTSTANDING=NONE_ADR_008_ACCEPTED
B1_TECHNICAL_CONTRACT_SPEC=docs/adr/ADR-008-b1-pinstate-persistence-sync-contract.md
B1_TECHNICAL_CONTRACT=ACCEPTED
ADR_008_ACCEPTED=true
IMPLEMENTATION_AUTHORIZED=false
FIELD_VALIDATION=PAUSED
PRODUCTION_RELEASE_AUTHORIZED=false
BASELINE_COMMIT=624f1ccd0c9c3f5b444470c5aace04310dfbc1cc
BASELINE_TREE=38a99b05dd589cdb5823311a8d78403d5e3e779c
```

---

## 11. Next packages (do not execute from this ADR)

1. ~~Technical approval of ADR-008~~ → **accepted** (see ADR-008 status).
2. Separate **B1 implementation authorization** (capture + direct Fix only).
   Exact prompt in `PROJECT_STATUS.md`.
