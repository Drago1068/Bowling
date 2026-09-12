# ARCH-001 Slice 6 implementation evidence

This record is implementation, automated-test, physical-device, and
Architecture Authority implementation-acceptance evidence for
`ARCH-001_SLICE_6_SCORING_FIRST_DEVICE_SHELL`. Historical Slice 3 HOLD,
Slice 4 `ADB_AND_MOBILE_ACCEPTANCE_ENABLEMENT`, Slice 5
`DEBUG_ARTIFACT_REQUIRES_METRO`, later Slice 5 PASS dispositions, and the
Slice 6 locked-device install HOLD are preserved and not rewritten. This
feature-branch commit locally closes Slice 6. Merge, push, tag, and
production release remain unauthorized. The local `assembleRelease` APK is
an acceptance artifact, not a production store release.

```ini
WORK_PACKAGE=BOWLING_SLICE_6_LOCAL_BASELINE_COMMIT
WORKING_BRANCH=codex/arch-001-slice-6-scoring-first-shell
PARENT_HEAD=e45358d0e8129b248a40d0b68c3b8b959e0642a8
PARENT_TREE=f40749ae2c0785dd670d81ea937ba2ceb927e5fa
ACCEPTANCE_TAG=v0.5.0-arch001-slice5
TAG_OBJECT=50ed9b487014cefa32816c0666ac914bff43c73b
PEELED_TARGET=e45358d0e8129b248a40d0b68c3b8b959e0642a8
IMPLEMENTATION_AUTHORIZED=true
COMMIT_AUTHORIZED=true
MERGE_AUTHORIZED=false
RESULT=PASS
SLICE_6_IMPLEMENTATION_ACCEPTED=true
SLICE_6_LOCALLY_CLOSED=true
LOCAL_BASELINE_COMMIT_PENDING=false
INTEGRATION_PENDING=true
OPEN_FINDINGS=NONE
```

## Starting baseline

Verified before implementation:

```ini
REMOTE_ORIGIN=https://github.com/Drago1068/Bowling.git
INTEGRATION_BRANCH=arch/001-domain-sync-foundation
COMMIT=e45358d0e8129b248a40d0b68c3b8b959e0642a8
TREE=f40749ae2c0785dd670d81ea937ba2ceb927e5fa
TAG=v0.5.0-arch001-slice5
TAG_TYPE=annotated
PEELED_TARGET=e45358d0e8129b248a40d0b68c3b8b959e0642a8
```

Expected uncommitted documentation was preserved and carried onto
`codex/arch-001-slice-6-scoring-first-shell` (parent `e45358d`; branch created
from that commit; not reset):

- `docs/adr/ADR-005-scoring-first-device-shell.md`
- `PROJECT_STATUS.md`
- `README.md`

No unexpected application changes were present at branch creation. Android
Gradle/build intermediates were present on disk and were not treated as
source.

## Changed files (uncommitted)

- `docs/adr/ADR-005-scoring-first-device-shell.md` (requirements, carried)
- `PROJECT_STATUS.md`
- `README.md`
- `apps/mobile/App.tsx`
- `apps/mobile/src/scoringPanel.tsx`
- `src/shellPresentation.ts` (presentation helper; not a canonical field)
- `tests/shell.presentation.test.ts` (three focused disclosure tests)
- `docs/evidence/arch-001-slice-6-implementation.md` (this file)

No migrations, lockfiles, Gradle, signing, or dependency manifests were
changed. Domain scoring, identity, corrections, persistence, outbox, receipts,
and sync were not changed.

## Implementation notes

Presentation only, matching ADR-005:

- Primary surface is current game identity, pinfall, derived sheet, and
  correction, with New Game and History on that surface.
- History list remains on demand (`historyOpen` default false). Empty-state
  copy still requires an explicit new game.
- Diagnostics remain complete (recovery, simulated network, simulate process
  restart, expo-sqlite conformance, status copy) behind a labeled disclosure
  defaulting closed.
- Disclosure state is React-only (`INITIAL_SHELL_DISCLOSURES`); not persisted.
  Toggle helpers do not rewrite in-session `selectedGameId`.
- `SafeAreaView`, `KeyboardAvoidingView`, and extra bottom padding keep
  controls above system bars/keyboard; scrolling remains available.
