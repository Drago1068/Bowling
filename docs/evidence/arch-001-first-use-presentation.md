# First-use scoring presentation implementation evidence

ADR-006 presentation implementation and **technical** verification only.
This record does **not** establish first-use acceptance. The actual user’s
unaided walkthrough was not conducted and was not coached.

```ini
WORK_PACKAGE=BOWLING_FIRST_USE_PRESENTATION_IMPLEMENTATION
WORKING_BRANCH=codex/first-use-scoring-presentation
BASELINE_COMMIT=94cfc4b8ef54cc7501b9dd143d948566fd861fa2
BASELINE_TREE=4582a137cbb13fd396c3a1d6904de16f39a6a86b
BASELINE_TAG=v0.6.0-arch001-slice6
SPEC=docs/adr/ADR-006-first-use-scoring-presentation.md
COMMIT_AUTHORIZED=false
MERGE_AUTHORIZED=false
PUSH_AUTHORIZED=false
TAG_AUTHORIZED=false
RELEASE_AUTHORIZED=false
TECHNICAL_VERIFICATION=PASS
USER_WALKTHROUGH=PENDING
FIRST_USE_ACCEPTANCE=NOT_ESTABLISHED
FIELD_VALIDATION=PAUSED
RESULT=READY_FOR_USER_WALKTHROUGH
```

## Starting baseline

```ini
REMOTE_ORIGIN=https://github.com/Drago1068/Bowling.git
INTEGRATION_BRANCH=arch/001-domain-sync-foundation
HEAD=94cfc4b8ef54cc7501b9dd143d948566fd861fa2
TREE=4582a137cbb13fd396c3a1d6904de16f39a6a86b
TAG=v0.6.0-arch001-slice6
```

Expected uncommitted documentation was preserved and carried onto
`codex/first-use-scoring-presentation` (created from `94cfc4b`; not reset):

- `docs/adr/ADR-006-first-use-scoring-presentation.md`
- `PROJECT_STATUS.md`
- `docs/validation/slice-6-field-validation.md`

No unexpected application changes were present at branch creation.

## Changed files (uncommitted)

- `apps/mobile/App.tsx` — Advanced / Hide advanced; secondary styling
- `apps/mobile/src/scoringPanel.tsx` — ordinary-path wording, one pad,
  Fix a ball, scorecard, Previous games Open
- `src/shellPresentation.ts` — presentation helpers (pad mode, marks,
  selection preservation); not a canonical field
- `tests/shell.presentation.test.ts` — pad exclusivity, cancel/selection,
  unplayed vs zero vs strike/spare marks
- `docs/evidence/arch-001-first-use-presentation.md` (this file)
- `PROJECT_STATUS.md`

No migrations, lockfiles, Gradle, signing, or dependency manifests were
changed. Domain scoring, identity, corrections, persistence, outbox, and
history ordering were not changed.

## Candidate hashes (working tree)

```ini
APP_TSX_SHA256=1ccd8f72a2c6206c2d94d1efa1e3d7b20c81f5f6797506d52318583617a4187a
SCORING_PANEL_SHA256=260ee7578bff62c0677033ac056a84b64d1ea37665d3662bf07388f3ac565500
SHELL_PRESENTATION_SHA256=82b1fedcb208d0f04f5123669f68d7b5cf2430fbcfd58c02a61498e06c6ef83b
SHELL_PRESENTATION_TEST_SHA256=d970d72f421678f69979fff46049d3f1c8d07cebb844631133535c7fc5e672fa
```

## Automated gates

```ini
ROOT_TESTS=156/156_PASS
SERVER_TESTS=39/39_PASS
TYPECHECK=PASS
MOBILE_TYPECHECK=PASS
```

Server database:

```ini
INSTANCE=bowling-pg-test-tmp
LISTEN=127.0.0.1:15433
IDENTITY=bowling/bowling
STORAGE=bowling-pg-test-tmp-data_PRESERVED
STARTED_BY_THIS_PACKAGE=true
STOPPED_AFTER_SUITE=true
BLOCKED_PORT_55433=NOT_USED
```

## Acceptance APK

Self-contained `assembleRelease` / `export:embed`. Not a production store
release.

```ini
APK_PATH=apps/mobile/android/app/build/outputs/apk/release/app-release.apk
APK_SHA256=ce47168678436d5ce22eda357da98a0cf0bcc8061294c16c4005f06b9755c49c
EMBEDDED_JS=assets/index.android.bundle
BUNDLE_BYTES=1355240
PACKAGE=com.drago1068.bowling
VERSION=0.1.0/1
SIGNING_CERT_SHA256=fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c
SIGNING_MATCH_INSTALLED=true
INSTALLED_BASE_APK_SHA256=ce47168678436d5ce22eda357da98a0cf0bcc8061294c16c4005f06b9755c49c
```

Device:

```ini
DEVICE=Samsung SM-S936U serial R3CY40E6FVJ
ADB=device
INSTALL=adb_install_-r_Success
FIRST_INSTALL_TIME=2026-09-07_12:13:15
LAST_UPDATE_TIME=2026-09-12_22:54:28
UNINSTALL_OR_CLEAR=false
```

Airplane mode setting was `1` during technical checks (broadcast denied;
setting write succeeded). `settings airplane_mode_on` restored to `0`
afterward; the user may still need to confirm radios in the system UI.

## Technical device checks (agent-operated; not user comprehension)

Dedicated practice game created: local label **9/12/2026, 10:58:50 PM**.
Sep 7–8 user games were listed only (Open), not edited.

Observed:

- Cold start: Bowling title, current game, one pin pad, scorecard, Advanced
  secondary. No UUID on the ordinary path.
- Start a new game; enter 4; **Saved: Frame 1, 1st ball = 4**.
- Second-ball illegal 10 not accepted (disabled).
- Fix a ball: next-ball pad hidden; Cancel returned to Frame 1 2nd ball.
- Correct 4→3; **Saved.** Scorecard shows 3 and pending `…`.
- Previous games: date/time rows with **Open** (including completed-looking
  older dates). Opening 10:54 AM did not substitute another game.
- Advanced: diagnostic controls remain (recovery, simulated network, process
  restart, expo-sqlite conformance, schema/outbox). Selection stayed 10:54 AM
  while Advanced was open.
- Force-stop / launcher relaunch opened newest **10:58:50 PM**, Frame 1 2nd
  ball, recorded 3, 7–10 grayed.

