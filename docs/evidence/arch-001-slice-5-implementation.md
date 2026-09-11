# ARCH-001 Slice 5 implementation evidence and formal closure

This record is implementation, test, and formal-closure evidence for
`ARCH-001_SLICE_5_OFFLINE_GAME_HISTORY_AND_RESUME`. Historical Slice 3 HOLD,
Slice 4 HOLD/closure, the Slice 5 debug-artifact HOLD, and their later
dispositions are preserved and not rewritten as earlier PASS. Integration to
the default branch is pending. The local `assembleRelease` APK is an
acceptance artifact, not a production store release.

```ini
WORK_PACKAGE=BOWLING_SLICE_5_BOUNDED_IMPLEMENTATION
WORKING_BRANCH=codex/arch-001-slice-5-history-resume
PARENT_HEAD=9a789b8ccd9b7067e84e161d8bcd8b1fd954dca4
PARENT_TREE=ef614520350cc34b053fb50e7389ed4549472f02
ACCEPTANCE_TAG=v0.4.0-arch001-slice4
COMMITS_CREATED=false
IMPLEMENTATION_AUTHORIZED=true
COMMIT_AUTHORIZED=false
MERGE_AUTHORIZED=false
```

## Starting baseline

Verified before implementation:

```ini
REMOTE_ORIGIN=https://github.com/Drago1068/Bowling.git
INTEGRATION_BRANCH=arch/001-domain-sync-foundation
COMMIT=9a789b8ccd9b7067e84e161d8bcd8b1fd954dca4
TREE=ef614520350cc34b053fb50e7389ed4549472f02
TAG=v0.4.0-arch001-slice4
TAG_TYPE=annotated
PEELED_TARGET=9a789b8ccd9b7067e84e161d8bcd8b1fd954dca4
```

Expected uncommitted documentation was preserved and carried onto
`codex/arch-001-slice-5-history-resume`:

- `docs/adr/ADR-004-offline-game-history-and-resume.md`
- `PROJECT_STATUS.md`
- `README.md`

## Changed files (uncommitted)

- `docs/adr/ADR-004-offline-game-history-and-resume.md` (requirements, carried)
- `PROJECT_STATUS.md`
- `README.md`
- `src/scoring/session.ts`
- `src/scoring/index.ts`
- `apps/mobile/src/scoringPanel.tsx`
- `apps/mobile/App.tsx`
- `tests/scoring.history.test.ts`
- `docs/evidence/arch-001-slice-5-implementation.md` (this file)

No migrations, lockfiles, or dependency manifests were changed.

## Implementation notes

- Newest-first listing: `created_at` descending, then Game `id` lexicographic
  descending.
- `listGameHistory` adds local creation date/time labels; identical displayed
  timestamps receive a short ID suffix. Labels are not persisted.
- `loadScoringView(db, gameId)` returns `gameMissing=true` when that Game
  entity is absent; it does not substitute the newest game.
- `loadScoringView(db, null)` is the restart default (newest persisted game, or
  empty history).
- Mobile shell keeps in-session selection in React state. Process-restart
  simulation remounts the scoring panel (`processGeneration`) so the newest
  game is opened. Diagnostic controls are unchanged.
- Listing and opening are read-only against canonical entities and the outbox.

## Automated acceptance

Tested source identity: working tree on
`codex/arch-001-slice-5-history-resume` (parent `9a789b8`, uncommitted Slice 5
changes). Commands run after the implementation edits.

```ini
ROOT_TESTS=150/150_PASS
COMMAND=npm test
SERVER_TESTS=39/39_PASS
SERVER_COMMAND=DATABASE_URL=postgresql://bowling:bowling@127.0.0.1:15433/bowling npm run test:server
TYPECHECK=PASS
TYPECHECK_COMMAND=npm run typecheck
MOBILE_TYPECHECK=PASS
COMMAND_MOBILE_TYPECHECK=npm run typecheck:mobile
SLICE_4_GOLDENS=UNCHANGED_300_150_0_80_169
P1_REPAIR_VECTORS=UNCHANGED
AUTOMATED_ACCEPTANCE=PASS
```

Postgres used only the existing stopped container `bowling-pg-test-tmp`
(image `sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94`,
volume `bowling-pg-test-tmp-data`, bind `127.0.0.1:15433`). Process-only
`DATABASE_URL` override. Container stopped afterward; volume preserved. Original
`bowling-pg-test` / port `55433` was not used.

## Candidate identity for device testing

Source bytes hashed immediately before/during this device package. They match
the files used for the recorded automated gates (no application-code edits
in this package).

