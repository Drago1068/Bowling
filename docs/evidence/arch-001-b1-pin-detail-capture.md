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

## B1 acceptance marker decision (2026-09-24)

```ini
WORK_PACKAGE=BOWLING_RECORD_B1_ACCEPTANCE_MARKER_DECISION_NO_TAG
INTEGRATION_BRANCH=arch/001-domain-sync-foundation
INTEGRATION_HEAD=46cbb54cef63d2e61d1e60ae2399ddccb3384dd5
INTEGRATION_TREE=05cd3511fc199b8bfb926d84f70e871510d3bad3
MARKER_AUTHORIZED=false
B1_ACCEPTANCE_MARKER=NOT_AUTHORIZED
TAG_PUBLISHED=false
B1_FORMAL_ACCEPTANCE=true
B1_LOCAL_INTEGRATION=PASS
B1_INTEGRATED_ON_DEFAULT_BRANCH=true
FEATURE_BRANCH=codex/b1-pin-detail-capture
FEATURE_BRANCH_PUSHED=false
RELEASE_PERFORMED=false
DEPLOYMENT_PERFORMED=false
NAS_ACCESSED=false
B2_STARTED=false
```

Architecture Authority did not authorize an annotated B1 acceptance marker (ADR-007 forbids inventing a new tag/slice number; no B1 tag name was designated). B1 remains formally accepted and integrated on the default branch without a new tag.

## B1 user lane trial outcome recording (2026-09-24, working tree only, no commit)

```ini
WORK_PACKAGE=BOWLING_B1_USER_LANE_TRIAL_OUTCOME_RECORDING
RESULT=USER_REPORTED_PASS_WITH_TWO_BOUNDED_FINDINGS
CANDIDATE_APK_SHA256=9141fb073c8a5a0a1c6a2659cc29c0cd57136a1e5685a091ac5e99f42ecbdba4
INSTALLED_APK_VERIFIED=true
DEVICE=R3CY40E6FVJ
PACKAGE=com.drago1068.bowling
LIVE_BRANCH=arch/001-domain-sync-foundation
LIVE_HEAD_AT_RECORDING=11afbd4d5acb0d83afefc1c58cc8af27b9264527
RACK_FIRST_ENTRY_AT_LANE_SPEED=PASS_USER_REPORTED
TENTH_FRAME_INCL_10_9_1=PASS_USER_REPORTED
HISTORY_DATE_AVERAGES_READABLE=PASS_USER_REPORTED
EXISTING_GAMES_PRESERVED=PASS_USER_REPORTED
APPLICATION_CODE_CHANGED=false
COMMITS_CREATED=false
PUSH_PERFORMED=false
TAG_PUBLISHED=false
NAS_ACCESSED=false
B2_STARTED=false
```

User-reported verbatim outcomes (no inference from automated or agent device checks):
- Rack-first entry at lane speed: Pass
- Tenth-frame, incl. 10,9,1 behavior: Pass
- History / date averages readable: Pass
- Existing games preserved: Pass

### Bounded finding O1 — date-header game count vs played count (user-reported, unverified)

User reports for today's date only two games were played, but the app shows 4 total
games with Games 1 and 2 showing Active and scores populating the 1st frame of each
scoresheet. Recorded as a bounded data-visibility question, not as a contradiction of
the four PASS statements above. Requires a bounded diagnosis (today's date-header list
vs game identities/creation rows/active-vs-complete labeling) before any remediation
is authorized. No code changed here.

### Bounded finding O2 — navigation placement request (user-reported requirement)

User requires application navigation buttons not at the bottom but at the top in a
section frozen during scroll for ease of navigation. Recorded as a bounded usability
requirement for a future remediation package. No code changed here.

Gate fields in `PROJECT_STATUS.md` are intentionally left unchanged in this working
tree (`B1_REAL_LANE_TRIAL=HOLD`, `FIELD_VALIDATION=PAUSED`) pending an explicit
Architecture Authority gate flip. This recording does not close field acceptance,
authorize remediation, authorize B2, tag, release, deploy, or access NAS.

## O1 diagnosis (2026-09-24, authorized, docs only, no code change)