Screenshots: `%TEMP%\first-use-device\` (`01-cold.png` … `19-restart.png`).
`16-history-reopen.png` and `18-restart.png` captured an accidental Chrome/Maps
foreground and are not bowling evidence.

```ini
COMPLETED_GAME_UI_ON_DEVICE=NOT_EXERCISED
INVALID_REPAIR_UI_ON_DEVICE=NOT_EXERCISED
```

Those states remain covered by existing domain tests. Agent screenshots do
not prove the interface is understandable.

## Handoff

```ini
SCREEN_LEFT_OPEN=Bowling_practice_game_9/12/2026_10:58:50_PM_Frame_1_2nd_ball
EXISTING_USER_DATA_PRESERVED=true
APP_INSTALLED=true
USER_WALKTHROUGH=PENDING
```

Do not coach the walkthrough. Do not start real-lane validation.

## User walkthrough feedback (2026-09-12, recorded; not invented)

The actual user reported, without this package coaching the interface:

1. Understands the app as a simple bowling scoring application.
2. Starting a game was very simple.
3. Ordinary entry captures correctly, but “delivery doesn't work in 10th
   frame with 3 strikes.”
4. Correction works; prefers selecting the frame directly instead of scrolling.
5. Reopening works.
6. Wants more functionality and pin detail.

```ini
OVERALL_ACCEPTANCE=HOLD
USER_WALKTHROUGH=HOLD
FIRST_USE_ACCEPTANCE=NOT_ESTABLISHED
FIELD_VALIDATION=PAUSED
DEFERRED_PRODUCT_REQUESTS=DIRECT_FRAME_CORRECTION_SELECTION;PIN_DETAIL_REQUIREMENTS
PIN_DETAIL=NOT_A_DEFINED_REQUIREMENT
```

“Pin detail” is not defined. Do not assume pin diagrams, leave tracking, ball
data, or analytics.

## Tenth-frame three-strike diagnosis (this package; no remediation)

```ini
WORK_PACKAGE=BOWLING_TENTH_FRAME_THREE_STRIKE_DIAGNOSIS
RESULT=REPRODUCED
CANDIDATE_VERIFIED=94cfc4b8ef54cc7501b9dd143d948566fd861fa2
INSTALLED_APK_SHA256=ce47168678436d5ce22eda357da98a0cf0bcc8061294c16c4005f06b9755c49c
ACCEPTANCE_GAME_LABEL=9/12/2026,_11:50:05_PM
USER_GAME_UNTOUCHED=9/12/2026,_11:34:32_PM_final_172
APPLICATION_CODE_CHANGED=false
```

Installed `base.apk` SHA-256 matched the expected candidate. No rebuild or
reinstall. User game **11:34:32 PM** (finished 172; tenth shown as 9 / 9) was
not edited.

Reproduction on a **new** game **11:50:05 PM**: nine first-ball strikes, then
tenth-frame first-ball 10. Sequence: `10×9` then `F10 10`. After that:

- Frame label: **Frame 10 · 2nd ball**.
- Saved copy still: **Saved: Frame 10, 1st ball = 10**.
- Pad: **0** enabled; **1–10 grayed**, including the second strike.
- Tap on gray **10** did not persist a second roll (still 2nd ball).
- Scorecard: frames 1–9 `X` with running 30…240; frame 10 `X · ·` pending `…`.
- Completed state was not reached. Further legal fill balls 1–10 are not
  offered.

Screenshots: `%TEMP%\tenth-frame-diag\` (`d02-new-acceptance.png`,
`d03-after-nine-strikes.png`, `d04-f10-after-first-strike.png`,
`d05-tap-disabled-10.png`).

Probe of existing `validateNextRoll` / `pinfallLegal` (no DB patch): after a
tenth-frame first-ball 10, second-ball 0 is legal; 1–10 return
`IMPOSSIBLE_TWO_ROLL_TOTAL`. `nextLegalSlot` still offers F10 R2. Third-ball
10 would be legal **if** two tenths-frame 10s already existed. `deriveGame`
on constructed facts still scores a tenth `10,10,7` as 297
(`TENTH_FRAME_TOPOLOGY: strike in tenth keeps two bonus rolls legal`).
`PERFECT_GAME` derives 300 from facts and does **not** exercise `recordRoll`
twelve times.

ADR-003: `IMPOSSIBLE_TWO_ROLL_TOTAL` applies to tenth frames **before a
strike on the first ball**. The implementation applies the two-roll sum > 10
rule to tenth-frame ball 2 even after a first-ball strike.

The UI calls `pinfallLegal` (same `validateNextRoll`) to enable pad keys.
This is not a `src/shellPresentation.ts` scoring calculation.
`shellPresentation.ts` remains presentation-only (disclosures, pad mode,
ordinal labels, scorecard marks from existing flags). Scope note: bonus
10s in the tenth would display as `"10"` not `X` because `ballCellMark`
uses `isStrike` only on delivery index 0; that is **not** the reported
delivery failure.

```ini
FAILED_ACTION=TENTH_FRAME_SECOND_BALL_AFTER_STRIKE
EXPECTED_BEHAVIOR=After F10 first-ball 10, balls 2 and 3 each allow 0-10 including strike; third 10 completes the game
OBSERVED_BEHAVIOR=After F10 first-ball 10, only 0 is offered for ball 2; 10 is disabled and does not save
PERSISTED_FACTS_STATUS=FIRST_TENTH_STRIKE_SAVED_SECOND_NOT_WRITTEN
DEFECT_CLASSIFICATION=NEXT_BALL_LEGALITY_VALIDATE_NEXT_ROLL_AND_ENTRY_PAD
ROOT_CAUSE=validateNextRoll_frame10_second_ball_sums_with_strike_as_open_frame
```

Smallest proposed remedy (not executed): in `validateNextRoll` only, skip the
tenth-frame two-roll sum check when the first ball is 10; keep the check for
non-strike first balls (e.g. 8+5). Add tests that `recordRoll` accepts
`10×12` and tenth `10,9,1` / `10,10,10`. Device: dedicated game, nine
strikes then three tenth-frame 10s, completed 300, pad then hidden. Do not
change `deriveGame` unless a later probe shows it also fails (current tests
do not).

Deferred, not implemented: direct frame selection for correction; additional
pin detail / functionality.

Handoff after diagnosis: app left on acceptance game **11:50:05 PM**, Frame
10, 2nd ball (only 0 enabled). User 11:34:32 PM game unchanged.

## Tenth-frame legality remediation (this package)

Authorized bounded correction of `validateNextRoll` only, plus entry-path
tests. First-use presentation work is preserved. No commit.

```ini
WORK_PACKAGE=BOWLING_TENTH_FRAME_LEGALITY_REMEDIATION
WORKING_BRANCH=codex/first-use-scoring-presentation
BASELINE_COMMIT=94cfc4b8ef54cc7501b9dd143d948566fd861fa2
PRODUCTION_FILE_CHANGED=src/scoring/validate.ts
DERIVE_GAME_CHANGED=false
IDENTITY_CORRECTION_PERSISTENCE_OUTBOX_UNCHANGED=true
RESULT=HOLD
GATE=DEVICE_LOCKED_BLOCKING_DATA_PRESERVING_INSTALL
```

### Original failure (preserved)

After a tenth-frame first-ball 10, `validateNextRoll` treated ball 2 as an
ordinary open-rack sum. The pad enabled only 0; 1–10 were gray and did not
save. ADR-003 §11: `IMPOSSIBLE_TWO_ROLL_TOTAL` applies to tenth frames
**before** a first-ball strike. After a strike the rack resets for fill
balls; if the second ball is not a strike, the third cannot exceed remaining
pins. An open tenth still has no third ball.

### Remedy in validate.ts

- Ball 2 after first-ball 10: 0–10 legal.
- Ball 2 after first-ball below 10: sum must not exceed 10 (8+5 still
  rejected).
- Ball 3 after 10,10: 0–10.
- Ball 3 after 10 then second below 10: pinfall cannot exceed `10 - second`.
- Ball 3 after a spare: 0–10.
- Open tenth third ball: `INVALID_TENTH_BONUS`.
- Completed game: `ROLL_AFTER_COMPLETION` (unchanged).

Third balls are not blindly 0–10.

### Entry-path tests

`tests/mobile.scoring-flow.test.ts` uses `recordRoll` / `pinfallLegal`:
twelve sequential strikes → 300; tenth 10,9,1; 10,9 then 2 rejected with
canonical facts and outbox unchanged; after 10,10 all 0–10 legal; tenth 8,5
rejected without mutation; spare fill permitted; open tenth extra ball
rejected. `tests/scoring.test.ts` covers validateNextRoll 10 then second 10,
and 10,9 then third 2.

```ini
ROOT_TESTS=163/163_PASS
SERVER_TESTS=39/39_PASS
TYPECHECK=PASS
MOBILE_TYPECHECK=PASS
```

Server: existing `bowling-pg-test-tmp` `127.0.0.1:15433` started for the
suite, then stopped; volume `bowling-pg-test-tmp-data` preserved. Port 55433
not used.

### Fixed APK (built; not installed)

Prior installed APK `ce471686…` does **not** include this fix. Rebuild used
`createBundleReleaseJsAndAssets` + `assembleRelease --rerun-tasks` after an
UP-TO-DATE miss. Bundle contains `"fill balls"`.

```ini
VALIDATE_TS_SHA256=8fcc30f53d3c8904761af9c1d9e4f2d8edb1c79324be5406c19b8bf809d1c55a
MOBILE_SCORING_FLOW_TEST_SHA256=828c38ec418ac82ecfaaaf3d3d8b7ad155205e7a5ccee468553f83827f05531e
SCORING_TEST_SHA256=f3d5af2d07076eb999a558775382691f0ee4c7311dcd5efc463e02008a3c0ed1
APK_PATH=apps/mobile/android/app/build/outputs/apk/release/app-release.apk
APK_SHA256=3e9ecef1ffb6699da41f566c6e9ab4ed5bd2908ecc1d7897f07a693f00e7db43
BUNDLE_BYTES=1355344
BUNDLE_TIME=2026-09-13_00:33:38_America/New_York
PACKAGE=com.drago1068.bowling_0.1.0/1
SIGNING_CERT_SHA256=fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c
SIGNING_COMPATIBLE_WITH_INSTALLED=true
```

### Device install gate (not passed)

One `adb install -r` of the new APK was started, hung, and killed. Dumpsys
during the hang: `mDreamingLockscreen=true`, focused
`PlayProtectDialogsActivity` behind `NotificationShade` / later `Bouncer`.
`wm dismiss-keyguard` left the lock. No second install attempt.

```ini
DEVICE=Samsung_SM-S936U_serial_R3CY40E6FVJ
ADB=device
INSTALL=HUNG_KILLED_DEVICE_LOCKED
FIRST_INSTALL_TIME=2026-09-07_12:13:15
LAST_UPDATE_TIME=2026-09-12_22:54:28
INSTALLED_STILL_PRIOR_APK=ce47168678436d5ce22eda357da98a0cf0bcc8061294c16c4005f06b9755c49c
UNINSTALL_OR_CLEAR=false
USER_GAME_11_34_PM_UNTOUCHED=true
DIAGNOSIS_GAME_11_50_PM_UNTOUCHED=true
DEVICE_PERFECT_GAME=NOT_EXECUTED
DEVICE_FILL_BALL_RESTRICTIONS=NOT_EXECUTED
COMPLETED_STATE_UI=NOT_EXERCISED
INVALID_REPAIR_UI=NOT_EXERCISED
```

Screenshot: `%TEMP%\tenth-frame-fix\bouncer.png` (AOD charging lock).

Do not mark overall first-use acceptance complete. Frame-selection correction
and pin detail remain deferred.

## Tenth-frame three-strike diagnosis (2026-09-13 morning; no remediation)

This package is investigation only. Application code, tests, Gradle, and
installs were not changed here. Uncommitted first-use and `validate.ts`
remediation work was preserved.

```ini
WORK_PACKAGE=BOWLING_TENTH_FRAME_THREE_STRIKE_DIAGNOSIS
RESULT=BLOCKED
CANDIDATE_VERIFIED=true
HEAD=94cfc4b8ef54cc7501b9dd143d948566fd861fa2
BRANCH=codex/first-use-scoring-presentation
EXPECTED_APK_SHA256=ce47168678436d5ce22eda357da98a0cf0bcc8061294c16c4005f06b9755c49c
INSTALLED_BASE_APK_SHA256=3e9ecef1ffb6699da41f566c6e9ab4ed5bd2908ecc1d7897f07a693f00e7db43
INSTALLED_ARTIFACT_VERIFIED=false
APPLICATION_CODE_CHANGED=false
```

User feedback (actual; not invented): understands the app; start is simple;
ordinary entry works except “delivery doesn't work in 10th frame with 3
strikes”; correction works (prefers tap-on-frame); reopen works; wants more
functionality and pin detail (undefined).

```ini
OVERALL_ACCEPTANCE=HOLD
FIELD_VALIDATION=PAUSED
DEFERRED_PRODUCT_REQUESTS=DIRECT_FRAME_CORRECTION_SELECTION;PIN_DETAIL_REQUIREMENTS
```

Identity: pulled `base.apk` SHA-256 is the remediating candidate
`3e9ecef1…` (embedded bundle 1355344 bytes, contains `"fill balls"`), not
the expected diagnosis APK `ce471686…`. `lastUpdateTime=2026-09-13 01:37:47`;
`firstInstallTime=2026-09-07 12:13:15`. This package did not install. Local
built APK file hashes to the same `3e9ecef1…`. Presentation hashes match the
first-use candidate (`shellPresentation.ts`
`82b1fedcb208d0f04f5123669f68d7b5cf2430fbcfd58c02a61498e06c6ef83b`).

`src/shellPresentation.ts` has no `validateNextRoll` / `pinfallLegal` /
`deriveGame` imports. It toggles disclosures, pad mode, ordinals, and
scorecard marks from existing flags. Scope note (not the reported delivery
failure): tenth-frame fill 10s would show as `"10"` not `X` because
`ballCellMark` uses `isStrike` only on delivery index 0.

Live UI sequence was **not** run. Device `R3CY40E6FVJ` remained on the lock
screen (`mDreamingLockscreen=true`; screenshot
`%TEMP%\tenth-frame-diag\01-after-wake.png`). No new acceptance game. User
games **11:34:32 PM** and **11:50:05 PM** were not opened or edited. No
database row patches. No Postgres.

The 2026-09-12 reproduction on expected APK `ce471686…` / game
**11:50:05 PM** is unchanged: after F10 first-ball 10, pad offered only 0;
tap 10 did not persist. That run compared with `PERFECT_GAME` (preconstructed
facts → 300, not `recordRoll`) and baseline `validateNextRoll` at `94cfc4b`
(`if (first + second > 10)` on tenth ball 2 with no strike exception). Pad
uses `pinfallLegal` → `validateNextRoll`. Classification of that reproduced
path remains entry-legality, not shell presentation and not `deriveGame`.

```ini
LIVE_REPRODUCTION_SEQUENCE=NOT_EXECUTED_DEVICE_LOCKED
HISTORICAL_REPRODUCTION_SEQUENCE=9x10_then_F10_10_then_second_10_unavailable
FAILED_ACTION=TENTH_FRAME_SECOND_BALL_AFTER_STRIKE
EXPECTED_BEHAVIOR=After F10 first-ball 10, balls 2 and 3 each allow 0-10 including strike
OBSERVED_THIS_PACKAGE=LOCK_SCREEN_NO_APP_UI
PERSISTED_FACTS_STATUS=NOT_PROBED_THIS_PACKAGE_NO_DB_PATCH
DEFECT_CLASSIFICATION=NEXT_BALL_LEGALITY_VALIDATE_NEXT_ROLL_AND_ENTRY_PAD_ON_CE471686_PLUS_CURRENT_ARTIFACT_MISMATCH_VS_EXPECTED
ROOT_CAUSE=validateNextRoll_frame10_second_ball_sums_with_strike_as_open_frame_ON_EXPECTED_APK
PRESENTATION_HELPER_SCOPE_STATUS=PRESENTATION_ONLY
```

Smallest proposed correction (not executed here; already present uncommitted
from the later remediation package): `validateNextRoll` tenth-frame strike
exception for ball 2; keep 8+5 rejection; ADR-003 third-ball rules; focused
`recordRoll` tests; device nine strikes + three tenth 10s on the **currently
installed** `3e9ecef1…` APK. Do not change `deriveGame` unless a later probe
fails.

## Installed tenth-frame fix verification (this package; no rebuild/install)

Pulled installed `base.apk` SHA-256 matched the remediating candidate. The
older `ce471686…` APK remains historical reproduction evidence only. Hung
`adb install -r` from the remediation package is still not recorded as
Success. This package did not install or rebuild.

```ini
WORK_PACKAGE=BOWLING_INSTALLED_TENTH_FRAME_FIX_VERIFICATION
RESULT=READY_FOR_ACCEPTANCE_REVIEW
HEAD=94cfc4b8ef54cc7501b9dd143d948566fd861fa2
BRANCH=codex/first-use-scoring-presentation
VALIDATE_TS_SHA256=8fcc30f53d3c8904761af9c1d9e4f2d8edb1c79324be5406c19b8bf809d1c55a
MOBILE_SCORING_FLOW_TEST_SHA256=828c38ec418ac82ecfaaaf3d3d8b7ad155205e7a5ccee468553f83827f05531e
SCORING_TEST_SHA256=f3d5af2d07076eb999a558775382691f0ee4c7311dcd5efc463e02008a3c0ed1
LOCAL_APK_SHA256=3e9ecef1ffb6699da41f566c6e9ab4ed5bd2908ecc1d7897f07a693f00e7db43
INSTALLED_BASE_APK_SHA256=3e9ecef1ffb6699da41f566c6e9ab4ed5bd2908ecc1d7897f07a693f00e7db43
FIRST_INSTALL_TIME=2026-09-07_12:13:15
LAST_UPDATE_TIME=2026-09-13_01:37:47
DEVICE=R3CY40E6FVJ
DEVICE_UNLOCKED=true
APPLICATION_CODE_CHANGED=false
BUILD_PERFORMED=false
INSTALL_PERFORMED=false
```

Typechecks rerun this package: both PASS. Root `163/163` and server `39/39`
were not rerun (device-only); they still apply because the remediating
source hashes are unchanged.

Offline: `svc wifi disable` before the run (wifi remained disabled until
restored afterward). No `tcp:8081` Bowling Metro reverse. Unrelated USB
forwards `8091`/`8000` were not removed. Cellular icons could still appear
in the status bar; Metro was not used.

Dedicated games (user 11:34:32 PM / 11:50:05 PM listed only, not edited):

1. **9/13/2026, 8:10:29 AM** — twelve strikes. Each 10 enabled and saved.
   **Game finished. Final score 300.** Scorecard F10 `X 10 10` / 300. Next-
   ball pad absent. Screenshots `06-perfect-complete.png`,
   `12-reopen-perfect.png`.
2. **9/13/2026, 8:15:39 AM** — nine strikes then F10 `10,9`. Pad: **0** and
   **1** green; 2–10 gray. Tap 2 did not save. Tap 1:
   **Game finished. Final score 289.** Screenshot `07-after-10-9.png`,
   `08-fill-complete.png`.
3. Force-stop/relaunch opened newest fill game still **289**. Open of
   8:10:29 AM still **300**; reopen fill still **289**. History listed
   **11:34:32 PM** and **11:50:05 PM** with Open.

Screenshots: `%TEMP%\tenth-frame-verify\`. A trailing console `charmap`
error printing NNBSP in the game label is not a device failure.

```ini
DEVICE_PERFECT_GAME=PASS
DEVICE_FILL_BALL_RESTRICTIONS=PASS
COMPLETED_STATE_UI=PASS
RESTART_PERSISTENCE=PASS
EXISTING_USER_DATA_PRESERVED=true
INVALID_REPAIR_UI=NOT_EXERCISED
OVERALL_ACCEPTANCE=HOLD
FIELD_VALIDATION=PAUSED
```

Wifi/data were re-enabled after the run. No commit.

## Gate reconciliation (this package; evidence only)

```ini
WORK_PACKAGE=BOWLING_FIRST_USE_ACCEPTANCE_GATE_RECONCILIATION
HEAD=94cfc4b8ef54cc7501b9dd143d948566fd861fa2
BRANCH=codex/first-use-scoring-presentation
CANDIDATE_VERIFIED=true
VALIDATE_TS_SHA256=8fcc30f53d3c8904761af9c1d9e4f2d8edb1c79324be5406c19b8bf809d1c55a
MOBILE_SCORING_FLOW_TEST_SHA256=828c38ec418ac82ecfaaaf3d3d8b7ad155205e7a5ccee468553f83827f05531e
SCORING_TEST_SHA256=f3d5af2d07076eb999a558775382691f0ee4c7311dcd5efc463e02008a3c0ed1
LOCAL_APK_SHA256=3e9ecef1ffb6699da41f566c6e9ab4ed5bd2908ecc1d7897f07a693f00e7db43
RESULT=HOLD
OVERALL_ACCEPTANCE=false
FIELD_VALIDATION=PAUSED
APPLICATION_CODE_CHANGED=false
```

Working-tree hashes still match the remediating candidate recorded above.

### Hung identity shells versus later device run

These are separate facts. Command **exit status is not rewritten as PASS**.

1. Identity shell `903380` (`Verify git, source hashes, device lock, package times`): captured `codex/first-use-scoring-presentation`, HEAD `94cfc4b`, remediating source hashes, local APK `3e9ecef1…`, device `R3CY40E6FVJ` `device`, `mDreamingLockscreen=false`, `lastUpdateTime=2026-09-13 01:37:47`, `firstInstallTime=2026-09-07 12:13:15`. Terminal **status=failed**. No `exit_code` footer.
2. Identity shell `903381` (`Pull installed APK hash; check reverse, radios, lock`): captured pull of installed `base.apk` **INSTALLED_SHA256=3e9ecef1…** matching local APK; reverse list empty at that capture; then wifi-connected / cellular registry dump; `mDreamingLockscreen=false`. Terminal **status=failed**. No `exit_code` footer. Radio dump is **pre-run** identity, not proof of the later offline window.
3. Later offline device script (`tenth_frame_verify.py`): `results.json` records device PASS for 300 / 10,9 pad / restart-open. Process then raised **UnicodeEncodeError** printing NNBSP to the console (exit 1). That print failure is not a device scoring failure and is not an identity-shell PASS.

Captured identity output is **sufficient** to tie the later device games to the fixed candidate (`3e9ecef1…` pulled `base.apk` on `R3CY40E6FVJ`) even though those identity shells failed.

The hung `adb install -r` from remediation remains **not Success**. How `lastUpdateTime` became `2026-09-13 01:37:47` is still not claimed as that command succeeding.

### Checked device claims (later run only)

| Claim | Disposition | Evidence |
| --- | --- | --- |
| Installed APK identity | PASS | `903381` captured hash `3e9ecef1…` (shell later failed); matches `FIXED_APK_SHA256` |
| Offline without Metro | PASS | Wifi disabled before the device script; no Bowling `tcp:8081` reverse. Cellular fully-off is **not** claimed (status-bar icons / pre-run telephony dump). Unrelated USB forwards `8091`/`8000` were not treated as Metro. |
| Twelve strikes → 300 | PASS | Game **8:10:29 AM**; `06-perfect-complete.png`; log twelve `ENTER 10 ok` |
| Further entry disabled | PASS | Same screenshot: no “How many pins” pad; **Start a new game** |
| Tenth 10,9 only 0–1 | PASS | Game **8:15:39 AM**; `07-after-10-9.png`; dump `FILL_ENABLED_AFTER_10_9=0,1`; log `ILLEGAL_2_NO_SAVE`; 1 completes **289** |
| Existing user games | PASS | History text lists **11:34:32 PM** and **11:50:05 PM** with Open; not edited |
| Restart persistence | PASS | Force-stop/relaunch showed fill **289**; Open restored **300** and **289** (`10-relaunch.png`, `12-reopen-perfect.png`, `13-reopen-fill.png`) |

Original defect (APK `ce471686…`, game **11:50:05 PM**, only 0 after F10 strike) is **preserved**. Subsequent verification on `3e9ecef1…` **closes** that tenth-frame entry defect.

### Acceptance gate table

| Gate | Status | Evidence |
| --- | --- | --- |
| Automated fixed-candidate root tests | PASS | Remediation package `163/163`; hashes unchanged; **not rerun** in later device-only packages |
| Automated server tests | PASS | Remediation `39/39` on `bowling-pg-test-tmp` `127.0.0.1:15433` then stopped; **not rerun** later |
| Typecheck (root + mobile) | PASS | Rerun during installed-fix verification package |
| Tenth-frame three-strike defect | CLOSED | Original FAIL preserved (`ce471686…` / 11:50 PM). Closed by `3e9ecef1…` device 300 + 10,9 pad |
| Completed-state UI | PASS | `Game finished. Final score 300.` / `289.` |
| Invalid-repair UI | PASS | Dedicated **9:12:25 AM** on `3e9ecef1…`; see package below |
| Restart persistence (acceptance games) | PASS | Force-stop/relaunch + Open as above |
| Actual user first-use observations | HOLD | Recorded 2026-09-12: understood app; start simple; ordinary entry OK except tenth-frame 3 strikes (now CLOSED); correction OK (wants tap-on-frame); reopen OK; pin detail undefined. **No assistance history invented.** Walkthrough not a first-use PASS. |
| Direct frame-selection correction | HOLD | Deferred; not implemented |
| Pin-detail / extra functionality | HOLD | Not a defined requirement; not implemented |
| Overall first-use acceptance | HOLD | Required gates remain (invalid-repair UI; user walkthrough; deferred product requests) |
| Field validation | PAUSED | Unchanged |

```ini
TENTH_FRAME_DEFECT=CLOSED
COMPLETED_STATE_UI=PASS
INVALID_REPAIR_UI=HOLD
RESTART_PERSISTENCE=PASS
USER_WALKTHROUGH=HOLD
MISSING_EVIDENCE=USER_WALKTHROUGH_NOT_A_PASS
```

## Invalid-repair device acceptance (this package)

Ordinary Fix-a-ball path only. Same class as `P1 OPEN_TO_STRIKE` (`6,4` then
first ball → `10`); this run used **3,4** then first ball → **10**, then
append-only correct back to **3**. No SQLite patch, rebuild, or install.
UUID is not shown on the ordinary path (ADR-006); identity is the local
creation label.

```ini
WORK_PACKAGE=BOWLING_INVALID_REPAIR_DEVICE_ACCEPTANCE
RESULT=PASS
HEAD=94cfc4b8ef54cc7501b9dd143d948566fd861fa2
INSTALLED_LAST_UPDATE_TIME=2026-09-13_01:37:47
LOCAL_APK_SHA256=3e9ecef1ffb6699da41f566c6e9ab4ed5bd2908ecc1d7897f07a693f00e7db43
DEVICE=R3CY40E6FVJ
DEVICE_UNLOCKED=true
ACCEPTANCE_GAME_LABEL=9/13/2026,_9:12:25_AM
TENTH_FRAME_DEFECT=CLOSED
USER_WALKTHROUGH=HOLD
OVERALL_ACCEPTANCE=false
FIELD_VALIDATION=PAUSED
APPLICATION_CODE_CHANGED=false
```

Sequence observed:

1. New game. Record F1 **3** then **4**. Scorecard `3 4` / **7**. Next ball
   Frame 2. Screenshot `01-before.png`.
2. Fix a ball → **Frame 1, 1st ball = 3** → **10**. Saved via correction.
   Banner and notice: **This game needs a later ball fixed before the score
   can be finished.** Scorecard F1 `10 4` with `…` (not a finished total).
   No **Game finished**. Next-ball pad hidden. Screenshot `02-invalid.png`.
3. Fix a ball still listed both facts: **1st = 10**, **2nd = 4**.
   Screenshot `03-fix-list-invalid.png`.
4. Correct 1st ball **10 → 3**. **Saved.** Frame 2 1st ball pad returns.
   Scorecard `3 4` / **7**. Fix list **1st = 3**, **2nd = 4**.
   Screenshots `04-restored.png`, `05-fix-list-restored.png`.

Screenshots: `%TEMP%\invalid-repair-verify\`. Agent-operated; not user
comprehension evidence. Existing user games were not the target of this
sequence.

## Runtime blocker: DATABASE_OPEN_FAILED (2026-09-13)

Diagnosis only. Acceptance and field validation remain paused. Previous
PASS device tests (300, 289, invalid-repair, restart-open) are historical
and do not override the current launch failure.

```ini
WORK_PACKAGE=BOWLING_DATABASE_OPEN_FAILURE_DIAGNOSIS
RESULT=DIAGNOSED
HEAD=94cfc4b8ef54cc7501b9dd143d948566fd861fa2
BRANCH=codex/first-use-scoring-presentation
CANDIDATE_VERIFIED=true
LOCAL_APK_SHA256=3e9ecef1ffb6699da41f566c6e9ab4ed5bd2908ecc1d7897f07a693f00e7db43
INSTALLED_ARTIFACT_VERIFIED=INFERRED_LAST_UPDATE_TIME_NOT_REHASHED
INSTALLED_LAST_UPDATE_TIME=2026-09-13_01:37:47
INSTALLED_FIRST_INSTALL_TIME=2026-09-07_12:13:15
DEVICE=R3CY40E6FVJ
DEVICE_UNLOCKED=true
FAILURE_REPRODUCED=true
UNDERLYING_ERROR=NativeDatabase.execSync_rejected_java.lang.NullPointerException
FAILURE_STAGE=AFTER_OPEN_DURING_EXECSYNC_PRAGMA_MIGRATE_OR_INIT_QUERY_LIKELY
DATABASE_STATE=INACCESSIBLE
ROOT_CAUSE=NOT_FULLY_PINNED_NATIVE_EXECSYNC_NPE_NOT_PROVEN_FILE_CORRUPTION
APP_DATA_CHANGED_BY_DIAGNOSTIC_ACTIONS=false
APPLICATION_CODE_CHANGED=false
COMMITS_CREATED=false
NAS_ACCESSED=false
OTHER_PROJECTS_ACCESSED=false
PIN_DETAIL_AND_ANALYSIS_REQUEST=RECORDED_NOT_AUTHORIZED
OVERALL_ACCEPTANCE=HOLD
FIELD_VALIDATION=PAUSED
TENTH_FRAME_DEFECT=CLOSED_HISTORICAL
INVALID_REPAIR_UI=PASS_HISTORICAL
USER_WALKTHROUGH=HOLD
```

### What emits the banner

Ordinary UI title is `{screen.result.status}` (`apps/mobile/App.tsx`). The
shown title `DATABASE_OPEN_FAILED` is the startup status string, not a
separate marketing label.

Two paths can set that status:

1. `initializeApplication` (`src/persistence/startup.ts`): catch around
   `openDriver()`, or catch around `prepareDatabase` / identity / outbox /
   session restore. Structured migrate `ok: false` uses
   `DATABASE_MIGRATION_FAILED` or `UNSUPPORTED_SCHEMA` instead.
2. `App.tsx` `runInit` catch: `Open failed: … The database file was not
   recreated.`

Observed note used the **else** branch (`… Existing database retained.`),
so `initializeApplication` returned `ok: false` with
`status=DATABASE_OPEN_FAILED` rather than an uncaught throw in `runInit`.

Native adapter: `openExpoSqliteDriver("bowling-arch001.db")` →
`SQLite.openDatabaseSync` then `createMobileSqliteDriver`; first SQL is
typically `prepareDatabase` → `PRAGMA foreign_keys` / `PRAGMA journal_mode
= WAL` then migrations (`src/persistence/sqlite/database.ts`). Failures
must not recreate the file (`retainedExistingDatabase: true`). Dependency:
`expo-sqlite` `~57.0.2`.

### Observed failure

User-visible (screenshot `%TEMP%\db-open-fail\01-launch.png`, 9:25 AM):

```
DATABASE_OPEN_FAILED
DATABASE_OPEN_FAILED: Call to function 'NativeDatabase.execSync' has been rejected.
→ Caused by: java.lang.NullPointerException: java.lang.NullPointerException. Existing database retained.
Existing bowling data was not dropped. Fix the database and retry; the app will not silently recreate it.
```

Scoring shell still rendered with Start a game disabled (`driver` null).
Advanced was not opened; conformance / `deleteExpoSqliteDatabase` not
invoked.

One authorized launch after preserving filtered logcat: `am start` HOT —
“Activity not started, brought to front.” Already-running process still
showed the same banner. Cold start after process death was **not** run.
Whether the NPE occurs on every cold launch versus a stale native handle
in this process is **unknown**.

Filtered logcat (`%TEMP%\db-open-fail\logcat-preserve-filtered.txt`) had
no Bowling-owned `execSync` stack; other packages’ WAL recoveries are
unrelated. Device `/data` ~67% used with ~75G free — not a full-disk
story. `run-as com.drago1068.bowling` fails (`package not debuggable`).
Database / WAL / SHM presence, sizes, and integrity were **not**
inspected. Do not treat that as proof of corruption.

### What is not proven

- File-open failure versus first `execSync` after `openDatabaseSync`.
- Exact SQL (pragma vs migrate vs later query).
- Concurrent connection, resource exhaustion, or schema damage.
- Game rows still readable. Files existing (if they do) would not prove
  contents; open failure does not prove loss.

### Smallest proposed remedy (not implemented)

1. Do not delete, rename, or recreate `bowling-arch001.db` or its WAL/SHM.
2. If a recovery copy is required later: copy **database + WAL + SHM** as
   one consistent set (or SQLite `.backup` / `VACUUM INTO` against a live
   connection). Copying only the main file is not a complete backup.
3. Extra diagnostic logging (propose only): stage tags for
   `openDatabaseSync`, first `execSync` pragma, migrate, identity read.
   Surface the full native exception, not only `NullPointerException`.
4. Next recovery step: one **force-stop then cold start** with log capture
   to distinguish stale native pointer vs durable file/SQL failure. If it
   still fails, inspect files only after a consistent three-file copy, then
   a data-preserving native/open-path fix. Do not mix pin-detail work.

Focused retest: one cold launch shows bowling UI without the banner; listed
games **11:34:32 PM**, **11:50:05 PM**, **8:10:29 AM** (300), **8:15:39 AM**
(289), **9:12:25 AM** (repair test) reappear **without** data reset.

### Proposed pin-detail and analysis requirement (not authorized)

Recorded from the user; not implementation authorization.

For each delivery:

- Record pins knocked down.
- Record exactly which numbered pins remain standing.
- Retain frame/ball context and correction history.

After games:

- Analyze observed pinfall and pin leaves for an individual game.
- Analyze those observations across historical games.

Preserve derived bowling scoring; do not introduce manually authoritative
frame totals.

Unresolved:

- Whether “give a score” means pinfall or another value.
- Required analysis outputs.
- Pin-selection workflow and correction behavior.
- Representation of unknown / not-recorded pin detail.
- Treatment of older games lacking pin-level observations.

Never reconstruct exact pin leaves from pinfall alone. Do not retrofit
invented pin details into history. No pin-detail UI, schema, analytics, or
scoring changes in this diagnosis package.

## Cold-start recovery (2026-09-13)

One force-stop and one cold launch. No source, APK, SQLite copy, or data
reset. Classified **RECOVERED_THIS_LAUNCH**, not a root-cause fix.

```ini
WORK_PACKAGE=BOWLING_DATABASE_COLD_START_RECOVERY
RESULT=RECOVERED_THIS_LAUNCH
HEAD=94cfc4b8ef54cc7501b9dd143d948566fd861fa2
BRANCH=codex/first-use-scoring-presentation
CANDIDATE_VERIFIED=true
LOCAL_APK_SHA256=3e9ecef1ffb6699da41f566c6e9ab4ed5bd2908ecc1d7897f07a693f00e7db43
INSTALLED_APK_IDENTITY=VERIFIED
INSTALLED_APK_SHA256=3e9ecef1ffb6699da41f566c6e9ab4ed5bd2908ecc1d7897f07a693f00e7db43
INSTALLED_LAST_UPDATE_TIME=2026-09-13_01:37:47
DEVICE=R3CY40E6FVJ
DEVICE_UNLOCKED=true
COLD_START_EXECUTED=true
LAUNCH_STATE=COLD
PRE_STOP_PID=32195
POST_START_PID=31963
STARTUP_RESULT=SUCCESS_THIS_LAUNCH
UNDERLYING_ERROR=NONE_THIS_LAUNCH
READABLE_GAMES_VERIFIED=FIVE_ACCEPTANCE_LABELS_OPENED
DATA_INTEGRITY_SCOPE=LISTED_GAMES_READABLE_NOT_FULL_DATABASE_PROOF
ROOT_CAUSE_CONFIRMED=false
RECURRENCE_RISK=UNRESOLVED
DEVICE_DATA_RESET=false
APPLICATION_CODE_CHANGED=false
OVERALL_ACCEPTANCE=HOLD
FIELD_VALIDATION=PAUSED
PIN_DETAIL_AND_ANALYSIS=DEFERRED_REQUIREMENTS
```

Installed `base.apk` was pulled read-only from
`/data/app/~~jCnLHRoICNrrWXcwCH21pg==/com.drago1068.bowling-7ye-y2rE-gSfdy6NlIM4kg==/base.apk`
and hashed `3e9ecef1…` (not inferred from update time alone).

Pre-stop UI (unlocked, not mid-entry): same `DATABASE_OPEN_FAILED` /
`NativeDatabase.execSync` NPE banner as diagnosis. Existing logs captured
without `logcat -c` (`%TEMP%\db-cold-start\logcat-pre-force-stop.txt`).
Force-stop left no pid. `am start -W -n com.drago1068.bowling/.MainActivity`
reported `LaunchState=COLD`, `Status: ok`.

Post-start (screenshot `%TEMP%\db-cold-start\01-cold-start.png`, ~9:34 AM):
no open-failed banner. Active session **9/13/2026, 9:12:25 AM**, Frame 2
1st ball, scorecard F1 `3 4` / **7**. Pid 31963 logcat had
`libexpo-sqlite.so` load and `Running "main"`; **no** `execSync` /
`NullPointerException` / `DATABASE_OPEN` lines.

Previous games list (read-only; labels are not durable IDs) included at
least:

- 9/13/2026, 9:12:25 AM
- 9/13/2026, 9:09:57 AM (listed, not opened)
- 9/13/2026, 8:15:39 AM
- 9/13/2026, 8:10:29 AM
- 9/12/2026, 11:50:05 PM
- 9/12/2026, 11:39:38 PM (opened once by stale tap; empty Frame 1 pad;
  not an acceptance target)
- 9/12/2026, 11:34:32 PM
- plus older listed labels not opened

Observed facts after Open (no pin-pad taps, no new games, no Advanced):

| Label | Observed |
| 9/13/2026, 9:12:25 AM | Repair-test: F1 `3 4` / 7; Frame 2 1st ball |
| 9/13/2026, 8:15:39 AM | Game finished. Final score **289**. F10 `X 9 1` |
| 9/13/2026, 8:10:29 AM | Game finished. Final score **300**. F10 `X 10 10` |
| 9/12/2026, 11:50:05 PM | Still Frame 10 2nd ball after F10 first-ball X; F1–F9 X; unfinished |
| 9/12/2026, 11:34:32 PM | Game finished. Final score **172**. F10 `9 / 9` |

A successful cold start does **not** prove the prior NPE was only a stale
native handle and does **not** eliminate recurrence. Root cause remains
unconfirmed. Database/WAL/SHM were not copied.

Screenshots/dumps: `%TEMP%\db-cold-start\`.

## Lifecycle recurrence check (2026-09-13)

```ini
WORK_PACKAGE=BOWLING_LIFECYCLE_RECURRENCE_CHECK
RESULT=REPRODUCED
COLD_START_RECOVERY=SUCCESS_PREVIOUSLY_OBSERVED
HEAD=94cfc4b8ef54cc7501b9dd143d948566fd861fa2
CANDIDATE_VERIFIED=true
INSTALLED_ARTIFACT_VERIFIED=UNCHANGED_FROM_PRIOR_VERIFIED_PULL_NOT_REHASHED
INSTALLED_LAST_UPDATE_TIME=2026-09-13_01:37:47
DEVICE=R3CY40E6FVJ
PID=31963
FAILURE_TRIGGER=BACKGROUND_APPROX_2MIN_THEN_HOT_FOREGROUND
EXCEPTION_AND_STAGE=NativeDatabase.execSync_rejected_java.lang.NullPointerException_ON_FOREGROUND_recoverAfterLifecycle_initializeApplication_prepareDatabase_LIKELY
ROOT_CAUSE=UNCONFIRMED
LOCK_UNLOCK=NOT_EXECUTED_STOPPED_ON_NPE
FORCE_STOP=NOT_EXECUTED
APPLICATION_CODE_CHANGED=false
DEVICE_DATA_RESET=false
OVERALL_ACCEPTANCE=HOLD
FIELD_VALIDATION=PAUSED
PIN_DETAIL_AND_ANALYSIS=DEFERRED_REQUIREMENTS
```

Installed identity: same `codePath` and `lastUpdateTime` as the
`3e9ecef1…` pull. Not rehashed this package.

### Code observations (not hypotheses)

- Open: `openExpoSqliteDriver` → `SQLite.openDatabaseSync` wrapped by
  `createMobileSqliteDriver`. Stored in `App` `driverRef`.
- Close: `driver.close()` → `closeSync`. Ordinary UI never closes. Only
  Advanced `simulateProcessRestart` closes and nulls `driverRef`.
- Background: no handler. Handle is retained.
- Foreground: `AppState` `active` → `runInit("foreground")` →
  `recoverAfterLifecycle("foreground")` → `initializeApplication` →
  `prepareDatabase` (`PRAGMA` then migrate) on `openDriverIfAlive` =
  current `driverRef`. New `openDatabaseSync` only if `driverRef` is null.
- `lock_resume` exists in `lifecycle.ts` but `App.tsx` never sends it;
  lock/unlock would use the same `active` → foreground path.
- `runInit` is fire-and-forget; overlapping inits are possible.
- `ScoringPanel`: if `driver`/`enabled` become false, the effect returns
  without clearing `view`/`history`.

### Device sequence

Pre: unlocked; Previous games list; current label **9:42:04 AM** (user
games **9:41:21** and **9:42:04** appeared after cold-start recovery; not
created by this package). Not on the pin pad. Check game **8:15:39 AM**,
expected finished **289**.

1. Baseline Open 8:15:39: **289** shown. Diagnostics panel was expanded
   (`Hide advanced` visible); no diagnostic buttons were pressed.
2. HOME ~30s, `am start` `LaunchState=HOT`: no banner; 8:15:39 **289**
   still shown; list still contained that label.
3. HOME ~2 min (09:45:00–09:47:00), `am start` `LaunchState=HOT`, **same
   pid 31963**: **REPRODUCED**. Screenshot
   `%TEMP%\db-lifecycle\after-2min-fg.png`. Banner same as original
   incident. Logcat: `onHostPause` at HOME, HWUI `trimMemory(20)` then
   `trimMemory(40)` at ~09:46:00, `onHostResume` at return. No JS
   `execSync` stack in the pid dump. Stopped immediately. Did not Open,
   lock/unlock, force-stop, or recover.

Visible 8:15 / 289 / history after the banner is **React state from before
the failed `runInit`**, not a verified post-failure database read.

### Interpretation

Supported: failure on **in-process HOT foreground after ~2 min
background**, not requiring process death; 30s background did not fail.
Cold start recovery remains historically true.

Not confirmed: OEM freeze vs Expo native invalidation vs overlapping
init vs exact SQL (`PRAGMA` vs migrate vs later query). Not proven that
`driverRef` points at a closed handle (ordinary path does not close).

Smallest proposed next package (not authorized here): data-preserving
foreground recovery that **does not keep executing on a handle that just
failed `execSync`** — e.g. close/null on background or reopen via
`openDatabaseSync` on failed exec **without** deleting SQLite files — then
retest the 2-minute HOME/foreground path. Optional staged logs only if
that fix is not yet justified. No pin-detail work. Do not repeat this
lifecycle sweep without new evidence.

Artifacts: `%TEMP%\db-lifecycle\`.

## SQLite lifecycle recovery (2026-09-13)

Authorized data-preserving handle recovery. Does **not** prove the OEM/native
mechanism. Original 2-minute HOT `execSync` NPE remains historical FAIL
evidence.

```ini
WORK_PACKAGE=BOWLING_SQLITE_LIFECYCLE_RECOVERY
RESULT=READY_FOR_ACCEPTANCE_REVIEW
HEAD=94cfc4b8ef54cc7501b9dd143d948566fd861fa2
BRANCH=codex/first-use-scoring-presentation
APK_SHA256=78f3b12cc3686e46f1139a422447824f8c12ad216d5586347cee64aadbe4ef09
INSTALLED_APK_SHA256=78f3b12cc3686e46f1139a422447824f8c12ad216d5586347cee64aadbe4ef09
SIGNING_CERT_SHA256=fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c
INSTALL=adb_install_-r_Success
FIRST_INSTALL_TIME=2026-09-07_12:13:15
LAST_UPDATE_TIME=2026-09-13_10:41:30
HOT_PID=23573
COLD_RESTART_PID=26567
ROOT_TESTS=171/171_PASS
SERVER_TESTS=39/39_PASS
TYPECHECK=PASS
MOBILE_TYPECHECK=PASS
OVERALL_ACCEPTANCE=HOLD
FIELD_VALIDATION=PAUSED
COMMITS_CREATED=false
```

Implementation: `acquireSqliteDriverForLifecycle` probes with `SELECT 1`
(`exec` / native `execSync` path). On `NativeDatabase` / NPE / closed-db
class failures, at most one close + reopen of **the same**
`bowling-arch001.db` for that event. `createLifecycleInitGate` drops stale
publish. `initializeApplication` labels `[open]`, `[prepare]`, `[identity]`.
`ScoringPanel` shows leftover copy when storage is unavailable; Open/record
disabled. Foreground does not increment `processGeneration`. Process restart
does. Expo `openDatabaseSync` is still not proven to allocate a new native
pointer; close-then-open is the established adapter sequence.

Device (no Metro): after install, cold start restored newest **9:42:04 AM**
from persistence. Explicit Open **8:15:39 AM** finished **289**. HOME 30s
and two ~2 min HOME/HOT cycles kept pid **23573**, `LaunchState=HOT`, no
banner; Open 8:15 still **289**. Force-stop cold start pid **26567**, newest
**9:42:04 AM**; history still lists 9:12, 8:15, 8:10, 11:50, 11:34.

Artifacts: `%TEMP%\sqlite-lifecycle\`.

## SQLite recovery P2 closure (2026-09-13)

Authorized bounded remediation of the two recorded lifecycle P2 findings
only. Does **not** prove the original OEM/native `execSync` NPE cause.
Historical 2-minute HOT FAIL (pid 31963) and later type-B resumes (pid
23573, no observed reopen) remain on the record.

```ini
WORK_PACKAGE=BOWLING_SQLITE_RECOVERY_P2_CLOSURE
RESULT=READY_FOR_ACCEPTANCE_REVIEW
HEAD=94cfc4b8ef54cc7501b9dd143d948566fd861fa2
BRANCH=codex/first-use-scoring-presentation
FRESH_CONNECTION_OPTION_VERIFIED=expo-sqlite@57.0.2_SQLiteOpenOptions.useNewConnection
APK_SHA256=94881bdf05d55c1e9069aebd1bd0c32db68f3941c26ea8ccfbb026a379289405
INSTALLED_APK_SHA256=94881bdf05d55c1e9069aebd1bd0c32db68f3941c26ea8ccfbb026a379289405
SIGNING_CERT_SHA256=fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c
INSTALL=adb_install_-r_Success
FIRST_INSTALL_TIME=2026-09-07_12:13:15
LAST_UPDATE_TIME=2026-09-13_14:51:52
HOT_PID=12267
DEVICE_NATURAL_RESUME=PASS_WITHOUT_RECOVERY_PATH
DEVICE_RECOVERY_EVIDENCE=INJECTED
ROOT_TESTS=178/178_PASS
SERVER_TESTS=39/39_PASS
TYPECHECK=PASS
MOBILE_TYPECHECK=PASS
OVERALL_ACCEPTANCE=HOLD
FIELD_VALIDATION=PAUSED
COMMITS_CREATED=false
```

### Implementation

- Recovery `openMobileDatabase({ freshNativeConnection: true })` →
  `openDatabaseSync(name, { useNewConnection: true })` on the same
  `bowling-arch001.db`. Default launch open does not set the flag.
- `closeSqliteDriver` records `not_needed` | `closed` | `already_closed` |
  `close_failed`. Never reports `closed` on throw. Detached handle is not
  reused. Non-native close failure does not open a second connection.
- `runLifecycleRecoveryPass` / `createSqliteLifecycleController` are the
  shared orchestration. App and tests use them. One native reopen per
  event (`nativeReopenUsed`).
- Advanced diagnostics (no game contents): recoveryAttempted, close,
  newConnection, init, published, injected, stages. `console.log`
  `bowling.sqliteRecovery …` (not observed in this release logcat dump).
- One-shot post-probe fault: Advanced “Arm one recovery test”, off by
  default, consumed on the next foreground/lock_resume after a successful
  `SELECT 1`, fails the next non-probe `exec`, then auto-disarms. Launch
  does not consume it. **Dormant Advanced control remains** in the
  candidate.

### Automated coverage (shared implementation)

Post-probe native-like init failure → one `open_fresh` → init ok; close
failure handling; reopen throw stays `DATABASE_OPEN_FAILED`; recovered
connection init failure does not loop; overlapping lifecycle cannot
publish/reuse the closed driver.

### Device

Natural ~2 min HOME then `am start` `LaunchState=HOT`, same pid **12267**.
Selected **8:15:39 AM** finished **289**. Advanced line:

`recoveryAttempted=false close=not_needed newConnection=false init=ok published=true injected=false stages=probe_ok,init_ok,published`

**INJECTED** (not OEM reproduction): Arm one recovery test → Recover from
database. Advanced line:

`recoveryAttempted=true close=closed newConnection=true init=ok published=true injected=true stages=probe_ok,injected_post_probe_fault,recovery_attempted,close:closed,open_fresh,probe_ok,init_ok,published`

`RECOVERY TEST=disarmed` afterward. Persistence reread: same 8:15 **289**.
History still lists **9:42:04 AM**, **9:41:21 AM**, and prior acceptance
games. No uninstall/clear/DB delete.

Artifacts: `%TEMP%\sqlite-p2\`.

## SQLite recovery P2 acceptance (2026-09-13)

Documentation and disposition only. Application code, tests, Gradle, and
the device were not changed or rerun. Provenance matches the recorded
closure candidate.

```ini
WORK_PACKAGE=BOWLING_SQLITE_RECOVERY_P2_ACCEPTANCE
RESULT=PASS
HEAD=94cfc4b8ef54cc7501b9dd143d948566fd861fa2
BRANCH=codex/first-use-scoring-presentation
APK_SHA256=94881bdf05d55c1e9069aebd1bd0c32db68f3941c26ea8ccfbb026a379289405
LOCAL_APK_HASH_MATCH=true
RECORDED_ROOT_TESTS=178/178_PASS_NOT_RERUN
RECORDED_SERVER_TESTS=39/39_PASS_NOT_RERUN
RECORDED_TYPECHECKS=PASS_NOT_RERUN
P2_CONNECTION_CACHE=CLOSED
P2_RECOVERY_COVERAGE=CLOSED
ORIGINAL_NATIVE_CAUSE=UNCONFIRMED
OVERALL_ACCEPTANCE=HOLD
FIELD_VALIDATION=PAUSED
APPLICATION_CODE_CHANGED=false
COMMITS_CREATED=false
```

### P2 — Connection cache: CLOSED

Acceptance was that recovery request a new native connection to the same
file via the supported Expo option, without changing database name,
location, migrations, or contents.

Verified in source: `openExpoSqliteDriver(..., { freshNativeConnection: true })`
calls `SQLite.openDatabaseSync(name, { useNewConnection: true })`. App
recovery opener is `openMobileDatabase({ freshNativeConnection: true })`.
Launch still uses the default open.

Native-like close-failure branch (`detachAfterClose` in
`runLifecycleRecoveryPass`):

- `closeSqliteDriver` records `closed` | `already_closed` | `close_failed`
  | `not_needed`. Throw never becomes `closed`.
- The function always returns `{ current: null }`. The local `driver` is
  nulled before any `openFresh`. Controller `current` is replaced by
  `pass.current` only.
- Pending overlapping work cannot begin (`createLifecycleInitGate`); a
  superseded ticket cannot publish. ScoringPanel is given
  `controller.getDriver()` only when the published screen is ready; leftover
  views are labeled not a live read.
- Proceed after native-like `close_failed` is allowed only after that
  detach, then `openFreshSameDatabase` (`useNewConnection: true`). This
  does **not** prove Expo has fully exclusive native ownership of the old
  pointer.
- Unhandled (non-native) `close_failed` returns `DATABASE_OPEN_FAILED` and
  does not open a second connection (automated test on the same pass).

`useNewConnection` closes the recorded cache-default finding. It is not a
universal native-ownership proof.

### P2 — Recovery coverage: CLOSED

Acceptance was automated coverage of the real orchestration plus device
evidence of the recovery stages, without requiring OEM-cause proof.

Automated: `tests/mobile.lifecycle-handle.test.ts` post-probe test invokes
`runLifecycleRecoveryPass` with `consumePostProbeFault: () => true`, asserts
one `openFreshSameDatabase`, `recoveryAttempted`, `injectedPostProbeFault`,
`newConnectionOpened`, `close=closed`, init ok, and persisted facts.

Device **INJECTED** (Advanced, then Recover; not OEM):

`recoveryAttempted=true close=closed newConnection=true init=ok published=true injected=true stages=probe_ok,injected_post_probe_fault,recovery_attempted,close:closed,open_fresh,probe_ok,init_ok,published`

Persistence reread: **8:15:39 AM** finished **289**.

Device **type B natural** (~2 min HOME/HOT, pid 12267), kept distinct:

`recoveryAttempted=false close=not_needed newConnection=false init=ok published=true injected=false stages=probe_ok,init_ok,published`

Historical FAIL: ~2 min HOT `NativeDatabase.execSync` NPE, pid 31963.
Historical hung `adb install -r` (lock / Play Protect) is a failed shell
attempt, not a captured successful observation of this APK.

### Diagnostic control (not a P2; not changed)

Advanced “Arm one recovery test” / “Disarm recovery test”:

- Default `postProbeArmed=false`; React `faultArmed` starts false.
- In-memory only (not persisted).
- Requires opening Advanced (collapsed by default) and tapping Arm.
- Consumed once; launch does not consume.
- Wrapper throws before `inner.exec` on the next non-`SELECT 1` statement;
  no fact mutation.
- Ordinary scoring, history Open, and pin pad do not arm it. After Arm,
  the next `AppState` `active` or Recover can fire it.

**Local acceptance candidate: suitable to retain.** Not approved
production behavior. Overall acceptance needs a separate retain / remove /
harden authorization. This package did not remove or harden it.

### Remaining overall gates (not closed here)

`USER_WALKTHROUGH=HOLD`; first-use overall not established;
`SQLITE_RECOVERY_DIAGNOSTIC_CONTROL_DISPOSITION`;
`DIRECT_FRAME_CORRECTION_SELECTION`; `PIN_DETAIL_REQUIREMENTS`;
`FIELD_VALIDATION=PAUSED`; original native cause unconfirmed (not required
to close these P2s).

## Local diagnostic disposition (2026-09-13)

Documentation only. Application code and the diagnostic control were not
changed. Candidate identity and safeguards match the reviewed P2 evidence.

```ini
WORK_PACKAGE=BOWLING_LOCAL_DIAGNOSTIC_DISPOSITION
RESULT=PASS
HEAD=94cfc4b8ef54cc7501b9dd143d948566fd861fa2
BRANCH=codex/first-use-scoring-presentation
APK_SHA256=94881bdf05d55c1e9069aebd1bd0c32db68f3941c26ea8ccfbb026a379289405
DIAGNOSTIC_DISPOSITION=RETAIN_LOCAL_ACCEPTANCE_ONLY
PRODUCTION_DIAGNOSTIC_APPROVAL=false
P2_CONNECTION_CACHE=CLOSED
P2_RECOVERY_COVERAGE=CLOSED
TENTH_FRAME_DEFECT=CLOSED
INVALID_REPAIR_UI=PASS
SQLITE_DIAGNOSTIC_DISPOSITION=RESOLVED_FOR_LOCAL_ACCEPTANCE
ORIGINAL_NATIVE_CAUSE=UNCONFIRMED
OVERALL_ACCEPTANCE=HOLD
FIELD_VALIDATION=PAUSED
APPLICATION_CODE_CHANGED=false
COMMITS_CREATED=false
```

Architecture Authority retains the existing one-shot recovery diagnostic in
this **local acceptance candidate only**. It is not production-approved.

Preserved user first-use observations (2026-09-12; not invented; this
package did not coach): understood the app’s purpose; starting was very
simple; entry worked except the subsequently closed tenth-frame defect;
correction worked, with a preference for direct frame selection; reopening
worked. Coaching necessity is not invented.

Current first-use package gate: confirmation that first-use is accepted
now that the tenth-frame defect is closed. Do not require a new walkthrough
merely to restated those observations.

Deferred product requests, **not** current first-use blockers: direct
frame selection for correction; pinfall plus numbered standing-pin
observations and per-game/historical analysis (recorded, not implemented).
Real-lane field validation remains later and unexecuted.

## User first-use acceptance and history new-game placement (2026-09-13)

The user stated: “No Obstacles. Accept.” They also asked that Start a new
game sit at the top of Previous games / history instead of the bottom.

```ini
WORK_PACKAGE=BOWLING_HISTORY_NEW_GAME_PLACEMENT
RESULT=READY_FOR_LOCAL_BASELINE_REVIEW
USER_FIRST_USE_DECISION=ACCEPT
USER_REPORTED_OBSTACLES=NONE
COACHING_HISTORY=NOT_CONFIRMED
PRIOR_ACCEPTED_APK_SHA256=94881bdf05d55c1e9069aebd1bd0c32db68f3941c26ea8ccfbb026a379289405
LAYOUT_APK_SHA256=8edb6e2dda5818c7594cd010117d804d9b80332f7a40d23c34e37f279333e786
INSTALLED_APK_SHA256=8edb6e2dda5818c7594cd010117d804d9b80332f7a40d23c34e37f279333e786
USER_TESTED_UPDATED_PLACEMENT=false
HEAD=94cfc4b8ef54cc7501b9dd143d948566fd861fa2
BRANCH=codex/first-use-scoring-presentation
FIRST_INSTALL_TIME=2026-09-07_12:13:15
LAST_UPDATE_TIME=2026-09-13_19:16:59
FIELD_VALIDATION=PAUSED
COMMITS_CREATED=false
```

User acceptance is of the **prior** local candidate (`94881bdf…`). Coaching
history is not confirmed. Closed findings (tenth-frame, invalid-repair UI
agent PASS, SQLite P2s, local diagnostic retain) are not reopened.

Layout follow-on (technically verified, not user-tested): in Previous
games, **Start a new game** is above the list; scoring chrome does not
keep a second history copy. `startGame` behavior unchanged. Focused tests
30/30; both typechecks PASS.

Device (agent): many listed games; one **Start a new game** at top of the
history view; listing did not create a game; activating the control created
**9/13/2026, 7:21:04 PM** and left older games including **9:42:04 AM** and
**8:15:39 AM**. Artifacts: `%TEMP%\history-placement\`.

## Local first-use baseline (2026-09-13)

Documentation closure for the local feature-branch baseline. Application
and test bytes were not changed in this documentation pass.

```ini
WORK_PACKAGE=BOWLING_FIRST_USE_LOCAL_BASELINE
LOCAL_FIRST_USE_PACKAGE_ACCEPTED=true
HISTORY_PLACEMENT_TECHNICALLY_VERIFIED=true
USER_TESTED_FINAL_PLACEMENT=false
USER_ACCEPTANCE_APK=94881bdf05d55c1e9069aebd1bd0c32db68f3941c26ea8ccfbb026a379289405
FINAL_PLACEMENT_APK=8edb6e2dda5818c7594cd010117d804d9b80332f7a40d23c34e37f279333e786
PARENT=94cfc4b8ef54cc7501b9dd143d948566fd861fa2
PARENT_TREE=4582a137cbb13fd396c3a1d6904de16f39a6a86b
INTEGRATION_PENDING=true
FIELD_VALIDATION=PAUSED
PRODUCTION_RELEASE_AUTHORIZED=false
TENTH_FRAME_DEFECT=CLOSED
P2_CONNECTION_CACHE=CLOSED
P2_RECOVERY_COVERAGE=CLOSED
INVALID_REPAIR_UI=PASS
SQLITE_DIAGNOSTIC=RETAIN_LOCAL_ACCEPTANCE_ONLY
ORIGINAL_NATIVE_CAUSE=UNCONFIRMED
REGRESSION_PRE_PLACEMENT=178/178_ROOT_39/39_SERVER_BOTH_TYPECHECKS
FINAL_PLACEMENT_FOCUSED=30/30_BOTH_TYPECHECKS
LINE_ENDINGS=core.autocrlf=true_working_tree_CRLF_git_blobs_LF
```

User first-use acceptance remains scoped to APK `94881bdf…`. The placement
APK is agent-verified, not user-tested. No new general walkthrough is
required. Direct frame selection and numbered pin observations /
per-game/historical analysis stay future requirements.