```ini
SRC_SCORING_SESSION_SHA256=70395776d9d5d8928e3d6c9dd958d511eae0813a04e45a1c04857fc510a00b8a
SRC_SCORING_INDEX_SHA256=b4cf73fb53fb34f7d42d6eb50fbbbda8b8189e818a5d4c171402a47c9c2ce4de
SCORING_PANEL_SHA256=a65eb9505fb9ff0a5f0ef965d5720516c2458ab9446d8178888a525b75000e9a
APP_TSX_SHA256=03e89f8d549dd1ccea5f23536f1b66a3925b9b91a8c577e21881175cecf5fab7
HISTORY_TEST_SHA256=682bb56d2e057d6c5375eacf1adab5d363ccb2cb2109cf1899632399315c65f5
```

Native debug APK is the established Gradle `assembleDebug` output. Debug
variants skip embedding JS; Slice 5 JS was served by Metro from this working
tree.

```ini
APK_PATH=apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
APK_SHA256=b6d38fcdad2e3c05ea3844a35d0c59b4f806a849f6493a74f1bfe5f7bd9e4fb8
APK_NATIVE_BYTES=UNCHANGED_VS_SLICE_4_DEBUG_SHELL
JS_PROVENANCE=METRO_CURRENT_CANDIDATE
ANDROID_PACKAGE=com.drago1068.bowling
BUILD_TYPE=debug
PRODUCTION_RELEASE_ARTIFACT=false
```

## Physical-device acceptance (this completion package)

```ini
DEVICE_MODEL=Samsung SM-S936U
ANDROID_VERSION=16
DEVICE_SERIAL=R3CY40E6FVJ
ADB_STATE=device
AIRPLANE_MODE=1
INSTALL=adb install -r
FIRST_INSTALL_TIME=2026-09-07 12:13:15
LAST_UPDATE_TIME=2026-09-10 07:30:50
EXISTING_DEVICE_DATA_PRESERVED=true
UNINSTALL=false
CLEAR_DATA=false
PACKAGE_IDENTITY_CHANGED=false
PHYSICAL_DEVICE_ACCEPTANCE=HOLD
OFFLINE_ACCEPTANCE=PASS_FOR_OBSERVED_FLOWS
```

Sep 7–8 history labels remained listed. New Slice 5 acceptance games were
created rather than editing those rows.

Observed on-device (offline, airplane mode):

```ini
TWO_GAMES_LABELED=PASS
SWITCH_BY_LABEL=PASS
RESUME_INCOMPLETE=PASS
CORRECT_PRIOR=PASS
NEW_GAME_PRESERVES_OLDER=PASS
IN_SESSION_SELECTION_AFTER_MUTATION=PASS
IN_SESSION_SELECTION_AFTER_RECOVER=PASS
FORCE_STOP_RELAUNCH_NEWEST=NOT_CONFIRMED
CONTROLS_USABLE=PASS
```

Acceptance games (do not delete):

- `01a08d84-3f1b-7a0d-89c7-9d0b2cf1d0ab` label `9/10/2026, 6:50:49 PM` —
  incomplete then resumed to `F1 1,2` open.
- `01a08d85-197f-72e7-b974-3cff5f3e691e` label `9/10/2026, 6:51:45 PM` —
  `F1 9` then corrected to `F1 8` (1 correction).
- `01a08e15-8d35-7911-a7de-e4af60e04631` label `9/10/2026, 9:29:32 PM` —
  new empty `NOT_STARTED`; older S5 games still listed.

After `am force-stop` + relaunch, the debug shell presented
`loadJSBundleFromAssets` then a blank RN surface. Metro USB reverse and Dev
Menu Reload/`localhost:8081` did not restore a dumpable scoring UI in this
session. Newest-after-restart was therefore **not** visually confirmed.
Automated restart-default tests remain PASS.

## Findings

```ini
OPEN_FINDINGS=FORCE_STOP_RELAUNCH_JS_NOT_RESTORED;INCIDENTAL_SYSTEM_UI_MISTAP
P0=0
P1=0
```

A correction-pad tap at the bottom of the screen opened a system phone UI.
That was stopped; it is not a scoring defect. Subsequent correction of S5-B
to pinfall 8 was observed in Bowling.

## Offline restart diagnosis

```ini
WORK_PACKAGE=BOWLING_SLICE_5_OFFLINE_RESTART_DIAGNOSIS
RESULT=DIAGNOSED
FAILURE_CLASSIFICATION=DEBUG_ARTIFACT_REQUIRES_METRO
METRO_DEPENDENCY=true
APPLICATION_DATA_PRESERVED=true
PHYSICAL_DEVICE_ACCEPTANCE=HOLD
FORMAL_ACCEPTANCE=false
```

Candidate hashes and APK SHA-256 were re-verified unchanged versus the device
package. Installed package remains `com.drago1068.bowling` DEBUGGABLE,
`firstInstallTime=2026-09-07 12:13:15`, `lastUpdateTime=2026-09-10 07:30:50`.

