# ADR-005 — Scoring-First Device Shell (ARCH-001 Slice 6)

- **Status**: Implementation accepted and locally closed on
  `codex/arch-001-slice-6-scoring-first-shell`. Integration and publication
  pending. Not a production release.
- **Slice**: `ARCH-001_SLICE_6_SCORING_FIRST_DEVICE_SHELL`
- **Owner**: ChatGPT (Architecture Owner)
- **Work package**: `BOWLING_SLICE_6_LOCAL_BASELINE_COMMIT`

> Requirements were accepted earlier. Implementation is accepted and this
> feature-branch commit locally closes Slice 6. Merge, push, tag, and
> production release remain unauthorized. The `assembleRelease` APK is a
> local acceptance artifact, not a store release.

---

## 1. Baseline

Written against the accepted Slice 5 integration and marker:

```ini
INTEGRATION_BRANCH=arch/001-domain-sync-foundation
BASELINE_COMMIT=e45358d0e8129b248a40d0b68c3b8b959e0642a8
BASELINE_TREE=f40749ae2c0785dd670d81ea937ba2ceb927e5fa
ACCEPTANCE_TAG=v0.5.0-arch001-slice5
TAG_OBJECT=50ed9b487014cefa32816c0666ac914bff43c73b
SLICE_4_SPEC=docs/adr/ADR-003-deterministic-offline-game-scoring.md
SLICE_5_SPEC=docs/adr/ADR-004-offline-game-history-and-resume.md
SLICE_5_EVIDENCE=docs/evidence/arch-001-slice-5-implementation.md
```

Must not contradict ADR-001, ADR-002, ADR-003, or ADR-004 **domain and
selection semantics**. This slice changes **diagnostic and history
presentation** on the existing mobile shell only. It does not remove ADR-004
controls, history listing, restart-to-newest, labels, ordering, or in-session
selection.

ADR-004 recorded `DIAGNOSTIC_HARNESS=RETAIN_EXISTING_CONTROLS`. Slice 6
replaces that **presentation** decision with
`DIAGNOSTIC_HARNESS=COLLAPSED_BY_DEFAULT_NOT_REMOVED`. Existing diagnostic
actions remain reachable.

---

## 2. Objective

One bowler, on the existing Samsung test device, can launch the accepted
self-contained app and immediately use the current game and scoring surface:
identity, legal pinfall entry, derived sheet, and correction. New Game and
History remain clearly reachable. History lists every local game on demand.
Diagnostics stay available under a labeled disclosure. Restart still opens the
newest persisted game.

Displayed scores remain derived and non-authoritative. Scoring logic stays in
the portable domain (`src/scoring`), not in React.

---

## 3. Approved product decisions

```ini
PRIMARY_SURFACE=ACTIVE_GAME_AND_SCORING
DIAGNOSTIC_HARNESS=COLLAPSED_BY_DEFAULT_NOT_REMOVED
HISTORY_PRESENTATION=OPEN_ON_DEMAND
NO_NEW_CANONICAL_FIELDS=true
RESTART_DEFAULT=NEWEST_GAME
GAME_LABEL=LOCAL_CREATION_DATE_AND_TIME
BOWLER_PROFILE=NOT_REQUIRED
```

- **PRIMARY_SURFACE**: on launch, show the current game (restart-newest, or
  empty-state if none) and scoring controls first. Do not place an expanded
  history list or expanded diagnostics above those controls on the initial
  screen.
- **DIAGNOSTIC_HARNESS**: keep every existing diagnostic control (recovery,
  simulated network, simulate process restart, expo-sqlite conformance, and
  related status copy). Collapse them by default behind a clearly labeled
  disclosure. Expanding or collapsing must not reset the selected game or
  mutate persisted facts.
- **HISTORY_PRESENTATION**: History is reachable from the primary surface and
  opens on demand. All existing local games remain listed with accepted
  date/time labels and duplicate-label suffixes. Do not silently truncate,
  hide, archive, or delete games.
