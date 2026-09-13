# ADR-006 — First-Use Scoring Presentation

- **Status**: Requirements accepted. Implementation not authorized.
- **Slice context**: Presentation follow-on after ARCH-001 Slice 6
  (`v0.6.0-arch001-slice6`). This is not Slice 7 domain work and is not a
  production release.
- **Owner**: ChatGPT (Architecture Owner)
- **Work package**: `BOWLING_FIRST_USE_REQUIREMENTS_ACCEPTANCE`

> **THIS DOCUMENT IS ACCEPTED PRESENTATION REQUIREMENTS ONLY.**
> `IMPLEMENTATION_AUTHORIZED=false`. Architecture Authority approved the
> first-use redesign direction. Do not treat this ADR as implementation
> authorization, field-test PASS, or user-comprehension PASS.
> Historical ADR-003–ADR-005 **domain, identity, correction, persistence,
> history ordering, and restart** decisions are not rewritten. This ADR
> **supersedes ADR-005 ordinary-path presentation copy, chrome, and layout
> hierarchy** as listed in section 4.

---

## 1. Baseline and trigger

Written against the accepted Slice 6 integration marker:

```ini
INTEGRATION_BRANCH=arch/001-domain-sync-foundation
BASELINE_COMMIT=94cfc4b8ef54cc7501b9dd143d948566fd861fa2
BASELINE_TREE=4582a137cbb13fd396c3a1d6904de16f39a6a86b
ACCEPTANCE_TAG=v0.6.0-arch001-slice6
SLICE_4_SPEC=docs/adr/ADR-003-deterministic-offline-game-scoring.md
SLICE_5_SPEC=docs/adr/ADR-004-offline-game-history-and-resume.md
SLICE_6_SPEC=docs/adr/ADR-005-scoring-first-device-shell.md
USER_REPORTED_BLOCKER=INTERFACE_NOT_UNDERSTANDABLE
FIELD_VALIDATION=PAUSED
```

The user reported the interface is not intuitive and they do not know how to
use the application. That is a **first-use usability blocker**, not a scoring
defect and not a completed field-test FAIL. Slice 6 technical/device PASS
results remain on the record; they do not prove first-use comprehension.

A read-only review of current `apps/mobile/src/scoringPanel.tsx`,
`apps/mobile/App.tsx`, and existing device screenshots found ordinary-path
copy and controls that compete with scoring (UUID, engine dump, two identical
pads, “Create a game, then enter pinfall” on an already-open game). That
review was **not** a user test.

---

## 2. Objective

One first-time bowler can, without a separate manual:

1. Understand that the app scores a ten-pin game by recording pins knocked
   down on each ball.
2. Start a new game, or see that a game is already open.
3. Enter the next legal delivery.
4. Know which game, frame, and ball are active.
5. See that an entry was saved after persistence succeeds.
6. Correct a mistaken entry through an explicit **Fix a ball** mode.
7. Find a previous game and open it.
8. Recognize when a game is finished.

```ini
PRIMARY_SURFACE=ACTIVE_GAME_AND_SCORING
ORDINARY_PATH=PLAIN_BOWLING_LANGUAGE
DIAGNOSTICS=SECONDARY_ADVANCED_VIEW
HISTORY_PRESENTATION=OPEN_ON_DEMAND
NO_NEW_CANONICAL_FIELDS=true
RESTART_DEFAULT=NEWEST_GAME
GAME_LABEL=LOCAL_CREATION_DATE_AND_TIME
BOWLER_PROFILE=NOT_REQUIRED
CORRECTION_MODE=EXPLICIT_FIX_A_BALL
ENTRY_PADS=ONE_VISIBLE_AT_A_TIME
```

---

## 3. Frozen behavior (unchanged)

Do not change: USBC 2026–2027 scoring derivation in `src/scoring`; Game /
Frame / Roll identity; append-only correction audit; `DOMAIN_INVALID_REQUIRING_REPAIR`
semantics (Decision 4-4); SQLite persistence; outbox; receipts; sync state;
history ordering (`created_at` desc, then id desc); restart-to-newest;
in-session selection; legal next-ball validation for **new** entries;
correction validation for **corrections**.

No profiles, stored game names, archive, NAS, authentication, new
dependencies, schema migrations, or production release.

Displayed scores remain reconstructed from observed facts. The UI must not
add scoring calculations. The UI must not explain canonical vs derived
authority on the ordinary scoring path.

If an implementation requirement would change a frozen item:

```
STOP
RESULT=HOLD
ARCHITECTURE_CONCERN=<exact issue>
```

---

## 4. Approved presentation changes vs ADR-005

ADR-005 remains the accepted Slice 6 **shell architecture** (scoring-first,
history on demand, diagnostics not removed, no new canonical fields,
restart-newest). The following **ordinary-path presentation** items in
ADR-005 are superseded by this ADR:

| ADR-005 ordinary path | ADR-006 ordinary path |
| --- | --- |
| Show durable game id with the date/time label | Hide UUIDs on the ordinary path; date/time label remains |
| Title / copy such as “Offline scoring”, “pinfall”, “Enter roll (F1 R2)” | Plain bowling language (section 6) |
| “Current derived sheet (non-authoritative)” and engine status dump | Readable ten-frame scorecard; no “non-authoritative”, “derived sheet”, or canonical-fact explanations in normal scoring copy |
| Two 0–10 pads visible (next ball and correction) | One number pad visible at a time |
| Correction: select a recorded roll while the next-ball pad remains | Explicit **Fix a ball** mode; cancel returns to scoring |
| Diagnostics collapsed but on the scoring screen | All diagnostic controls remain reachable only through a secondary **Advanced** view |
| New Game and History as equally prominent primary actions | **Previous games** and **Start a new game** clearly secondary while scoring |
| New-game / History labels | **Start a new game** / **Previous games**; list rows use **Open** (completed games must not be labeled **Continue**) |

Diagnostics, schema, outbox, recovery, simulated network, process-restart,
and expo-sqlite conformance controls are **retained**. They must not occupy
the ordinary scoring path.

Opening Advanced, Previous games, or Fix a ball must not silently change
`selectedGameId`. In-session selection and restart-to-newest remain ADR-004.

---

## 5. Screen flow

### 5.1 Opening the app

Restart still opens the newest persisted game (or empty state if none).

- **No games:** explain that the app scores a ten-pin game. One primary
  action: **Start a game**. Copy: *Score a ten-pin game. After each throw,
  tap how many pins fell.*
- **Newest game in progress:** show that game’s date/time label, current
  frame and ball, last-saved feedback if any, one next-ball pad, scorecard.
  Do **not** tell the user to create a game when a game is already open.
- **Newest game complete:** completed-game state (section 5.5). Primary:
  **Start a new game**.

Missing-game (ADR-004) remains explicit: do not substitute another game.

### 5.2 Recording the next delivery

One number pad. Prompt: **How many pins did you knock down on this ball?**

Offer only values permitted by existing **next-ball** validation. Disabled
or absent choices must not be tappable as if legal.

Show **Saved** (with frame, ball, and value) **only** after the existing
record operation succeeds. Do not claim Saved on a failed write. Invalid
attempt: *That number isn’t allowed for this ball.* (or the existing
validation message, rewritten in the same plain language without engine
codes).

### 5.3 Correcting an entry

**Fix a ball** opens an explicit correction mode. The next-ball pad is not
shown in this mode.

1. Choose a recorded ball (usable touch targets; frame and ball labels).
2. See its frame, ball number, and existing value.
3. Choose the corrected value on **one** pad. Choices follow **existing
   correction** semantics, not next-ball entry restrictions.
4. Save through the existing correction operation, or **Cancel** with no
   changes.

Do not display two indistinguishable pads at once.

After save: **Saved** only if the correction persisted. If the game is
`DOMAIN_INVALID_REQUIRING_REPAIR`, say that later balls need attention; do
**not** claim the score is valid and do **not** silently reinterpret facts.

Preserve leftover-fact repair semantics from ADR-003 Decision 4-4.

### 5.4 Opening a previous game

**Previous games** opens the existing newest-first list with accepted
date/time labels and duplicate-label suffixes. Identity remains the Game
id (shown in Advanced if needed, not on ordinary rows).

Each row uses **Open**. Do not label completed games **Continue**. An
in-progress game may use **Open** as well; **Continue** must not be the
universal label.

Opening a row selects that game and returns to the scoring (or completed)
surface. Listing does not create a game. Starting a new game does not
delete others.

Copy: *These are your games. Tap one to open it. Starting a new game does
not delete others.*

### 5.5 Completing a game

When existing derivation reports the game complete: **Game finished** and
the final total from the existing projection. No next-ball pad. Primary:
**Start a new game**. Secondary: **Previous games**. Fix a ball remains
available.

---

## 6. Exact ordinary-path wording

| Role | Wording |
| --- | --- |
| App title | Bowling |
| Empty start | Score a ten-pin game. After each throw, tap how many pins fell. |
| Current game | This game · {accepted date/time label} |
| Next-ball context | Frame {n} · {1st\|2nd\|3rd} ball |
| Next-ball prompt | How many pins did you knock down on this ball? |
| Saved after record | Saved: Frame {n}, {1st\|2nd\|3rd} ball = {pins} |
| Illegal next ball | That number isn’t allowed for this ball. |
| Start | Start a new game (empty state: Start a game) |
| History | Previous games |
| History hide | Hide previous games (or return to the game) |
| History open action | Open |
| Correction entry | Fix a ball |
| Correction prompt | Change Frame {n}, {ordinal} ball. It is now {pins}. What did you actually knock down? |
| Correction saved | Saved. |
| Repair needed | This game needs a later ball fixed before the score can be finished. |
| Complete | Game finished. Final score {n}. |
| Diagnostics | Advanced |
| Cancel correction | Cancel |