The debug APK contains no `index.android.bundle` (assets: `app.config` only).
React Native’s default `debug` `debuggableVariants` skip `export:embed`.
`MainApplication` uses `ExpoReactHostFactory` / `loadReactNative` with no
custom embedded-bundle override.

### Reproduction A — Metro unreachable (airplane=1, USB reverse 8081 removed)

- `am start -W -n com.drago1068.bowling/.MainActivity` → `LaunchState=COLD`,
  `Status=ok`, process stayed up (`pid` observed).
- `ReactHost.isMetroRunning(): Async result = false`
- `Unable to load script` / `loadJSBundleFromAssets` / need Metro **or**
  package `index.android.bundle` for release.
- No domain/SQLite crash in Bowling logs. Blank / redbox is **JS not loaded**,
  not a failed game-list query.

### Reproduction B — Metro reachable (diagnostic only; not offline acceptance)

- USB reverse `tcp:8081` restored; host Metro already listening.
- `isMetroRunning(): Async result = true`
- `ReactNativeJS: Running "main"`
- Scoring UI restored. Opened game
  `01a08e15-8d35-7911-a7de-e4af60e04631` (newest S5 acceptance game).
  Device id and SQLite file `files/SQLite/bowling-arch001.db` plus WAL
  remained. This **does not** satisfy ADR-004 offline cold-start.

SQLite: `files/SQLite/bowling-arch001.db` present (WAL updated 2026-09-10
21:29). Device has no `sqlite3` binary; contents were not exported.

### Smallest proposed remedy (not executed)

Existing Gradle already sets `bundleCommand = "export:embed"` and a
`release` buildType with the **same** `applicationId` and **same**
`signingConfigs.debug` as the installed debug APK. `assembleRelease` is
therefore the smallest artifact path that embeds JS without changing
package identity or signing, so `adb install -r` can stay data-preserving.

Do **not** treat that APK as a production store release. Do **not** mark
offline restart PASS until force-stop/relaunch **without Metro** shows the
newest persisted game.

```ini
SMALLEST_PROPOSED_REMEDY=ASSEMBLE_RELEASE_EMBEDDED_JS_DATA_PRESERVING_INSTALL_OFFLINE_FORCE_STOP_RETEST
BUILD_OR_CODE_CHANGES_REQUIRED=false_FOR_EXISTING_RELEASE_TASK
REQUIRED_RETEST=OFFLINE_FORCE_STOP_RELAUNCH_WITHOUT_METRO
```

The diagnosis HOLD above is historical. It is not rewritten as an earlier PASS.
The authorized retest used that existing assembleRelease path; results follow.

## Self-contained acceptance APK and offline retest

```ini
WORK_PACKAGE=BOWLING_SLICE_5_SELF_CONTAINED_DEVICE_ACCEPTANCE
RESULT=READY_FOR_ACCEPTANCE_REVIEW
CANDIDATE_HEAD=9a789b8ccd9b7067e84e161d8bcd8b1fd954dca4
WORKING_BRANCH=codex/arch-001-slice-5-history-resume
APPLICATION_CODE_CHANGED=false
BUILD_CONFIGURATION_CHANGED=false
COMMITS_CREATED=false
PRODUCTION_RELEASE_PERFORMED=false
FORMAL_ACCEPTANCE=false
```

Candidate hashes re-verified before build and after device work (unchanged):

```ini
SRC_SCORING_SESSION_SHA256=70395776d9d5d8928e3d6c9dd958d511eae0813a04e45a1c04857fc510a00b8a
SRC_SCORING_INDEX_SHA256=b4cf73fb53fb34f7d42d6eb50fbbbda8b8189e818a5d4c171402a47c9c2ce4de
SCORING_PANEL_SHA256=a65eb9505fb9ff0a5f0ef965d5720516c2458ab9446d8178888a525b75000e9a
APP_TSX_SHA256=03e89f8d549dd1ccea5f23536f1b66a3925b9b91a8c577e21881175cecf5fab7
HISTORY_TEST_SHA256=682bb56d2e057d6c5375eacf1adab5d363ccb2cb2109cf1899632399315c65f5
```

Build used the existing Android `assembleRelease` / `export:embed` path with
`ANDROID_HOME` only (no `local.properties`, no Gradle/signing/minify edits).
`createBundleReleaseJsAndAssets` wrote a nonempty bundle. `BUILD SUCCESSFUL`
in 13m 2s.

