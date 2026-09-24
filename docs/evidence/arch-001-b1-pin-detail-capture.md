# B1 Pin Detail Capture — Implementation + Device Acceptance Evidence

```ini
WORK_PACKAGE=BOWLING_B1_BUILD_RECOVERY_DEVICE_ACCEPTANCE
RESULT=READY_FOR_ACCEPTANCE_REVIEW
BASELINE_COMMIT=624f1ccd0c9c3f5b444470c5aace04310dfbc1cc
BASELINE_TREE=38a99b05dd589cdb5823311a8d78403d5e3e779c
WORKING_BRANCH=codex/b1-pin-detail-capture
REQUIREMENTS=docs/adr/ADR-007-pin-detail-and-analysis-requirements.md
TECHNICAL_CONTRACT=docs/adr/ADR-008-b1-pinstate-persistence-sync-contract.md
IMPLEMENTATION_AUTHORIZED=true
COMMIT_AUTHORIZED=false
PUSH_AUTHORIZED=false
TAG_AUTHORIZED=false
PRODUCTION_RELEASE_AUTHORIZED=false
FIELD_VALIDATION=PAUSED
COMMITS_CREATED=false
PUSH_PERFORMED=false
TAG_PUBLISHED=false
NAS_ACCESSED=false
OTHER_PROJECTS_ACCESSED=false
CANDIDATE_VERIFIED=true
ANDROID_TREE_ABSENCE_CAUSE=GENERATED_AND_GITIGNORED
BUILD_RECOVERY_METHOD=EXISTING_EXPO_ANDROID_TREE_ASSEMBLE_RELEASE
TRACKED_BUILD_CONFIGURATION_CHANGES=none
MIGRATION_EVIDENCE_VERIFIED=true
APK_SHA256=2a676cf6847bb34bbc29a8eae256fb37cb9f507a76ee3b604b6042f29cd21109
PACKAGE_AND_SIGNING_MATCH=true
INSTALLED_ARTIFACT_VERIFIED=true
DEVICE_ACCEPTANCE=PASS
EXISTING_USER_DATA_PRESERVED=true
USER_PIN_SELECTOR_ACCEPTANCE=PENDING
```

## Candidate verification

- Branch `codex/b1-pin-detail-capture` at baseline commit/tree above.
- Uncommitted B1 implementation working tree matches prior automated evidence:
  - Root `npm test` **188/188 PASS**
  - Server `npm run test:server` **41/41 PASS**
  - `npm run typecheck` / `npm run typecheck:mobile` PASS
- No B1 source candidate changes were made during this build/device package;
  automated suites were not re-run.

### Representative source hashes (working tree)

| Path | SHA-1 |
| --- | --- |
| `src/entities.ts` | `4c301c37e9461208aae560b0adb85f698bd360aa` |
| `src/scoring/pinDetail.ts` | `b0582fb44e5952bf70df385de8dafa82390b4d36` |
| `src/scoring/session.ts` | `d39f2f3fa6ff3758d557071a178606a71d213bb1` |
| `src/persistence/sqlite/migrations.ts` | `f0dbad71cca8b6918bb3a51522c38ce9624460f9` |
| `apps/mobile/src/scoringPanel.tsx` | `572b20d3d63846aa62219a7dd8242cae267d7aaa` |
| `tests/b1.pin-detail.test.ts` | `a6a025650fbc4a0d628a960e39243675df5ffd84` |

## Android tree absence cause

`apps/mobile/android` is **present on disk** and listed in `apps/mobile/.gitignore`
as `/android` (Expo-generated native project). It is **not** tracked in git and was
**not** missing from the workspace. Prior HOLD (`ANDROID_TREE_ABSENT_FROM_WORKSPACE`)
was a tooling/gitignore false negative.

Established path (unchanged config):