Do not use on the ordinary path: non-authoritative, derived sheet, pinfall
(as the primary noun), ENTER ROLL, F1 R2 engine style, IN_PROGRESS,
NOT_STARTED, unavailable, UUID, schema, outbox, corrections: {count} as
chrome.

---

## 7. Scorecard presentation

Presentation only. Bind to existing scoring projections (`deriveGame` /
existing sheet fields). No new totals, mark logic, or tenth-frame rules in
UI code.

- Show ten frames in a readable layout. Do **not** force all ten into
  unreadably narrow columns; wrap or stack as needed on the Samsung test
  device.
- Distinguish unplayed balls from a recorded zero.
- Use strike / spare notation only where accepted facts and existing rules
  already support that mark.
- Leave unresolved bonus totals visibly pending (do not invent a total).
- Represent tenth-frame bonus deliveries correctly (existing frame-10
  topology).
- Keep frame and ball labels accessible; touch targets usable and clear of
  system navigation.

---

## 8. Advanced view

Retain every existing diagnostic control currently on the shell, including
recovery, simulated network, simulate process restart, expo-sqlite
conformance, and related status copy. Place them in **Advanced**, off the
ordinary scoring path. Expanding or collapsing Advanced must not reset
selection or mutate facts.

---

## 9. Expected modules (when later authorized)

- `apps/mobile/App.tsx` — Advanced vs ordinary path.
- `apps/mobile/src/scoringPanel.tsx` — wording, single pad, Fix a ball,
  scorecard layout, Previous games / Start a new game hierarchy.

Do not modify `src/scoring` unless a later implementation gate proves a
presentation bug cannot be fixed in the shell (then STOP and return).

Focused UI-state tests may cover disclosure/mode not resetting selection
and one-pad-at-a-time. Automated tests and agent screenshots do **not**
establish user comprehension.

---

## 10. First-use acceptance (separate from device PASS)

After a separately authorized implementation, the **actual user** runs an
unaided practice walkthrough. No lane visit. Use a **new** practice game.
Do not edit existing user games (including Sep 7–8 games).

Without coaching after handing the phone, the user must identify and
perform:

1. What the app does.
2. Start a new practice game.
3. Enter one delivery (pins knocked down on that ball).
4. Correct that delivery via Fix a ball.
5. Leave and reopen the practice game through Previous games.

Record assistance honestly. Any coaching required for a required action:
`USER_WALKTHROUGH=HOLD`. Agent-operated screenshots and “controls are
reachable” do not pass this gate.

Real-lane field validation stays **paused** until this walkthrough PASSes.
Prior Slice 6 technical PASS is not erased.

---

## 11. Out of scope

Same exclusions as ADR-005 section 6, plus: profiles, game names, archive,
sync enablement, analytics, coaching, and any capability added only to
solve first-use by storing extra fields.

---

## 12. Approval status

```ini
ARCHITECTURE_AUTHORITY_REVIEW=BOWLING_FIRST_USE_REQUIREMENTS_ACCEPTANCE
RESULT=APPROVED
FIRST_USE_USABILITY=REQUIREMENTS_ACCEPTED
USER_WALKTHROUGH=PENDING
FIELD_VALIDATION=PAUSED
IMPLEMENTATION_AUTHORIZED=false
PRODUCTION_RELEASE=false
```

Historical requirements approval is unchanged above. Subsequent Architecture
Authority packages authorized implementation, user first-use acceptance, and
this local baseline.

## 13. Local first-use package (not production)

```ini
LOCAL_FIRST_USE_PACKAGE_ACCEPTED=true
HISTORY_PLACEMENT_TECHNICALLY_VERIFIED=true
USER_TESTED_FINAL_PLACEMENT=false
USER_FIRST_USE_DECISION=ACCEPT
USER_ACCEPTANCE_APK_SHA256=94881bdf05d55c1e9069aebd1bd0c32db68f3941c26ea8ccfbb026a379289405
FINAL_PLACEMENT_APK_SHA256=8edb6e2dda5818c7594cd010117d804d9b80332f7a40d23c34e37f279333e786
INTEGRATION_PENDING=true
FIELD_VALIDATION=PAUSED
PRODUCTION_RELEASE_AUTHORIZED=false
TENTH_FRAME_DEFECT=CLOSED
P2_CONNECTION_CACHE=CLOSED
P2_RECOVERY_COVERAGE=CLOSED
SQLITE_DIAGNOSTIC_DISPOSITION=RETAIN_LOCAL_ACCEPTANCE_ONLY
ORIGINAL_NATIVE_CAUSE=UNCONFIRMED
```

Direct frame selection for correction, and pinfall plus numbered standing-pin
observations with per-game/historical analysis, remain future product
requirements. They are not current first-use blockers.

