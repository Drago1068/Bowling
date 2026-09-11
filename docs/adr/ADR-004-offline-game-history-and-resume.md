# ADR-004 — Offline Game History and Resume (ARCH-001 Slice 5)

- **Status**: Formally closed (implementation accepted on the feature branch; integration pending)
- **Slice**: `ARCH-001_SLICE_5_OFFLINE_GAME_HISTORY_AND_RESUME`
- **Owner**: ChatGPT (Architecture Owner)
- **Work package**: `BOWLING_SLICE_5_ACCEPTANCE_AND_LOCAL_COMMIT`

> Requirements were accepted earlier. Implementation is now accepted and
> formally closed on `codex/arch-001-slice-5-history-resume` against parent
> `9a789b8`. `INTEGRATION_PENDING=true`. `PRODUCTION_RELEASE=false`.
> `SLICE_6_IMPLEMENTATION_AUTHORIZED=false`. The local `assembleRelease` APK
> is an acceptance artifact, not a production store release.

---

## 1. Baseline

Written against the accepted Slice 4 integration:

```ini
INTEGRATION_BRANCH=arch/001-domain-sync-foundation
BASELINE_COMMIT=9a789b8ccd9b7067e84e161d8bcd8b1fd954dca4
BASELINE_TREE=ef614520350cc34b053fb50e7389ed4549472f02
ACCEPTANCE_TAG=v0.4.0-arch001-slice4
TAG_OBJECT=7d9d611e0160387c4e3520a0bd023b042eabea3f
SLICE_4_SPEC=docs/adr/ADR-003-deterministic-offline-game-scoring.md
SLICE_4_EVIDENCE=docs/evidence/arch-001-slice-4-formal-closure.md
```

Must not contradict ADR-001, ADR-002, or ADR-003. Accepted scoring derivation,
USBC 2026–2027 pin, observation identity, correction audit, and Slice 1–3
sync/recovery contracts remain frozen.

---

## 2. Objective

One bowler, on one device, can list locally persisted games, open a chosen game
by durable ID, continue or correct it under Slice 4 rules, and start a new
game without deleting others. Displayed state is reconstructed from SQLite facts.
After process restart, the newest persisted game is opened. No durable
last-opened selection is stored in this slice.

---

## 3. Approved product decisions

```ini
GAME_LABEL=LOCAL_CREATION_DATE_AND_TIME
RESTART_DEFAULT=NEWEST_GAME
DIAGNOSTIC_HARNESS=RETAIN_EXISTING_CONTROLS
BOWLER_PROFILE=NOT_REQUIRED
```

- **GAME_LABEL**: presentation only. Durable identity remains the Game entity
  ID. Display the game’s local creation date and time. If two games would show
  the identical timestamp string, append a short ID suffix sufficient to
  distinguish them. Do not persist labels.
- **RESTART_DEFAULT**: after process restart, open the newest persisted game
  under section 4 ordering. Do not add last-opened persistence.
- **DIAGNOSTIC_HARNESS**: keep existing diagnostic controls on the mobile shell.
  History/resume is additive and thin.
- **BOWLER_PROFILE**: not required. Continue device-local games without a
  BowlerProfile.

### In-session selection (not durable)

While the app remains running, the explicitly opened game stays selected until
the user opens another game or creates a new game. Refresh, derived-sheet
reload, and recording or correcting a roll must not silently switch to the
newest game.

### Ordering and tie-breaker

Use existing newest-first listing. Deterministic order, without changing stored
timestamps or identity:

1. `created_at` descending.
2. Equal `created_at`: durable Game `id` lexicographic descending.

“Newest” for restart uses this order’s first game. Empty history is empty; do
not create a game as a side effect of listing.

---

## 4. In scope

- List all locally persisted `Game` entities.
- Open a selected game by durable ID and reconstruct the Slice 4 scoring view
  from SQLite.
- Continue an incomplete game under existing Slice 4 entry rules.
- View and correct prior games under existing correction rules, including
  `DOMAIN_INVALID_REQUIRING_REPAIR`.
- Start a new game without deleting or mutating another game’s facts.
- Clear empty-history state (no auto-created game).
- Thin, usable controls on the existing mobile shell.

Listing or opening must not create observations, modify canonical facts, or
enqueue sync mutations.

Completed games cannot accept additional rolls unless an existing valid
correction changes derived state so continuation is legal under Slice 4.

If an explicitly selected game cannot be loaded, report that clearly. Do not
silently substitute another game (that would risk recording against the wrong
game).

---

## 5. Out of scope