- `bundleCommand = "export:embed"`
- `applicationId 'com.drago1068.bowling'`
- `versionCode 1` / `versionName "0.1.0"`
- release and debug both use `signingConfigs.debug` / `android/app/debug.keystore`
- Build: `cd apps/mobile/android && .\gradlew.bat assembleRelease`
- Output: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`

Tracked build-configuration changes from recovery: **none**.

## Pre-install checks

| Check | Result |
| --- | --- |
| Embedded JS | `assets/index.android.bundle` present (1,382,652 bytes) |
| Package ID | `com.drago1068.bowling` |
| New APK cert SHA-256 | `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` |
| Installed cert SHA-256 | same (Android Debug) |
| Pre-update installed APK SHA-256 | `8edb6e2dda5818c7594cd010117d804d9b80332f7a40d23c34e37f279333e786` |
| Data-preserving update | supported (`adb install -r`) |

### Migration evidence (before phone update)

- Automated: fresh → v3; v2→v3 precheck failure preserves duplicate PinState rows
  (`tests/b1.pin-detail.test.ts`).
- One-off upgrade with games: v2 DB with 1 Game / 10 Frames / 1 Roll → v3
  `upgrade.ok=true`, entity counts unchanged, `loadScoringView` succeeds.

### Pre-update device observations (not a full backup)

- `firstInstallTime=2026-09-07 12:13:15`
- `lastUpdateTime=2026-09-13 19:16:59` (pre-update)
- Visible current game label: `This game — 9/13/2026, 7:21:04 PM`

## Install

```text
adb -s R3CY40E6FVJ install -r app-release.apk → Success
```

Post-install:

- `lastUpdateTime=2026-09-21 17:45:29`
- `firstInstallTime` unchanged (`2026-09-07 12:13:15`)
- Installed APK SHA-256 matches build: `2a676cf6847bb34bbc29a8eae256fb37cb9f507a76ee3b604b6042f29cd21109`
- Cert unchanged (`fac61745…`)

## Device acceptance (offline, embedded APK, no Metro)

Device: Samsung serial `R3CY40E6FVJ`. Dedicated new acceptance games; observations in
`docs/evidence/b1-device-observations.txt` and
`docs/evidence/b1-device-observations-continued.txt`; screenshots
`docs/evidence/b1-device-01-*.png` … `b1-device-19-*.png`.

| Check | Observation |
| --- | --- |
| Pinfall-only save | F1B1=3, Save without standing → notice “Pin detail not recorded” |
| Numbered standing | F2B1=8, standing 9,10 → “Standing: 9, 10.” |
| Untouched detail | pinfall-only path remains “not recorded” |
| Explicit empty standing | F2B2=2 with standing touched then cleared → “Standing: none.” |
| Cancel writes nothing | pinfall 5 then Cancel → still on entry prompt; no save for 5 |
| Fix opens durable roll | Fix → “Choose the ball to change” → select F1B1 |
| Add / correct / remove / re-add | standing 1–7 → correct to 1–6,8 → remove → re-add 4–10 |
| Incompatible detail preserved | correct pinfall to 10 with standing retained → `(STALE_DETAIL)` shown |
| Cold restart | force-stop + launch; same game + repair banner retained |
| HOT resume | HOME then resume; same state retained |
| Existing user games | History lists multiple `9/13/2026` games including `7:21:04 PM`; opened `9/13/2026, 9:41:21 AM` (final score 236) |
| Tenth 10,9,1 | strikes to F10; F10: 10,9,1; pin 5 not enabled on ball 3; finished score 289 |

Acceptance game identities (device labels):

- Primary B1 exercise game: `9/21/2026, 6:19:57 PM` (also earlier attempt games same evening)
- Tenth-frame game: `9/21/2026, 6:25:52 PM`
- Pre-existing opened: `9/13/2026, 9:41:21 AM` (score 236); listed also `9/13/2026, 7:21:04 PM`

## Open findings (historical — prior device package)

- `USER_PIN_SELECTOR_ACCEPTANCE=PENDING` (user comprehension; not part of agent device PASS).
- **Prior workaround (resolved in Fix-exit package below):** Fix-mode Cancel could sit
  below the fold after a long roll list; agent once used cold restart when Cancel was
  not visible after `STALE_DETAIL` (no data loss). Restart is **not** an acceptable
  Cancel mechanism going forward.

## B1 Fix-mode exit accessibility (this package)

```ini
WORK_PACKAGE=BOWLING_B1_FIX_EXIT_ACCESSIBILITY
RESULT=READY_FOR_USER_WALKTHROUGH
PRIOR_APK_SHA256=2a676cf6847bb34bbc29a8eae256fb37cb9f507a76ee3b604b6042f29cd21109
CANDIDATE_APK_SHA256=43aaf3b1b59301cdfd43778e845a12a716435f6bbd364ce5e704df2b22104526
B1_FORMAL_ACCEPTANCE=false
USER_PIN_SELECTOR_ACCEPTANCE=PENDING
FIELD_VALIDATION=PAUSED
RESTART_WORKAROUND_REQUIRED=false
```

### Cause and fix

Long Fix roll lists were rendered above Save/Cancel in one vertical stack inside the
app `ScrollView`, so exit controls required scrolling the full roll list (and once a
cold restart). Presentation change only:

- While choosing: Cancel sits **above** a height-capped roll `ScrollView`.
- While editing: full chooser hidden; scorecard hidden; Cancel sits with the editor
  (above pin pad); Save standing pins remains explicit after standing picker;
  “Choose a different ball” restores the chooser without exiting Fix.
- Helpers in `src/shellPresentation.ts`: `fixModeLayout`, `fixSaveTargetRollId`,
  `fixCancelPresentationReset`, `fixExitControlsReachableWithLongRollList`.

No validation, migration, sync, analysis, or dependency changes.

### Source hashes (Fix-exit candidate)

| Path | SHA-1 |
| --- | --- |
| `apps/mobile/src/scoringPanel.tsx` | `b6fcf2529efc7b59bd92c388c5d6c8e80cb2382e` |
| `src/shellPresentation.ts` | `758fd52de114f57318770cc98b572d07a3cafbc3` |
| `tests/shell.presentation.test.ts` | `f234c4b765e3c4e4add1dcebe1a9af5421c1119c` |

### Automated

- Focused FIX_EXIT presentation tests: **PASS** (12/12 in `shell.presentation.test.ts`)
- `npm run typecheck` PASS; `npm run typecheck:mobile` PASS
- Domain/server suites not re-run (diff is presentation-only; prior 188/188 and 41/41 remain applicable)

### Build / install

- `assembleRelease` / `export:embed`; signing still debug keystore (`fac61745…`)
- Data-preserving `adb install -r` on `R3CY40E6FVJ`; `firstInstallTime` preserved
- Installed APK SHA-256: `43aaf3b1b59301cdfd43778e845a12a716435f6bbd364ce5e704df2b22104526`

### Long-game device check (offline, no force-stop)

Game `9/21/2026, 8:36:12 PM` (~18 rolls). Evidence:
`docs/evidence/b1-fixexit-observations-final.txt`,
`docs/evidence/b1-fixexit-01-*.png` … `05-*.png`.

| Check | Result |
| --- | --- |
| Chooser Cancel above roll list | PASS (`Cancel.T=1603` < `Frame1.T=1998`) |
| Editor shows Save + Cancel without full chooser | PASS (`Cancel.T=915` above `Save.T=2366`) |
| Cancel exits Fix without restart | PASS |
| Save standing on Frame 1 | PASS (`Saved standing pins: 6, 7, 8, 9, 10.`) |
| Existing `9/13/2026` games still listed | PASS |

## Scope delivered (implementation carry-forward)

- Pinfall-first entry with optional numbered standing pins and explicit Save
- Atomic Roll ± PinState + outbox multi-mutation
- Direct frame/ball Fix: pinfall correct, add/correct/remove/re-add detail
- Reader applicability states (ADR-008 taxonomy) including `STALE_DETAIL`
- SQLite v3 + Postgres v2: fail-closed precheck then `ux_pinstate_active_roll`
- Server PinState shape validation; CREATE association CONFLICT via SAVEPOINT
- Pull association collision handling
- Fix-mode Save/Cancel reachable with long roll lists (no restart Cancel)
- No analysis UI, PinLeave writes, or new dependencies

## Graphical entry redesign prototype (2026-09-23)

```ini
WORK_PACKAGE=BOWLING_GRAPHICAL_ENTRY_PROTOTYPE
USER_PIN_SELECTOR_ACCEPTANCE=HOLD
REASON=USER_REPORTS_CONFUSING_ENTRY
PROPOSED_CAPTURE_DEFAULT=RACK_FIRST_SELECTED_MEANS_STANDING
PROPOSED_STATUS=PENDING_USER_APPROVAL
PROTOTYPE_PATH=prototypes/graphical-entry/index.html
PRODUCTION_APP_CHANGED=false
CURRENT_B1_APK=43aaf3b1b59301cdfd43778e845a12a716435f6bbd364ce5e704df2b22104526
```

User rejected the current B1 entry experience as confusing. An isolated fictional
prototype proposes rack-first capture (selected = standing) and frame-tap
correction. ADR-007 U2 remains the last **accepted** capture default until the
user approves a change. See ADR-007 §2.0 and `prototypes/graphical-entry/README.md`.

## Next prompt (do not execute here)

Collect design feedback on `prototypes/graphical-entry/index.html` (selected =
standing, delivery simplicity, frame-tap correction). Do not implement production
changes until the user accepts, revises, or rejects the proposed rack-first default.




## Graphical entry prototype refinement (2026-09-23)

```ini
WORK_PACKAGE=BOWLING_GRAPHICAL_ENTRY_PROTOTYPE_REFINEMENT
USER_DESIGN_ACCEPTANCE=PENDING
PRIOR_FEEDBACK=CHANGES_REQUESTED
TENTH_FRAME_NOTATION=X_FOR_STRIKES_INCLUDING_FILLS
SPARE_SHORTCUT=CONTEXT_AWARE
AUTOMATIC_NEXT_DELIVERY=true
REMAINING_RACK_CARRIED_FORWARD=true
EXPLICIT_SAVE_PRESERVED=true
PROTOTYPE_PATH=prototypes/graphical-entry/index.html
PRODUCTION_APP_CHANGED=false
PROPOSED_CAPTURE_DEFAULT_STATUS=PENDING_USER_APPROVAL
```

Prototype-only refinements from user design feedback. Does not prove production
scoring or persistence. ADR-007 capture-default change remains pending approval.

## Graphical entry B1 implementation (2026-09-23)

```ini
WORK_PACKAGE=BOWLING_GRAPHICAL_ENTRY_B1_IMPLEMENTATION
RESULT=READY_FOR_REAL_LANE_TRIAL
BASELINE_COMMIT=624f1ccd0c9c3f5b444470c5aace04310dfbc1cc
BASELINE_TREE=38a99b05dd589cdb5823311a8d78403d5e3e779c
WORKING_BRANCH=codex/b1-pin-detail-capture
IMPLEMENTATION_AUTHORIZED=true
COMMIT_AUTHORIZED=false
PUSH_AUTHORIZED=false
TAG_AUTHORIZED=false
PRODUCTION_RELEASE_AUTHORIZED=false
NAS_ACCESSED=false
B2_STARTED=false
FIELD_VALIDATION=PAUSED
AUTOMATED_GATES=PASS_193_OF_193
TYPECHECK=PASS
TYPECHECK_MOBILE=PASS
SERVER_TESTS=SKIPPED_NO_LOCAL_POSTGRES_ECONNREFUSED_55433
PRIOR_APK_SHA256=43aaf3b1b59301cdfd43778e845a12a716435f6bbd364ce5e704df2b22104526
CANDIDATE_APK_SHA256=b7f81c910d889b2f8d4abfa7ca18664616be7109473a6d70a9a052fd10328b4c
SIGNING_FINGERPRINT=51ed3f60
PACKAGE=com.drago1068.bowling
INSTALL=adb_install_-r_Success
EXISTING_USER_DATA_PRESERVED=true
DEVICE=R3CY40E6FVJ
LAUNCH_EVIDENCE=docs/evidence/b1-graphical-launch.png
LAUNCH_UI_XML=docs/evidence/b1-graphical-launch.xml
PBA_HANDICAP=Formula not defined
B1_FORMAL_ACCEPTANCE=false
```

### Implemented (production mobile)

- Sequential rack-first entry (selected = standing); X / G / / immediate save; ✓ for ordinary pin saves
- Tenth-frame X notation and context-aware spare; frame-tap correction with standing via `correctRollWithStanding`
- Home history by date with date-header averages; Week / Month / Year / All time metrics
- Overall, date, and rolling averages; PBA remains display-only undefined
- Count-only pinfall pad when prior pin identities are unknown (no invented identities)

### Gates

- Root `npm test` **193/193 PASS**
- `npm run typecheck` and `typecheck:mobile` **PASS**
- Server tests not run to green here (Postgres `127.0.0.1:55433` refused)

### Device install

- Build: `apps/mobile/android` `assembleRelease` / `export:embed`, debug keystore
- `adb install -r` Success; signature unchanged (`51ed3f60`)
- Cold launch shows Home metrics and prior completed games (Qualifying Games **17**), confirming data preservation

### Not done

- No commit, push, tag, production release, NAS access, or B2 analysis

## B1 final automated gate + acceptance review (2026-09-23 night)

```ini
WORK_PACKAGE=BOWLING_B1_FINAL_AUTOMATED_GATE_AND_ACCEPTANCE_REVIEW
VERDICT=HOLD
BASELINE_COMMIT=624f1ccd0c9c3f5b444470c5aace04310dfbc1cc
BASELINE_TREE=38a99b05dd589cdb5823311a8d78403d5e3e779c
WORKING_BRANCH=codex/b1-pin-detail-capture
WORKING_TREE=DIRTY
DIRTY_PATH_COUNT=152
ROOT_TESTS=193_OF_193_PASS
TYPECHECK=PASS
TYPECHECK_MOBILE=PASS
SERVER_TESTS=41_OF_41_PASS
SERVER_DATABASE=postgresql://bowling:bowling@127.0.0.1:55433/bowling
SERVER_INSTANCE=bowling-pg-test
SERVER_INSTANCE_STOPPED_AFTER=true
VOLUME_PRESERVED=true
NAS_ACCESSED=false
CANDIDATE_APK_SHA256=b7f81c910d889b2f8d4abfa7ca18664616be7109473a6d70a9a052fd10328b4c
BUILD_APK_MATCHES_INSTALLED=true
SIGNING_FINGERPRINT=51ed3f60
REAL_LANE_TRIAL=NOT_RECORDED_AS_PASS
EXISTING_DATA_PRESERVATION=PASS
GRAPHICAL_ENTRY_DEVICE_HOME=PASS_OBSERVED
TENTH_FRAME_AUTOMATED=PASS
HISTORY_DATE_AVERAGES_DEVICE=PASS_OBSERVED
B1_FORMAL_ACCEPTANCE=false
FIELD_VALIDATION=PAUSED
B2_STARTED=false
COMMIT_AUTHORIZED=false
PUSH_AUTHORIZED=false
TAG_AUTHORIZED=false
```

### Gate reconfirmation

| Gate | Result |
| --- | --- |
| Root `npm test` | **193/193 PASS** |
| `npm run typecheck` | **PASS** |
| `npm run typecheck:mobile` | **PASS** |
| `npm run test:server` on `bowling-pg-test` `:55433` | **41/41 PASS** (started, stopped; volume preserved) |
| Clean working tree | **FAIL** (152 dirty paths; expected B1 uncommitted package) |
| Candidate APK provenance | **PASS** — build and installed both `b7f81c910d889b2f8d4abfa7ca18664616be7109473a6d70a9a052fd10328b4c` |

### Acceptance criteria review

| Criterion | Disposition |
| --- | --- |
| Real-lane trial PASS | **HOLD** — not recorded; `FIELD_VALIDATION=PAUSED`; status was awaiting user trial |
| Existing-data preservation | **PASS** — `adb install -r` kept signature `51ed3f60`; Home showed prior dates/scores (Qualifying Games 17) |
| Graphical entry behavior | **PASS (device home + implementation)** — Home range filters/metrics observed; rack-first entry shipped; unaided lane use not separately recorded |
| Tenth-frame scoring | **PASS (automated)** — root ENTRY/tenth legality tests green; no contradictory lane report |
| History / date averages | **PASS (device)** — date headers + Average by Date rows observed on launch dump |

### Verdict

**HOLD** — automated gates and APK provenance are green, but formal B1 PASS requires a recorded real-lane trial PASS and cannot treat an unclean tree as closed publication state. No B2, publish, tag, release, or NAS.

## B1 real-lane trial result recording (2026-09-23)

```ini
WORK_PACKAGE=BOWLING_B1_REAL_LANE_TRIAL_RESULT
RESULT=HOLD
CANDIDATE_APK_SHA256=b7f81c910d889b2f8d4abfa7ca18664616be7109473a6d70a9a052fd10328b4c
INSTALLED_APK_SHA256=b7f81c910d889b2f8d4abfa7ca18664616be7109473a6d70a9a052fd10328b4c
APK_MATCH=true
REBUILD=false
REINSTALL=false
DEVICE=R3CY40E6FVJ
PACKAGE=com.drago1068.bowling
LAST_UPDATE_TIME=2026-09-23_23:02:35
SIGNING_FINGERPRINT=51ed3f60
GRAPHICAL_ENTRY=HOLD
TENTH_FRAME_SCORING=HOLD
HISTORY_DATE_AVERAGES=HOLD
DATA_PRESERVATION=HOLD
BLOCKER=USER_TRIAL_OUTCOME_NOT_PROVIDED
COACHING=false
FIELD_VALIDATION=PAUSED
B1_FORMAL_ACCEPTANCE=false
APPLICATION_CODE_CHANGED=false
COMMITS_CREATED=false
NAS_ACCESSED=false
B2_STARTED=false
```

Installed candidate hash matched; no rebuild/reinstall. This package received **no** actual-user PASS/HOLD/FAIL statements for the four trial criteria. Outcomes are not invented. All four criteria remain **HOLD**.

## B1 sequential entry / Fix default / completion metrics remediation (2026-09-23)

```ini
WORK_PACKAGE=BOWLING_B1_SEQUENTIAL_ENTRY_FIX_COMPLETION_REMEDIATION
RESULT=PASS_FOCUSED_TESTS
GUTTER_FIRST_ADVANCES_BALL2=true
SPARE_LEGAL_AFTER_GUTTER=true
STRIKE_ILLEGAL_ON_BALL2_AFTER_GUTTER=true
FIX_DEFAULTS_TO_FIRST_THROW=true
FIX_BALL_SWITCH_CONTROL=true
STANDING_RESTORED_ON_FIX_SELECT=true
CORRECTION_AUDIT_PRESERVED=true
INCOMPLETE_EXCLUDED_FROM_METRICS=true
WEEKLY_AVERAGE_USES_COMPLETED_ONLY=true
FOCUSED_TESTS=tests/b1.sequential-entry.test.ts;tests/shell.presentation.test.ts
FOCUSED_TEST_RESULT=18_OF_18_PASS
TYPECHECK=PASS
TYPECHECK_MOBILE=PASS
APK_REBUILT=false
B2_STARTED=false
NAS_ACCESSED=false
COMMITS_CREATED=false
```

### Changes

- Strike/spare controls: X only on strike-eligible fresh racks; `/` legal on ball 2 after gutter (full remaining rack).
- Frame Fix opens **1st throw** by default; obvious **1st/2nd/3rd throw** switch restores that throw’s standing.
- Metrics/date/week/rolling/qualifying counts use only `status=complete` with a final total (active/incomplete/repair excluded).
- History continues to label Active vs Complete.

### Verified

- Gutter-first → ball 2 rack of 10 → spare OK, strike not.
- Corrected first throw with standing + correction count.
- Incomplete game excluded from qualifying metrics while completed game counts.

## B1 updated APK device verification (2026-09-24)

```ini
WORK_PACKAGE=BOWLING_B1_UPDATED_APK_DEVICE_VERIFICATION
RESULT=PASS
DEVICE=R3CY40E6FVJ
PACKAGE=com.drago1068.bowling
APK_SHA256=9141fb073c8a5a0a1c6a2659cc29c0cd57136a1e5685a091ac5e99f42ecbdba4
PRIOR_APK_SHA256=b7f81c910d889b2f8d4abfa7ca18664616be7109473a6d70a9a052fd10328b4c
INSTALL=adb_install_-r_Success
SIGNING_FINGERPRINT=51ed3f60
LAST_UPDATE_TIME=2026-09-24_07:59:14
DEVICE_ACCEPTANCE=PASS
DATA_PRESERVED=true
INCOMPLETE_EXCLUDED=true
COMPLETED_INCLUDED=true
GUTTER_ADVANCE_BALL2=PASS
SPARE_LEGAL_X_UNAVAILABLE_AFTER_GUTTER=PASS
FIX_DEFAULTS_FIRST_THROW=PASS
THROW_SWITCH_RESTORES_STANDING=PASS
EXISTING_GAMES_EDITED=false
DATA_CLEARED=false
QUALIFYING_GAMES_BEFORE=21
QUALIFYING_GAMES_AFTER=21
OBSERVATIONS=docs/evidence/b1-verify-observations.txt
RESULTS_JSON=docs/evidence/b1-verify-results.json
CONSOLE=docs/evidence/b1-verify-console.txt
B2_STARTED=false
NAS_ACCESSED=false
COMMITS_CREATED=false
```

### Device checks (dedicated new games only)

1. Gutter first ball saved immediately; advanced to Frame 1 · 2nd ball with full standing rack.
2. After gutter: Slash enabled, X unavailable.
3. Frame Fix opened 1st ball by default with standing 7,10 restored.
4. 1st/2nd throw switch restored correct standing on each selection.
5. Incomplete games labeled Active; Qualifying Games stayed **21** (unchanged).
6. Prior completed games remained Complete and counted in metrics (Qualifying 21 > 0).

## B1 formal acceptance and local commit decision (2026-09-24)

```ini
WORK_PACKAGE=BOWLING_B1_FORMAL_ACCEPTANCE_AND_LOCAL_COMMIT_DECISION
FORMAL_B1_ACCEPTANCE=PASS
COMMIT_AUTHORIZED=true
APK_SHA256=9141fb073c8a5a0a1c6a2659cc29c0cd57136a1e5685a091ac5e99f42ecbdba4
BUILD_APK_MATCHES_INSTALLED=true
DEVICE_ACCEPTANCE=PASS
DATA_PRESERVED=true
GUTTER_SEQUENTIAL_ENTRY=PASS
FIX_THROW_SELECTION=PASS
INCOMPLETE_EXCLUDED=true
COMPLETED_INCLUDED=true
ROOT_TESTS=198_OF_198_PASS
SERVER_TESTS=41_OF_41_PASS
SERVER_DATABASE=postgresql://bowling:bowling@127.0.0.1:15433/bowling
SERVER_INSTANCE=bowling-pg-test-tmp
PORT_55433_BLOCKED=true
TYPECHECK=PASS
TYPECHECK_MOBILE=PASS
EVIDENCE_CONSISTENT=true
PROJECT_STATUS_CONSISTENT=true
WORKING_TREE_DIRTY_BEFORE_COMMIT=true
MERGE_AUTHORIZED=false
PUSH_AUTHORIZED=false
TAG_AUTHORIZED=false
RELEASE_AUTHORIZED=false
NAS_ACCESSED=false
B2_STARTED=false
```

Verified candidate APK hash matches installed package. Device verification package PASS retained. Automated gates reconfirmed (root 198, server 41 on `bowling-pg-test-tmp` because `:55433` bind was forbidden by the OS). Formal B1 acceptance **PASS**; one local commit authorized on `codex/b1-pin-detail-capture` only.

```ini
B1_LOCAL_COMMIT_CREATED=true
B1_ACCEPTED_COMMIT=d8256794eefdf877f3c847b25f204ec38dc3f9b5
B1_ACCEPTED_TREE=0188acfc45befaed9a05cf18a419fc6951bbc0e4
MERGE_PERFORMED=false
PUSH_PERFORMED=false
TAG_PUBLISHED=false
RELEASE_PERFORMED=false
NAS_ACCESSED=false
B2_STARTED=false
```

## B1 status identity correction (2026-09-24)

```ini
WORK_PACKAGE=BOWLING_POST_B1_STATUS_IDENTITY_CORRECTION
FEATURE_BRANCH=codex/b1-pin-detail-capture
ACCEPTED_COMMIT=d8256794eefdf877f3c847b25f204ec38dc3f9b5
ACCEPTED_TREE=0188acfc45befaed9a05cf18a419fc6951bbc0e4
CURRENT_HEAD_ALIGNED=true
CURRENT_TREE_ALIGNED=true
CURRENT_BLOCKERS=NONE
GRAPHICAL_ENTRY_DESIGN_REVIEW_BLOCKER_REMOVED=true
B1_FORMAL_ACCEPTANCE=true
USER_DESIGN_ACCEPTANCE=ACCEPTED
MERGE_AUTHORIZED=false
PUSH_AUTHORIZED=false
TAG_AUTHORIZED=false
RELEASE_AUTHORIZED=false
NAS_ACCESSED=false
B2_STARTED=false
INTEGRATION_BRANCH_TOUCHED=false
```

Corrected `PROJECT_STATUS.md` so `CURRENT_HEAD` / `CURRENT_TREE` match the formally accepted B1 commit/tree, cleared the stale graphical-entry design-review blocker, and preserved formal acceptance and design acceptance. Stop for a fresh read-only integration review.

## B1 local integration and push closeout (2026-09-24)

```ini
WORK_PACKAGE=BOWLING_POST_PUSH_B1_INTEGRATION_STATUS_CLOSEOUT
INTEGRATION_BRANCH=arch/001-domain-sync-foundation
INTEGRATED_REMOTE_COMMIT=d82ed963211cd7a80a774b1b816ab10859026e01
INTEGRATED_REMOTE_TREE=a6cfb602e85dd34164921e8174e2d9fb9d908819
B1_LOCAL_INTEGRATION=PASS
B1_ACCEPTED_COMMIT=d8256794eefdf877f3c847b25f204ec38dc3f9b5
PUSH_PERFORMED=true
FEATURE_BRANCH=codex/b1-pin-detail-capture
FEATURE_BRANCH_TIP=9305a46707fe5c234b0901eda9e46c14114ea571
FEATURE_BRANCH_PUSHED=false
TAG_PUBLISHED=false
RELEASE_PERFORMED=false
DEPLOYMENT_PERFORMED=false
NAS_ACCESSED=false
B2_STARTED=false
```

Recorded post-push integration closeout: `CURRENT_HEAD` / `CURRENT_TREE` aligned to the integrated remote commit `d82ed96`, `PUSH_PERFORMED=true` on the integration branch only, B1 local integration remains PASS, and the feature branch stays unpublished.