- **NO_NEW_CANONICAL_FIELDS**: no new stored Game fields, notes, or names.
- **RESTART_DEFAULT / GAME_LABEL / BOWLER_PROFILE**: unchanged from ADR-004.

### Launch

- Preserve restart-to-newest.
- Show current game identity and scoring surface first.
- Make New Game and History clearly reachable without requiring the bowler to
  scroll past diagnostics or the full history list.
- If no games exist, use the existing empty-state / New Game path. Listing
  still does not create a game.

### Selection and disclosures

Expanding or collapsing History or Diagnostics must not change
`selectedGameId` or write canonical entities / outbox rows. In-session
selection remains: an explicitly opened game stays selected until the user
opens another game or creates a new game.

---

## 4. Layout requirements

Minimum primary surface (initial viewport on the existing Samsung device):

- Current game identity (accepted local date/time label and durable id as
  already shown).
- Derived score sheet (may scroll; not every frame must be on-screen at once).
- Legal pinfall entry for the next accepted slot.
- Existing correction flow (select recorded roll, then correct pinfall),
  including `DOMAIN_INVALID_REQUIRING_REPAIR` presentation already provided by
  Slice 4.
- Explicit New Game and History access.
- Explicit missing-game state (ADR-004: do not substitute another game).
- Invalid-game / domain-invalid presentation without adding scoring rules in
  React.
- A clearly labeled control to expand diagnostics.

Interactive controls must stay clear of status/navigation bars, display
cutouts, and the on-screen keyboard where a keyboard applies. Use existing
React Native `SafeAreaView` (already used by `apps/mobile/App.tsx`) and
established layout primitives. Do not add `react-native-safe-area-context` or
other new dependencies.

Allow necessary scrolling inside History (when open) and inside a long derived
sheet. Primary scoring actions (pinfall, New Game, History, correction when a
roll is selected) must remain practical without first navigating past
diagnostics or the full history list.

Slice 5 device evidence recorded an incidental system phone UI from a
bottom-of-screen tap. Primary pinfall and correction targets must not sit in
the system navigation gesture zone.

Do not add scoring logic to React. Do not redesign unrelated product behavior
(sync copy, NAS messaging, conformance runner semantics).

If a requirement cannot be met without new tooling, new dependencies, schema
migrations, or frozen-domain changes:

```
STOP
RESULT=HOLD
ARCHITECTURE_CONCERN=<exact issue>
```

---

## 5. In scope

- Presentation and navigation of the existing mobile shell
  (`apps/mobile/App.tsx`, `apps/mobile/src/scoringPanel.tsx`).
- Collapsed-by-default diagnostics that still expose the same controls.
- On-demand History that lists all local games and switches by durable id.
- Focused UI-state tests only where disclosure/navigation could reset
  selection or alter list/open behavior.

---

