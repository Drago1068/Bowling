# Slice 6 one-game field validation

Protocol for **one bowler, one real ten-pin game** on the accepted Slice 6
app. This file is preparation only. It does **not** mean field testing has
run. A lab simulation does **not** establish real-lane usability.

**Paused.** The user later accepted first-use of the local presentation
candidate (“No Obstacles. Accept.”). Real-lane validation is still
**unexecuted** and remains paused. A lab simulation does **not** establish
real-lane usability. Do not start this protocol until Architecture
Authority separately authorizes a field session.

```ini
BASELINE_COMMIT=94cfc4b8ef54cc7501b9dd143d948566fd861fa2
BASELINE_TREE=4582a137cbb13fd396c3a1d6904de16f39a6a86b
ACCEPTANCE_TAG=v0.6.0-arch001-slice6
DEVICE=Samsung_R3CY40E6FVJ
PACKAGE=com.drago1068.bowling
ACCEPTANCE_APK_SHA256=406ccca87c1e0d1a5641934fc0e7b78fd8a3fa7a77f414cbc23abd2435bb2a70
PRODUCTION_RELEASE=false
FIELD_VALIDATION=PAUSED
FIRST_USE_USABILITY=REQUIREMENTS_ACCEPTED
USER_WALKTHROUGH=ACCEPT
IMPLEMENTATION_AUTHORIZED=false
LOCAL_FIRST_USE_PACKAGE_ACCEPTED=true
```

Do not deliver a ball while interacting with the phone. Pause between shots.
Do not uninstall, clear data, or edit existing user games. Do not change
application code. If scoring disagrees with the lane or rolls, or data looks
lost: **stop**, keep screenshots/notes, do not “fix” the database.

A PASS here is not Bowling v1 or store readiness.

---

## Bowler checklist (short)

Before

1. Confirm the Bowling app on `R3CY40E6FVJ` (package `com.drago1068.bowling`).
   Record version if shown. Do not rebuild or install in this protocol.
2. Note airplane / Wi-Fi / cellular. Offline is claimed only if those are
   verified off (or airplane on) for the whole game.
3. Open **History**, confirm old games are listed, then **Hide history**.
   Do not open Sep 7–8 user games to edit them.
4. Tap **New game**. Copy the **Game:** id. That is the field-test game.
5. Keep a paper/phone-notes list of actual pinfall as you see it, and glance
   at the house score display for completed frames.

During (between shots only)

6. Enter the pinfall you observed (`0`–`10`). Do not invent pins.
7. After each frame you complete, check the app sheet vs your notes and the
   lane display. If they disagree, write both and the roll sequence; stop
   if you cannot explain it.
8. Note: pace (kept up / fell behind), whether current frame and score are
   readable, accidental taps, nav-bar hits, keyboard, help needed.

After the tenth frame

9. Photograph or copy the app sheet, your roll list, and the lane final if
   shown.
10. **History** → reopen the field-test game by its time label / id. Facts
    and score must match.
11. Open a **different** existing game (acceptance game OK). Do not change
    it. Return to the field-test game; it must be unchanged.
12. At a break (not mid-approach): force-stop the app, relaunch. Restart
    opens the **newest** persisted game (ADR-004/005). If that is the field
    game, good. Then **History** → reopen the field game; facts/score intact.
13. Correction: if you mistyped during the real game, correct that roll and
    note it. If you did not, **do not** alter the real game. Create a
    **supplemental** new game, enter a few rolls, correct one, record that
    separately.

Verdict: `PASS` / `HOLD` / `FAIL` using the definitions below.

---

## Verdicts

| Result | Meaning |
| --- | --- |
| **PASS** | Required checks completed. No blocking scoring, persistence, or usability defect. |
| **HOLD** | No lane session, incomplete evidence, or a required check unresolved. |
| **FAIL** | Blocking scoring error, apparent data loss, or unusable at the lane. |

---

## Results form (fill during/after the session)