- Slice 4/5 restart-to-newest, labels, order, and selection semantics are
  unchanged.

`shellPresentation.ts` lives under `src/` so root `tsc` with
`verbatimModuleSyntax` typechecks it. Mobile `package.json` was not given
`"type": "module"`.

## Candidate hashes (working tree, Windows CRLF)

Recorded so this uncommitted tree can be tied to automated results and the
built APK. Git blobs may differ if line endings are normalized.

```ini
App.tsx=cc51b7d025824901872b4735ef7eb58525daf32a7fcb4e6db31d9ee3d99f74e0
scoringPanel.tsx=ffdc67b26dbb339454940b171107e2f1195ad0a306d995477af30f847f1276a9
shellPresentation.ts=1de2f98dcc1e3c78d53c9e894daae3eb42d7adce61f7728fade2c0f238aaa2a1
shell.presentation.test.ts=b0fa028e2c5825713ca407e63eeb08edb5b8496833d87d9d652f4a768e7e368d
```

## Automated acceptance

Commands run after the presentation edits. Counts vs Slice 5 baseline 150
root / 39 server: root is 153 because of the three new
`tests/shell.presentation.test.ts` cases. Server suite unchanged.

```ini
ROOT_TESTS=153/153_PASS
COMMAND=npm test
JUSTIFICATION=+3_SHELL_PRESENTATION_DISCLOSURE_TESTS
SERVER_TESTS=39/39_PASS
COMMAND=process-only DATABASE_URL=postgresql://bowling:bowling@127.0.0.1:15433/bowling npm run test:server -- --test-concurrency=1
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

## Acceptance APK (built; later verified installed)

Self-contained `assembleRelease` / `export:embed` path. Not a production
store release. Candidate identity was re-verified before device work; hashes
matched the implementation package, so the APK was not rebuilt and automated
gates were not rerun.

```ini
APK_PATH=apps/mobile/android/app/build/outputs/apk/release/app-release.apk
APK_SHA256=406ccca87c1e0d1a5641934fc0e7b78fd8a3fa7a77f414cbc23abd2435bb2a70
EMBEDDED_JS=assets/index.android.bundle
BUNDLE_BYTES=1350256
PACKAGE=com.drago1068.bowling
VERSION=0.1.0/1
SIGNING_CERT_SHA256=fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c
SIGNING_MATCH_INSTALLED=true
APK_PROVENANCE_VERIFIED=true
AUTOMATED_EVIDENCE_STATUS=REUSED_UNCHANGED_CANDIDATE
```

## Physical device acceptance — historical HOLD (locked install)

```ini
DEVICE=Samsung SM-S936U serial R3CY40E6FVJ
PHYSICAL_DEVICE_ACCEPTANCE=HOLD
OFFLINE_ACCEPTANCE=HOLD
LAYOUT_EVIDENCE_RECORDED=false
EXISTING_DEVICE_DATA_PRESERVED=true
OPEN_FINDINGS=DEVICE_LOCKED_BLOCKING_DATA_PRESERVING_INSTALL
```

`adb devices` showed `device`. Lock screen / notification shade remained
active (`mDreamingLockscreen=true`, `mCurrentFocus=NotificationShade`).
Two `adb install -r` attempts hung and were terminated (`exit 4294967295`).
Installed package identity **immediately after abort**:

```ini
PACKAGE=com.drago1068.bowling 0.1.0/1
firstInstallTime=2026-09-07 12:13:15
lastUpdateTime=2026-09-11 18:35:16
```

That HOLD is historical. It is not rewritten as an earlier PASS.

## Physical device acceptance — completion (this package)

Before retrying install, the device was unlocked (`mDreamingLockscreen=false`,
launcher focused). No hung `adb install` processes remained. Pulled
`base.apk` SHA-256 matched the acceptance artifact
`406ccca87c1e0d1a5641934fc0e7b78fd8a3fa7a77f414cbc23abd2435bb2a70`
(embedded JS 1350256 bytes; signing cert
`fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`).
`lastUpdateTime=2026-09-11 21:42:38` with `firstInstallTime` still
`2026-09-07 12:13:15`. Termination of the earlier hung ADB sessions did
**not** prove the PackageInstaller session failed; the candidate was already
installed as a data-preserving update. This package did **not** run another
`adb install -r`.

```ini
INSTALL_RESULT=NOT_RERUN_ALREADY_INSTALLED_CANDIDATE_MATCH
INSTALLED_ARTIFACT_VERIFIED=true
UNINSTALL=false
CLEAR_DATA=false
DATA_PRESERVING_UPDATE=true
EXISTING_DEVICE_DATA_PRESERVED=true
```

Offline / Metro during ADR-005 gates:

```ini
AIRPLANE_MODE=1
WIFI=disabled_during_gates
CELLULAR=disabled_during_gates
ADB_REVERSE_8081=absent
ADB_REVERSE_PRESERVED=tcp:8091;tcp:8000->8011
METRO_UNAVAILABLE=true
UNABLE_TO_LOAD_SCRIPT=false
COLD_LAUNCH=LaunchState_COLD_Status_ok
DISPLAY=1440x3120
INPUT_SHOWN=false
```

Screenshots (host temp, not committed):
`C:\Users\Drago\AppData\Local\Temp\slice6-device\`
(`s6-cold.png`, `s6-newgame-primary.png`, `s6-recorded.png`,
`s6-corrected.png`, `s6-history`/`s6-switched-resume.png`,
`s6-diagnostics.png`, `s6-relaunch.png`,
`s6-resume-01a08d84-primary.png`).

Observed:

- Cold launch: **Offline scoring** first; newest then
  `01a092a6-31f7-7c6d-a614-890937a07e57`; **New game** and **History** on
  the primary surface (y≈547); pinfall **ENTER ROLL (F1 R1)**; diagnostics
  collapsed (`Diagnostics`, not expanded recover/network/restart/conformance).
- History on demand listed 30 local games including Sep 7–8 user rows and
  Slice 5 acceptance labels; no truncation. Sep 7–8 rows were listed only
  (not opened or edited).
- Disclosure: hide History kept
  `01a092a6…`; expand Diagnostics showed Recover / Simulated network /
  Simulate process restart / expo-sqlite conformance; hide Diagnostics
  returned to the same selected game. Expanding diagnostics while scrolled
  can move the Game line off-screen; collapsing restored the same id.
- Acceptance new game `01a093b9-3bbf-7e96-82c4-0316775cdf18`
  (`9/11/2026, 11:46:25 PM`): record 4 then correct to 3; sheet `F1 3 |
  partial`, `corrections: 1`.
- Switch/resume: opened `01a08e15-8d35-7911-a7de-e4af60e04631` (empty
  Slice 5 newest-after-install) then `01a08d85-197f-72e7-b974-3cff5f3e691e`
  with preserved `F1 7 | partial`, `corrections: 2` (Slice 5 correction
  not overwritten).
- Force-stop/relaunch COLD opened newest `01a093b9…` with `F1 3` and
  `corrections: 1`.
- Layout: New game/History/enter pins clear of status bar and 3-button
  nav. Diagnostics disclosure sits just above the nav bar (text bounds
  y=2944–3016 on 3120-tall display). Pinfall uses on-screen buttons, not
  an IME (`mInputShown=false`). No system-phone UI from primary taps.

```ini
PHYSICAL_DEVICE_ACCEPTANCE=PASS
OFFLINE_ACCEPTANCE=PASS
LAYOUT_EVIDENCE_RECORDED=true
RESTART_SELECTS_NEWEST=PASS
OPEN_FINDINGS=NONE
```

## Confirmatory device retest (2026-09-12)

Same work package re-authorized. Candidate SHA-256 values and APK
`406ccca87c1e0d1a5641934fc0e7b78fd8a3fa7a77f414cbc23abd2435bb2a70` unchanged;
automated gates not rerun. Device unlocked (`mDreamingLockscreen=false`).
No hung `adb install` processes. Pulled `base.apk` again matched the
acceptance artifact. `lastUpdateTime` still `2026-09-11 21:42:38`. No
`adb install -r` this run. No new acceptance game created.

Offline COLD launch without Metro: scoring first on `01a093b9…`
(`F1 3`, `corrections: 1`); New game/History reachable; Diagnostics
collapsed. History still 30 rows including Sep 7–8 (listed only). Switched
to `01a08d85…` `F1 7` / 2 corrections; hide History kept that selection.
Diagnostics expanded (Recover / Simulated network / Simulate process
restart / expo-sqlite conformance) then collapsed; selection remained
`01a08d85…`. Force-stop/relaunch COLD opened newest `01a093b9…`.
`Unable to load script` absent. Screenshots `s6c-cold.png`,
`s6c-history.png`, `s6c-resume-primary.png`,
`s6c-diagnostics-controls.png`, `s6c-relaunch.png`.

A `tap_exact("Diagnostics")` that first swiped to the bottom opened the
system app drawer (control bounds y=2944–3016 on 1440x3120, adjacent to
the 3-button nav). That is recorded as automation/nav adjacency, not a
scoring defect: a later tap on the disclosure after a small scroll opened
diagnostics, and primary New game / History / pinfall remained clear of
the nav (y≈547 / enter-roll mid-screen). Historical hung installs remain
HOLD, not rewritten.

```ini
CONFIRMATORY_RETEST=PASS
INSTALL_RESULT=NOT_RERUN_ALREADY_INSTALLED_CANDIDATE_MATCH
NEW_GAME_CREATED=false
```

## Formal implementation acceptance (this package)

Architecture Authority verified the uncommitted candidate against ADR-005.
HEAD `e45358d` / tree `f40749ae` is the Slice 5 parent; implementation identity
is the working-tree hashes below plus APK
`406ccca87c1e0d1a5641934fc0e7b78fd8a3fa7a77f414cbc23abd2435bb2a70`. Those
hashes still match the files on disk. No rebuild, reinstall, or test rerun.

Gate support (explicit recorded outcomes, not inferred):

- Automated: root `153/153` PASS (+3 disclosure tests); server `39/39` PASS;
  typecheck PASS; mobile typecheck PASS. Candidate hashes match.
- Offline cold launch without Metro: scoring-first on `01a092a6` then, after
  the acceptance new game, `01a093b9`; `Unable to load script` absent.
- New Game and History on the primary surface (screenshots; y≈547).
- History listed 30 games including Sep 7–8 user rows (listed only).
- Switch/resume: `01a08e15`, then `01a08d85` with preserved `F1 7` /
  `corrections: 2` (existing Slice 5 facts; not counted as a Slice 6
  correction execution).
- Executed Slice 6 correction: new game `01a093b9`, record pinfall `4`,
  correct to `3`; sheet `F1 3 | partial`, `corrections: 1` (screenshots
  `s6-recorded.png`, `s6-corrected.png`). Other games remained listed.
- Diagnostics collapsed on cold launch; Recover / Simulated network /
  Simulate process restart / expo-sqlite conformance reachable when
  expanded; hide History / hide Diagnostics kept the selected game.
- Layout: New game, History, and pinfall/correction targets clear of the
  status bar and 3-button nav. Keyboard not shown (`mInputShown=false`).
  Diagnostics disclosure sits adjacent to the nav (y=2944–3016); primary
  scoring controls do not.
- Force-stop/relaunch COLD selected newest `01a093b9`.
- `firstInstallTime=2026-09-07 12:13:15` unchanged. Two hung `adb install -r`
  attempts (`exit 4294967295`) remain historical HOLDs; they are not claimed
  as successful commands. Later pulled `base.apk` matched the built APK and
  `lastUpdateTime=2026-09-11 21:42:38`.

```ini
SLICE_6_IMPLEMENTATION_ACCEPTED=true
AUTOMATED_ACCEPTANCE=PASS
PHYSICAL_DEVICE_ACCEPTANCE=PASS
OFFLINE_ACCEPTANCE=PASS
SLICE_6_LOCALLY_CLOSED=true
LOCAL_BASELINE_COMMIT_PENDING=false
SLICE_6_FORMALLY_CLOSED=true
INTEGRATION_PENDING=true
PRODUCTION_RELEASE=false
MERGE_PERFORMED=false
PUSH_PERFORMED=false
TAG_PUBLISHED=false
PRODUCTION_RELEASE_PERFORMED=false
NAS_ACCESSED=false
OTHER_PROJECTS_ACCESSED=false
SLICE_7_IMPLEMENTATION_AUTHORIZED=false
NEXT_ACTION=POST_SLICE_6_READ_ONLY_INTEGRATION_REVIEW
```