```
AUTHENTICATION
BOWLER_PROFILES
MULTI_BOWLER
BOWLING_SESSION_SERIES
TEAMS
LEAGUES
MATCH_PLAY
ANALYTICS
COACHING
SHOT_OR_PIN_LEAVE_DETAIL
HANDICAP
TOURNAMENTS
NAS_ACCESS
NAS_DEPLOYMENT
LIVE_MOBILE_SYNC_ENABLEMENT
CONFLICT_RESOLUTION_UI
PUBLIC_CLOUD_DEPLOYMENT
NEW_TOOLING
DEPENDENCY_UPGRADES
SCHEMA_MIGRATIONS
PRODUCTION_RELEASE
APK_REBUILD_IN_THIS_DOCUMENTATION_PACKAGE
DURABLE_LAST_OPENED_SELECTION
```

No two-device sync acceptance is required for this slice.

---

## 6. Frozen architecture

Do not change: USBC-pinned scoring derivation, Game/Frame/Roll identity,
append-only corrections and P1 downstream-invalid handling, SQLite
persistence, outbox, receipts, pull/change-feed, or sync state semantics.

If a requirement cannot be met without changing a frozen item:

```
STOP
RESULT=HOLD
ARCHITECTURE_CONCERN=<exact issue>
```

Do not broaden this slice instead.

---

## 7. Expected modules (implementation, when separately authorized)

Additive use of existing surfaces; names indicative:

- `src/scoring/session.ts` — list/order, load-by-id, missing-game result;
  `listGamesNewestFirst` already exists and must be given a portable export if
  the mobile shell needs it.
- `src/scoring/index.ts` / `src/portable.ts` — export list/open APIs without
  scoring in React.
- `apps/mobile/src/scoringPanel.tsx` and `apps/mobile/App.tsx` — history list,
  open, empty state, stable in-session selection; retain diagnostic controls.
- Tests under `tests/` for gates in section 8.

No schema migrations. No scoring engine edits unless a frozen-contract
conflict is returned to Architecture Authority.

---

## 8. Automated acceptance

Required, without weakening Slice 4 vectors:

- Empty history listing creates no Game/Frame/Roll and no outbox rows.
- Newest-first order and equal-`created_at` id tie-breaker.
- Open by durable ID; missing ID is an explicit failure, not a substitute.
- In-session selection stays on the opened game across refresh and mutation.
- Recording or correcting one game does not alter another game’s facts.
- New Game preserves prior games.
- Simulated process restart / reopen loads the newest persisted game.
- Listing and opening produce no canonical or outbox changes.
- Slice 4 scoring/correction goldens unchanged (300 / 150 / 0 / 80 / 169 and
  P1 repair behavior).
- Root tests, `npm run test:server`, `npm run typecheck`,
  `npm run typecheck:mobile`.

Device acceptance is separate from automated acceptance.

---

## 9. Physical-device acceptance

On the existing Samsung test device (debug/native path; not a production
release):

- Two distinct games with readable labels and usable controls.
- Switch between them; resume an incomplete game; correct a prior game.
- Create a new game, then reopen an older game (in-session selection).
- Force-stop and relaunch opens the newest persisted game.
- Repeat primary flows offline.

No two-device or live-NAS sync acceptance.

---

## 10. Historical evidence

This ADR does not rewrite Slice 3 independent-review HOLD, Slice 4 P1
(historical, closed), or the initial device HOLD
(`ADB_AND_MOBILE_ACCEPTANCE_ENABLEMENT`).

---

## 11. Approval status

Historical requirements gate (not rewritten):

```ini
ARCHITECTURE_AUTHORITY_REVIEW=BOWLING_SLICE_5_REQUIREMENTS_ACCEPTANCE
RESULT=APPROVED
SLICE_5_REQUIREMENTS=ACCEPTED
IMPLEMENTATION_AUTHORIZED=false
NEXT_ACTION=RETURN_FOR_BOUNDED_IMPLEMENTATION_AUTHORIZATION
```

Formal implementation acceptance (this closure):

```ini
SLICE_5_IMPLEMENTATION_ACCEPTED=true
SLICE_5_FORMALLY_CLOSED=true
AUTOMATED_ACCEPTANCE=PASS
PHYSICAL_DEVICE_ACCEPTANCE=PASS
OFFLINE_ACCEPTANCE=PASS
INTEGRATION_PENDING=true
PRODUCTION_RELEASE=false
SLICE_6_IMPLEMENTATION_AUTHORIZED=false
ACCEPTANCE_APK=LOCAL_ASSEMBLE_RELEASE_NOT_PRODUCTION
ACCEPTANCE_APK_SHA256=0038f8f8a543ce95c77d08b43b0ffd57ef63abcde6eb87b42e4b571778e2bca7
PARENT_HEAD=9a789b8ccd9b7067e84e161d8bcd8b1fd954dca4
NEXT_ACTION=POST_SLICE_5_BASELINE_INTEGRATION_REVIEW
```