```ini
DATE=
DEVICE_SERIAL=R3CY40E6FVJ
APP_PACKAGE=com.drago1068.bowling
APP_VERSION_OBSERVED=
APK_SHA256_VERIFIED=unknown_or_406ccca87c1e0d1a5641934fc0e7b78fd8a3fa7a77f414cbc23abd2435bb2a70
CONNECTIVITY=online|offline_verified|mixed
AIRPLANE=
WIFI=
CELLULAR=
FIELD_GAME_ID=
FIELD_GAME_LABEL=
EXISTING_GAMES_PRESERVED=
LANE_HOUSE_SCORE_AVAILABLE=
ASSISTANCE_NEEDED=
WORKAROUNDS=
INCOMPLETE_CHECKS=
SEVERITY_WORST=none|P2|P1|P0
VERDICT=PASS|HOLD|FAIL
```

### Observed rolls (authoritative notes — what you saw, not what the app “should” be)

Write pinfall per ball. Example: `F1 7,2 / F2 10 / …`

```
F1
F2
F3
F4
F5
F6
F7
F8
F9
F10
NOTES_ON_UNSURE_SHOTS=
```

House / comparison

```
APP_DERIVED_SHEET_OR_FINAL=
HOUSE_DISPLAY_COMPLETED_FRAMES_AND_FINAL=
SEQUENCE_MATCHES_APP=yes|no|unknown
SEQUENCE_MATCHES_HOUSE=yes|no|unknown|house_unavailable
DISCREPANCY_INVESTIGATION=
STOPPED_FOR_EVIDENCE=false|true
```

During play

```
PACE=kept_up|fell_behind|not_assessed
CURRENT_FRAME_READABLE=
SCORE_READABLE=
CONTROLS_REACHABLE_BETWEEN_SHOTS=
ACCIDENTAL_TAPS=
NAV_OR_SYSTEM_UI=
DELAYS=
```

After play

```
HISTORY_REOPENED_FIELD_GAME=
FACTS_AND_SCORE_INTACT_AFTER_REOPEN=
SWITCHED_TO_OTHER_GAME_ID=
OTHER_GAME_UNMODIFIED=
RETURNED_TO_FIELD_GAME_INTACT=
FORCE_STOP_RELAUNCH_OPENED_NEWEST=
NEWEST_GAME_ID_AFTER_RELAUNCH=
FIELD_GAME_INTACT_AFTER_RELAUNCH_REOPEN=
SCREENSHOTS_OR_NOTE_PATHS=
```

Correction (real game **or** supplemental — not both mixed)

```
CORRECTION_CONTEXT=real_game_mistake|supplemental_game|not_done
SUPPLEMENTAL_GAME_ID=
ROLL_BEFORE=
ROLL_AFTER=
SHEET_AFTER_CORRECTION=
```

---

## Stop conditions

- Scoring mismatch you cannot reconcile with the written roll sequence.
- Field-game facts missing, swapped, or replaced by another game.
- App unusable between shots without unsafe phone use.
- Required after-play History / restart checks cannot be completed.

Preserve evidence. Do not clear app data or rewrite SQLite to “recover.”

---

## First-use walkthrough (not run in this file’s packages)

After ADR-006 is implemented under a separate authorization, the **actual
user** (not an agent) completes this unaided practice on the couch. No lane
visit. Create a **new** practice game. Do not edit existing user games.

Hand the phone. Do not coach unless the user is stuck. Record any hint.

Required actions (user must identify and perform them):

1. Explain what the app does.
2. Start a new practice game.
3. Enter one delivery (pins knocked down on that ball).
4. Correct that delivery with **Fix a ball**.
5. Open the practice game again through **Previous games**.

```ini
WALKTHROUGH_DATE=
ASSISTANCE_NEEDED=
COACHED_ACTIONS=
USER_WALKTHROUGH=PASS|HOLD
```

If coaching is needed for a required action, `USER_WALKTHROUGH=HOLD`.
Automated tests and agent screenshots do not pass this gate. Real-lane
validation stays paused until `USER_WALKTHROUGH=PASS`. When the walkthrough
PASSes, revise the bowler checklist labels above to match ADR-006 wording
before unpausing the lane session.