```ini
APK_PATH=apps/mobile/android/app/build/outputs/apk/release/app-release.apk
APK_SHA256=0038f8f8a543ce95c77d08b43b0ffd57ef63abcde6eb87b42e4b571778e2bca7
EMBEDDED_JS=assets/index.android.bundle
EMBEDDED_JS_BYTES=1348288
EMBEDDED_JS_VERIFIED=true
BUNDLE_CONTAINS=listGameHistory,loadScoringView,Game history
ANDROID_PACKAGE=com.drago1068.bowling
VERSION_NAME=0.1.0
VERSION_CODE=1
LAUNCHER=com.drago1068.bowling/.MainActivity
SIGNING_CERT_SHA256=fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c
SIGNING_CERTIFICATE_MATCH=true
PACKAGE_IDENTITY_MATCH=true
MINIFY_ENABLED=false
DEBUGGABLE_AFTER_UPDATE=false
PRODUCTION_STORE_RELEASE=false
```

Installed-app certificate SHA-256 matched the APK (Android Debug DN; private
keystore material not recorded). Same `applicationId` and version as the
installed Bowling app, so `adb install -r` was a data-preserving update.

Pre-update displayed newest game (confirmed on device, not assumed from an
older timestamp): `01a08e15-8d35-7911-a7de-e4af60e04631` empty `NOT_STARTED`.
Also present: `01a08d84` (`F1 1,2` open), `01a08d85` (`F1 8`, 1 correction),
and Sep 7–8 user-history labels.

```ini
INSTALL=adb install -r
INSTALL_RESULT=Success
FIRST_INSTALL_TIME=2026-09-07 12:13:15
LAST_UPDATE_TIME=2026-09-11 18:35:16
DATA_PRESERVING_UPDATE=true
EXISTING_DEVICE_DATA_PRESERVED=true
UNINSTALL=false
CLEAR_DATA=false
```

Offline / Metro conditions during retest:

```ini
DEVICE_SERIAL=R3CY40E6FVJ
AIRPLANE_MODE=1
WIFI=disabled
CELLULAR=POWER_OFF
ACTIVE_DEFAULT_NETWORK=none
ADB_REVERSE_8081=removed
ADB_REVERSE_PRESERVED=tcp:8091;tcp:8000->8011
METRO_UNAVAILABLE_DURING_RETEST=true
DEVICE_OFFLINE_VERIFIED=true
```

`am force-stop` then `am start -W -n com.drago1068.bowling/.MainActivity`
`LaunchState=COLD` `Status=ok`. Log: `ReactNativeJS: Running "main"` (no
`Unable to load script`). Usable scoring/history UI. Device id unchanged
`01a07ca8-69ef-762f-a1fc-a1088756e76a`. Diagnostic pending outbox was `563`
immediately after install (same as pre-update snapshot) and `575` after the
correction plus new-game writes and a later cold start.

```ini
OFFLINE_COLD_START=PASS
NEWEST_AFTER_INSTALL=01a08e15-8d35-7911-a7de-e4af60e04631
NEWEST_FACTS=NOT_STARTED_EMPTY_SHEET
OLDER_GAMES_ACCESSIBLE=true
LIST_SWITCH=PASS
RESUME_01a08d84=PASS_F1_1_2_OPEN_NEXT_F2_R1
RESTART_AFTER_OLDER_SELECTION=PASS_OPENED_01a08e15
CORRECT_01a08d85=PASS_F1_8_TO_7_CORRECTIONS_2
NEW_GAME=01a092a6-31f7-7c6d-a614-890937a07e57
NEW_GAME_LABEL=9/11/2026, 6:46:00 PM
OLDER_INCLUDING_S5_AND_USER_ROWS=PRESERVED
RESTART_AFTER_NEW_GAME=PASS_OPENED_01a092a6
RESTART_SELECTS_NEWEST=PASS
HISTORY_RESUME_CORRECTION_FLOWS=PASS
PHYSICAL_DEVICE_ACCEPTANCE=PASS
OPEN_FINDINGS=NONE
```

Sep 7–8 user games were listed only; they were not opened or edited.

```ini
NEXT_ACTION=ARCHITECTURE_AUTHORITY_ACCEPTANCE_DECISION
```

The `READY_FOR_ACCEPTANCE_REVIEW` / `FORMAL_ACCEPTANCE=false` block above is
the historical retest package. Formal closure follows.

## Formal acceptance (this package)

```ini
WORK_PACKAGE=BOWLING_SLICE_5_ACCEPTANCE_AND_LOCAL_COMMIT
RESULT=PASS
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
OPEN_FINDINGS=NONE
NEXT_ACTION=POST_SLICE_5_BASELINE_INTEGRATION_REVIEW
```

Verified before this closure: origin `https://github.com/Drago1068/Bowling.git`;
branch `codex/arch-001-slice-5-history-resume`; parent HEAD `9a789b8`; the nine
expected Slice 5 files only; application/test SHA-256 values unchanged versus
the automated and device candidate; on-disk release APK SHA-256 matches the
recorded acceptance artifact. No rebuild or retest was required.

The `assembleRelease` artifact remains a **local acceptance APK**, not a
production release.