```ini
WORK_PACKAGE=BOWLING_O1_HISTORY_COUNT_DIAGNOSIS
RESULT=DIAGNOSED_AS_DESIGNED_LISTING_WITH_UX_FOLLOW_ON
LIVE_BRANCH=arch/001-domain-sync-foundation
LIVE_HEAD=11afbd4d5acb0d83afefc1c58cc8af27b9264527
DEVICE_OBSERVATION=LOCK_SCREEN_ONLY_NO_APP_STATE_READ
DEVICE=R3CY40E6FVJ
APPLICATION_CODE_CHANGED=false
COMMITS_CREATED=false
```

Mechanism (all read-only inspection at `11afbd4`):

- `src/scoring/session.ts:192-221` `startGame` persists a Game plus 10 Frames
  immediately on tap. `apps/mobile/src/scoringPanel.tsx:132-144` `onNewGame`
  calls it on every Start tap, then opens the new game. Each tap therefore
  creates a durable game even if no ball is ever recorded.
- `src/scoring/session.ts:172-185` maps any non-completed, non-repair sheet to
  `status="active"` — including zero-roll `NOT_STARTED` sheets. Anything left
  incomplete stays listed as Active by design; `computeHomeMetrics` and
  `dateHeaderAverage` (`src/shellPresentation.ts:310-368`) exclude Active rows
  from averages while still listing them in history.
- `src/scoring/session.ts:153-171` numbers games chronologically per local
  `dateKey`; `src/shellPresentation.ts:370-388` groups the Home list by that
  same key. Games 1 and 2 under today are simply the two earliest-created
  games stamped with today's local date — not a global game count.
- Opening an Active game shows its real recorded balls, so a 1st frame with
  scores in Games 1–2 means those games hold real roll facts (at least ball 1),
  consistent with preserved observations, not fabricated scores.

Diagnosis: 4 rows under today with Games 1–2 Active carrying 1st-frame scores
is consistent with 4 Game entities created today — two left incomplete after at
least ball 1 (or created then partially played) plus the two played-through
games. This is the as-designed append-only listing, not evidence of invented
games or a scoring error. Metrics behavior is correct to exclude the Active rows.