## 6. Out of scope

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
GAME_ARCHIVE_OR_HIDE
STORED_GAME_DISPLAY_NAMES
DURABLE_LAST_OPENED_SELECTION
SCORING_LOGIC_IN_REACT
```

No two-device or live-NAS sync acceptance.

---

## 7. Frozen architecture

Do not change: USBC 2026–2027 scoring derivation; Game/Frame/Roll identity;
append-only corrections and `DOMAIN_INVALID_REQUIRING_REPAIR`; history
ordering (`created_at` desc, then id desc); restart-to-newest; SQLite
persistence; outbox; receipts; pull/change-feed; sync state semantics.

---

## 8. Expected modules

- `apps/mobile/App.tsx` — primary vs collapsed diagnostic presentation.
- `apps/mobile/src/scoringPanel.tsx` — scoring-first layout; History
  open-on-demand; unchanged session APIs.

Do not modify `src/scoring` unless a later implementation gate proves a
presentation bug cannot be fixed in the shell (then STOP and return).

---

## 9. Automated acceptance

```ini
ROOT_TESTS=MUST_REMAIN_PASS
SERVER_TESTS=MUST_REMAIN_PASS
TYPECHECK=MUST_REMAIN_PASS
MOBILE_TYPECHECK=MUST_REMAIN_PASS
SLICE_4_GOLDENS=UNCHANGED
SLICE_5_HISTORY_TESTS=UNCHANGED_SEMANTICS
NEW_TEST_FRAMEWORK=false
```

Add focused UI-state tests only for disclosure/navigation that could reset
selection or mutate facts. Do not duplicate unchanged domain tests.

Automated tests do not prove physical usability or layout clearance.

---

## 10. Physical-device acceptance

Existing Samsung device, data-preserving update of a **self-contained** APK
(embedded JS; no Metro). Not a production store release.

Required observations (screenshots **and** interaction outcomes):

- Offline cold start without Metro; scoring is the primary launch surface.
- New Game and History are reachable from that surface.
- History opens, lists **all** games (no silent truncation), and switches
  correctly.
- Resume, correction, and New Game preserve ADR-003 / ADR-004 behavior.
- Diagnostics expand and collapse; existing controls remain.
- Disclosure changes do not change the selected game.
- Primary controls avoid system navigation and keyboard obstruction.
- Force-stop/relaunch still selects the newest persisted game.
- Existing user data is preserved (`adb install -r`; no uninstall/clear).

---

## 11. Historical evidence

This ADR does not rewrite Slice 3 independent-review HOLD, Slice 4 initial
device HOLD (`ADB_AND_MOBILE_ACCEPTANCE_ENABLEMENT`), or Slice 5
`DEBUG_ARTIFACT_REQUIRES_METRO` HOLD. Slice 5 remains formally closed on
`e45358d` / `v0.5.0-arch001-slice5`.

---

## 12. Approval status

Historical requirements gate (not rewritten):

```ini
ARCHITECTURE_AUTHORITY_REVIEW=BOWLING_SLICE_6_REQUIREMENTS_ACCEPTANCE
RESULT=APPROVED
SLICE_6_REQUIREMENTS=ACCEPTED
IMPLEMENTATION_AUTHORIZED=false
NEXT_ACTION=BOUNDED_IMPLEMENTATION_AUTHORIZATION
```

Implementation acceptance and local feature-branch closure (commit identity
is not predicted in this file):

```ini
ARCHITECTURE_AUTHORITY_REVIEW=BOWLING_SLICE_6_ACCEPTANCE_DECISION
RESULT=PASS
SLICE_6_IMPLEMENTATION_ACCEPTED=true
SLICE_6_FORMALLY_CLOSED=true
SLICE_6_LOCALLY_CLOSED=true
AUTOMATED_ACCEPTANCE=PASS
PHYSICAL_DEVICE_ACCEPTANCE=PASS
OFFLINE_ACCEPTANCE=PASS
LOCAL_BASELINE_COMMIT_PENDING=false
INTEGRATION_PENDING=true
PRODUCTION_RELEASE=false
SLICE_7_IMPLEMENTATION_AUTHORIZED=false
ACCEPTANCE_APK=LOCAL_ASSEMBLE_RELEASE_NOT_PRODUCTION
ACCEPTANCE_APK_SHA256=406ccca87c1e0d1a5641934fc0e7b78fd8a3fa7a77f414cbc23abd2435bb2a70
PARENT_HEAD=e45358d0e8129b248a40d0b68c3b8b959e0642a8
PARENT_TREE=f40749ae2c0785dd670d81ea937ba2ceb927e5fa
WORKING_BRANCH=codex/arch-001-slice-6-scoring-first-shell
EVIDENCE=docs/evidence/arch-001-slice-6-implementation.md
NEXT_ACTION=POST_SLICE_6_READ_ONLY_INTEGRATION_REVIEW
```