What would overturn this: a Home-list readout (game number, status, score per
row under today's header) showing scores on rows with no rolls, duplicate game
identities, or `created_at` values outside today. Device was on the lock screen
at diagnosis time so no app state was read; no taps, installs, force-stops, or
DB access were performed.

Follow-on (requires separate remediation authorization, not done here): confirm-
before-new-game and a resume/discard affordance for Active games, so accidental
Start taps do not accumulate Active rows. Never auto-delete Active games —
that would destroy observations. O2 navigation request remains separate.

### O1 closeout — user Home-list readout received (2026-09-24)

User-reported readout for today's date header, verbatim:

- Game 1: Active, 0 in first ball of first frame, 8:11am timestamp. Fully functional.
- Game 2: Active, first frame score of 8-0, 8:12am timestamp. Fully functional.
- Game 3: Complete, 195, 7:05pm timestamp.
- Game 4: Complete, 300, 7:06pm timestamp.

Assessment: readout confirms the diagnosis. Four Game entities exist under today:
two morning partials (8:11am with ball 1 = 0 pending ball 2; 8:12am with frame 1
8,0 open) correctly listed Active, plus the two played-through evening games
correctly listed Complete with finals 195 and 300. Chronological per-date
numbering, Active-vs-Complete labeling, first-frame scores reflecting real
recorded balls, and exclusion of the Active rows from qualifying metrics are
all as designed. No scores-without-rolls, no duplicate identities, no
out-of-date rows. The user's "only two games played" refers to the two
completed evening games; the morning partials are real entities with real
facts, not invented rows.

O1 is CLOSED as as-designed listing. No data repair indicated. The UX follow-on
(confirm-before-new-game, resume/discard affordance) and O2 frozen-top
navigation remain separately authorized remediation items, not done here.
`PROJECT_STATUS.md` gate fields left unchanged pending explicit Authority flip.
No code changed, no commit, no push, no tag, no release, no NAS, no B2.

## Authority authorizations (2026-09-24, docs only, no implementation yet)

```ini
WORK_PACKAGE=BOWLING_AUTHORITY_FLIP_AND_UX_AUTHORIZATION
B1_REAL_LANE_TRIAL=PASS
B1_REAL_LANE_TRIAL_BLOCKER=NONE
O1_HISTORY_COUNT=CLOSED_AS_DESIGNED
O2_FROZEN_TOP_NAV_REMEDIATION=AUTHORIZED
UX_CONFIRM_NEW_GAME_RESUME_DISCARD_REMEDIATION=AUTHORIZED
UX_REMEDIATION_IMPLEMENTATION=NOT_STARTED
CURRENT_GATE=B1_LANE_TRIAL_PASS_REMEDIATION_AUTHORIZED
NEXT_ACTION=BOUNDED_O2_UX_REMEDIATION_IMPLEMENTATION
APPLICATION_CODE_CHANGED=false
COMMITS_CREATED=false
PUSH_PERFORMED=false
TAG_PUBLISHED=false
NAS_ACCESSED=false
B2_STARTED=false
```

Bounded scope for the authorized remediation package (not implemented here):

- O2: move application navigation from the bottom to a frozen top section that
  stays visible while scrolling. Presentation only; no scoring, persistence,
  sync, or analysis changes.
- UX: confirm-before-new-game (a Start tap must not silently persist another
  Active game) plus a resume/discard affordance for Active games. Discard must
  be explicit per game; never auto-delete observations; append-only correction
  audit preserved.
- Out of scope: scoring/validation changes, schema/sync changes, B2/B3
  analysis, tags, releases, deployment, NAS.

`FIELD_VALIDATION` remains `PAUSED` in status pending the remediation
implementation and its device verification; only the B1 lane-trial gate was
flipped to PASS on the user's recorded outcome.

## O2/UX remediation implementation (2026-09-24, uncommitted, device verified)

```ini
WORK_PACKAGE=BOWLING_O2_UX_REMEDIATION_IMPLEMENTATION
RESULT=READY_FOR_ACCEPTANCE_REVIEW
BASELINE_HEAD=11afbd4d5acb0d83afefc1c58cc8af27b9264527
BRANCH=arch/001-domain-sync-foundation
ROOT_TESTS=205_OF_205_PASS
TYPECHECK=PASS
TYPECHECK_MOBILE=PASS
SERVER_TESTS=SKIPPED_NO_LOCAL_POSTGRES_ECONNREFUSED_55433
CANDIDATE_APK_SHA256=BB4A1D11FB4C6205F740830542923EF983F2EEBAF32FB6345A0D99ED2F22513C
PRIOR_APK_SHA256=9141fb073c8a5a0a1c6a2659cc29c0cd57136a1e5685a091ac5e99f42ecbdba4
INSTALL=adb_install_-r_Success
SIGNING_UNCHANGED=true
FIRST_INSTALL_TIME_PRESERVED=2026-09-07_12:13:15
DATA_PRESERVED=true
QUALIFYING_GAMES_BEFORE=23
QUALIFYING_GAMES_AFTER=23
DEVICE=R3CY40E6FVJ
DEVICE_ACCEPTANCE=PASS_AGENT_OPERATED
EXISTING_GAMES_EDITED=false
GAMES_CREATED_BY_VERIFICATION=false
GAMES_DISCARDED_BY_VERIFICATION=false
OBSERVATIONS=docs/evidence/o2-ux-device-observations.txt
COMMIT_AUTHORIZED=false
PUSH_AUTHORIZED=false
TAG_AUTHORIZED=false
B2_STARTED=false
NAS_ACCESSED=false
```

### Changed (presentation + UX affordances only)

- `apps/mobile/App.tsx`: frozen nav bar rendered above the outer ScrollView
  from a panel-published snapshot (`TopNavModel`), refreshed only when visible
  primitives change (`topNavSnapshotEqual` guard — no render loop).
- `apps/mobile/src/scoringPanel.tsx`: `TopNavBar` (Home / Previous-games
  toggle / Done / Start, plus inline new-game confirm); bottom `actionColumn`
  removed; Start always requires explicit Confirm; Active zero-roll rows offer
  two-tap Discard; games with rolls show resume-only with an explanatory hint.
  Frozen-bar callbacks read through a live-state ref so a host-kept snapshot
  never acts on stale rendered state (defect found on first build by the
  active-count notice reading 0, fixed, rebuilt, re-verified with 44 actives).
- `src/shellPresentation.ts`: `topNavActions`, `historyToggleLabel`,
  `discardableGame` (unknown counts fail closed), `newGameConfirmNotice`;
  `HomeHistoryGame.rollCount?` additive optional.
- `src/scoring/session.ts`: derived `GameHistoryDetail.rollCount`;
  `discardEmptyGame` — atomic soft-delete of Game + frames via the existing
  `applyLocalMutations`/`DELETE` path; refuses any game with roll facts,
  unknown ids, and mid-transaction failures without partial writes.
- `tests/o2.ux-remediation.test.ts`: 7 new gates (nav ordering, labels,
  confirm copy, discardable matrix, discard atomics, refusal preservation,
  unknown-id safety).

### Not changed

Scoring, validation, rack rules, persistence schema, sync contracts, analysis,
dependencies. No migration. Server suite untouched (no Postgres locally; all
41 fail at connect in setup, unrelated to this diff).

## Visual polish + Save + Advanced placement follow-on (2026-09-24, uncommitted, device verified)

```ini
WORK_PACKAGE=BOWLING_POLISH_SAVE_ADVANCED_FOLLOW_ON
RESULT=READY_FOR_USER_EYES_REVIEW
ROOT_TESTS=206_OF_206_PASS
TYPECHECK=PASS
TYPECHECK_MOBILE=PASS
SERVER_TESTS=SKIPPED_NO_LOCAL_POSTGRES_ECONNREFUSED_55433
CANDIDATE_APK_SHA256=1B6E8AC9FB5185E20F8181E9AB32D8EC50BB45831EBCD58417C8A3D2F22513C
PRIOR_APK_SHA256=BB4A1D11FB4C6205F740830542923EF983F2EEBAF32FB6345A0D99ED2F22513C
INSTALL=adb_install_-r_Success
FIRST_INSTALL_TIME_PRESERVED=2026-09-07_12:13:15
DATA_PRESERVED=true
DEVICE=R3CY40E6FVJ
DEVICE_ACCEPTANCE=PASS_AGENT_OPERATED_WITH_TWO_USER_EYES_ITEMS_PENDING
OBSERVATIONS=docs/evidence/o3-polish-device-observations.txt
USER_BOWLED_DURING_WINDOW=true
QUALIFYING_23_TO_25_FROM_USER_PLAY=true
COMMIT_AUTHORIZED=false
PUSH_AUTHORIZED=false
B2_STARTED=false
NAS_ACCESSED=false
```

### Changed (presentation only)

- Frozen bar: white card with green border, compact 13px labels, extra top
  separation (`frozenNav` paddingTop 16) so it reads — and taps — as app
  chrome, not phone status UI. Touch-zone defect (bar-center taps swallowed
  near the status area) found during verification and fixed in this build.
- `AppHeader`: dark-green band, white title, gold pin-dot motif on Home and
  game screens.
- Completed-game "Save game": refreshes the finished view, reports the final,
  stays in the game. Zero canonical/outbox writes by design — every ball
  already persists at entry; `completedSaveNotice` helper tested.
- Advanced harness: rendered only on Home (bottom, still collapsed by
  default); hidden during game entry. Loading/failure states still expose it
  (no snapshot yet → shown), so recovery controls stay reachable.
- `TopNavModel.homeOpen` added so the host can place Advanced.

### Verified on device / pending your eyes

- Verified: bar pinned while scrolled, toggle + Home from bar, Save flow on a
  completed 203 (notice, final unchanged, stayed), Advanced present on Home /
  absent in game view, discard affordance only on the empty row, data intact.
- Pending your eyes (stopped touching the phone when you picked it up):
  the new look itself, and center-tap feel on the raised bar.

## Polish round 2 — strip, chips, Save banner, dark lane theme (2026-09-24, uncommitted, device verified where possible)

```ini
WORK_PACKAGE=BOWLING_POLISH_ROUND2_STRIP_CHIPS_SAVE_DARK
RESULT=READY_FOR_USER_EYES_REVIEW
ROOT_TESTS=206_OF_206_PASS
TYPECHECK=PASS
TYPECHECK_MOBILE=PASS
SERVER_TESTS=SKIPPED_NO_LOCAL_POSTGRES_ECONNREFUSED_55433
CANDIDATE_APK_SHA256=DDCDAE1A37A36D77BE0F15A2BB0ED36AE33D1A54F34C36CFBF3759C9593EE92F
PRIOR_APK_SHA256=1B6E8AC9FB5185E20F8181E9AB32D8EC50BB45831EBCD58417C8A3D2F80EC1CD
INSTALL=adb_install_-r_Success
FIRST_INSTALL_TIME_PRESERVED=2026-09-07_12:13:15
DATA_PRESERVED=true
DEVICE=R3CY40E6FVJ
DEVICE_ACCEPTANCE=PASS_AGENT_OPERATED_WITH_USER_EYES_ITEMS_PENDING
GAMES_CREATED_BY_VERIFICATION=false
GAMES_EDITED_BY_VERIFICATION=false
GAMES_DISCARDED_BY_VERIFICATION=false
OBSERVATIONS=docs/evidence/o5-polish2-device-observations.txt
COMMIT_AUTHORIZED=false
PUSH_AUTHORIZED=false
B2_STARTED=false
NAS_ACCESSED=false
```

### Changed (presentation only)

- Header band + pin dots removed per user vote; plain title back.
- Nav buttons are compact natural-width chips per user vote; confirm-box
  buttons match.
- Confirm copy no longer renders twice (frozen bar owns it while confirming).
- Save: persistent `Saved ✓ · Final N · time` banner until navigation
  (`completedSaveBanner` helper tested); still zero writes by design.
- Dark lane theme on the entry screen only: navy scorecard strip with gold
  totals, dark numbered pin circles, standing pin white with red stripe,
  dark X/G/✓// + count pad. History/metrics untouched.
- Foul/Miss aliases deliberately not added: Gutter already records pinfall 0.

### Pending user eyes

White/red standing-pin visual, raised-bar tap feel, and the overall look —
device touching stopped when the phone went to the user's messaging app.
## Dedicated Advanced screen (2026-09-24, uncommitted, device verified)

```ini
WORK_PACKAGE=BOWLING_ADVANCED_DEDICATED_SCREEN
RESULT=READY_FOR_USER_EYES_REVIEW
ROOT_TESTS=212_OF_212_PASS
TYPECHECK=PASS
TYPECHECK_MOBILE=PASS
SERVER_TESTS=SKIPPED_NO_LOCAL_POSTGRES_ECONNREFUSED_55433
CANDIDATE_APK_SHA256=DD98F698BAD3A18F91CC7711D6A4D52BE3F8C7FC2AB9AA37221C040B6562B540
PRIOR_APK_SHA256=F21D0F375F3FAA66AFF8C51C74828B7FDDBF33524FEB22C9FD1B1460FDCABCEC
INSTALL=adb_install_-r_Success
FIRST_INSTALL_TIME_PRESERVED=2026-09-07_12:13:15
DATA_PRESERVED=true
DEVICE=R3CY40E6FVJ
DEVICE_ACCEPTANCE=PASS_AGENT_OPERATED
GAMES_CREATED_BY_VERIFICATION=false
OBSERVATIONS=docs/evidence/o9-advanced-device-observations.txt
COMMIT_AUTHORIZED=false
PUSH_AUTHORIZED=false
B2_STARTED=false
NAS_ACCESSED=false
```

### Changed (presentation only)

- Landing Advanced chip navigates to a dedicated Advanced screen; the
  App-level harness JSX is deleted (Row/Button/dead disclosure removed).
- Diagnostics render from a one-way host snapshot (`AdvancedModel`); all
  recovery actions preserved. Loading states keep a fallback message.
- `AppScreen` gains `advanced` (frozen bar offers Home back).

## Home landing redesign (2026-09-24, uncommitted, device verified)

```ini
WORK_PACKAGE=BOWLING_HOME_LANDING_REDESIGN
RESULT=READY_FOR_USER_EYES_REVIEW
ROOT_TESTS=207_OF_207_PASS
TYPECHECK=PASS
TYPECHECK_MOBILE=PASS
SERVER_TESTS=SKIPPED_NO_LOCAL_POSTGRES_ECONNREFUSED_55433
CANDIDATE_APK_SHA256=F21D0F375F3FAA66AFF8C51C74828B7FDDBF33524FEB22C9FD1B1460FDCABCEC
PRIOR_APK_SHA256=0CFE45ABB735A593FB87100C68D03706EF8CAB9C3A2AD70014D631F97DB6C83A
INSTALL=adb_install_-r_Success
FIRST_INSTALL_TIME_PRESERVED=2026-09-07_12:13:15
DATA_PRESERVED=true
DEVICE=R3CY40E6FVJ
DEVICE_ACCEPTANCE=PASS_AGENT_OPERATED
GAMES_CREATED_BY_VERIFICATION=false
OBSERVATIONS=docs/evidence/o7-landing-device-observations.txt
COMMIT_AUTHORIZED=false
PUSH_AUTHORIZED=false
B2_STARTED=false
NAS_ACCESSED=false
```

### Changed (presentation only)

- Home is a landing screen: navy hero (title, tagline, live overall +
  qualifying chip), full-width New Game, History/Analysis/Advanced chips.
- History and Analysis are own screens (frozen bar offers Home back).
  Analysis is honest: B2/B3 pending copy plus qualifying + overall average
  only — no Strike %/Spare %/leaves claimed.
- Advanced chip expands the harness below; the duplicate App disclosure
  hides on landing until opened. Game entry still never shows Advanced.
- `topNavActions` now takes `screen` (landing/history/analysis/game);
  `analysisAvailableSummary` + `ANALYSIS_PENDING_COPY` helpers tested.

## Polish round 3 — fit-to-screen + title removal (2026-09-24, uncommitted, device verified)

```ini
WORK_PACKAGE=BOWLING_POLISH_ROUND3_FIT_TITLE
RESULT=READY_FOR_USER_EYES_REVIEW
ROOT_TESTS=206_OF_206_PASS
TYPECHECK=PASS
TYPECHECK_MOBILE=PASS
SERVER_TESTS=SKIPPED_NO_LOCAL_POSTGRES_ECONNREFUSED_55433
CANDIDATE_APK_SHA256=0CFE45ABB735A593FB87100C68D03706EF8CAB9C3A2AD70014D631F97DB6C83A
PRIOR_APK_SHA256=DDCDAE1A37A36D77BE0F15A2BB0ED36AE33D1A54F34C36CFBF3759C9593EE92F
INSTALL=adb_install_-r_Success
FIRST_INSTALL_TIME_PRESERVED=2026-09-07_12:13:15
DATA_PRESERVED=true
DEVICE=R3CY40E6FVJ
DEVICE_ACCEPTANCE=PASS_AGENT_OPERATED
GAMES_CREATED_BY_VERIFICATION=false
OBSERVATIONS=docs/evidence/o6-fit-device-observations.txt
COMMIT_AUTHORIZED=false
PUSH_AUTHORIZED=false
B2_STARTED=false
NAS_ACCESSED=false
```

### Changed (presentation only)

- Game scoring screen drops the "Bowling" title (Home keeps it).
- Pins 44→36px with tighter rack/card gaps and shorter entry buttons; the
  full entry screen now fits one viewport with no scroll (screenshot
  verified: frame strip + rack + X/G/✓// + Fix a ball all visible).

## Lane commentary quips (2026-09-24, implemented, unit-tested, uncommitted)

```ini
WORK_PACKAGE=BOWLING_LANE_COMMENTARY_QUIPS
RESULT=READY_FOR_USER_EYES_REVIEW
ROOT_TESTS=212_OF_212_PASS_WITH_6_NEW_QUIP_GATES
TYPECHECK=PASS
TYPECHECK_MOBILE=PASS
ON_DEVICE_QUIP_FIRING=NOT_VERIFIED_NO_BALLS_RECORDED_ON_DEVICE
COMMIT_AUTHORIZED=false
PUSH_AUTHORIZED=false
B2_STARTED=false
NAS_ACCESSED=false
```

### Changed (presentation copy only; no scoring changes)

- `strikeQuip` (strike → Double → Turkey → runaway count), `leaveQuip`
  (single pin → "You forgot one."; famous splits incl. 7-10 → "Nice split."),
  `strikeStreakCount`, `ballSaveQuip` (priority: strike, spare, leave,
  gutter), `gameCompleteQuip` (tiers incl. 300 "Perfect game! Legendary.").
- Wired into fresh-save paths only (`saveDelivery`, count-only save) — Fix
  corrections never quip. Split/single detection uses recorded standing
  detail only; unknown detail yields nothing (never invented).
- Completed games show the tier quip under the final.
- One test fixture corrected during development (spare + leftover pin cannot
  coexist; implementation priority was already correct).

## SVG artwork — hero illustration + rack pins (2026-09-24, uncommitted, device verified)

```ini
WORK_PACKAGE=BOWLING_SVG_ARTWORK
DEPENDENCY_ADDED=react-native-svg
DEPENDENCY_APPROVAL=USER_APPROVED_SVG_LIBRARY
BUNDLE_MODULES=672_TO_785
ROOT_TESTS=212_OF_212_PASS
TYPECHECK=PASS
TYPECHECK_MOBILE=PASS
CANDIDATE_APK_SHA256=C4EDE88AE0C9AACAB783D5541C66AC9DD9BEF6906D8B3DFE0E3DA73FFEB92A57
DEVICE=R3CY40E6FVJ
DEVICE_ACCEPTANCE=PASS_AGENT_OPERATED_SCREENSHOTS
COMMIT_AUTHORIZED=false
PUSH_AUTHORIZED=false
B2_STARTED=false
NAS_ACCESSED=false
```

### Changed (presentation only)

- `apps/mobile/src/artwork.tsx` (new): hand-authored vector art, no network
  assets, no copyright exposure. `HeroArtSvg` (gradient ball, striped pins,
  speed streaks, lane line, sparkles); `RackPinSvg` (standing = white pin
  with red stripes + number; down = dark numbered circle, Lanetalk language).
- Rack Pressables render SVG with aligned bottoms; old View-circle pin
  components and styles removed.
- Hero pin clipping found on first screenshot (pins past viewBox edge) and
  fixed by compressing the fan.
- Answers "what is required to elevate graphics": vector illustration needs
  a renderer (this dependency); further elevation paths are custom fonts,
  more illustration time, or user-supplied raster art. Photo-grade 3D art is
  out of reach in code.

## Layout fill + Advanced-screen tail (2026-09-24, uncommitted, partial device verification)

```ini
WORK_PACKAGE=BOWLING_LAYOUT_FILL_TAIL
CANDIDATE_APK_SHA256=DF68DCC35F316711A558D180F3B7C4356ADCD38B7A03EF0FF3633B5B405B0C3E
ROOT_TESTS=212_OF_212_PASS
TYPECHECK=PASS
TYPECHECK_MOBILE=PASS
DEVICE_TAIL_VERIFICATION=BLOCKED_SECURE_LOCK
COMMIT_AUTHORIZED=false
PUSH_AUTHORIZED=false
B2_STARTED=false
NAS_ACCESSED=false
```

### Changed (presentation only)

- Root cause of the home gap: outer ScrollView content carried
  `paddingBottom: 96` of dead space. Reduced to 28.
- Removed the phantom empty frozen-nav wrapper on landing.
- Guarded `onLayout`-adaptive landing min-height (converges; no loops).
- Device tail verification blocked when the phone fell back to secure lock;
  no taps attempted while locked. Installed + hash-verified only.
- OBSERVATIONS=docs/evidence/o10-layout-device-observations.txt
