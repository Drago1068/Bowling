$ErrorActionPreference = "Continue"
$Serial = "R3CY40E6FVJ"
$EvidenceDir = "C:\Users\Drago\Documents\Bowling\docs\evidence"
$UiPath = Join-Path $EvidenceDir "b1-device-ui-current.xml"
$LogPath = Join-Path $EvidenceDir "b1-device-observations.txt"
$obs = [System.Collections.Generic.List[string]]::new()

function Obs([string]$msg) {
  $line = "$(Get-Date -Format 'HH:mm:ss') $msg"
  $obs.Add($line)
  Write-Host $line
}

function Bring-Bowling {
  $focus = & adb -s $Serial shell dumpsys window 2>$null | Select-String -Pattern 'mCurrentFocus|mFocusedApp' | Select-Object -First 3
  $joined = ($focus | ForEach-Object { $_.Line }) -join " "
  if ($joined -notmatch 'com.drago1068.bowling') {
    Obs "FOCUS lost -> $joined ; bringing Bowling forward"
    & adb -s $Serial shell am start -n com.drago1068.bowling/.MainActivity 2>$null | Out-Null
    Start-Sleep -Milliseconds 800
  }
}

function Dump-Ui([string]$label) {
  Bring-Bowling
  & adb -s $Serial shell uiautomator dump /sdcard/ui.xml 2>$null | Out-Null
  $dest = Join-Path $EvidenceDir ("b1-device-" + $label + ".xml")
  & adb -s $Serial pull /sdcard/ui.xml $dest 2>$null | Out-Null
  Copy-Item $dest $UiPath -Force
  return $dest
}

function Get-UiTexts {
  $xml = Get-Content -Raw $UiPath
  [regex]::Matches($xml, 'text="([^"]*)"') | ForEach-Object { $_.Groups[1].Value } |
    Where-Object { $_ -ne "" } | Select-Object -Unique
}

function Get-UiNodes {
  $xml = Get-Content -Raw $UiPath
  $list = @()
  foreach ($m in [regex]::Matches($xml, '<node\b([^>]*?)(/?)>')) {
    $attrs = $m.Groups[1].Value
    $tm = [regex]::Match($attrs, '\btext="([^"]*)"')
    $cm = [regex]::Match($attrs, '\bcontent-desc="([^"]*)"')
    $bm = [regex]::Match($attrs, '\bbounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"')
    if (-not $bm.Success) { continue }
    $L=[int]$bm.Groups[1].Value; $T=[int]$bm.Groups[2].Value; $R=[int]$bm.Groups[3].Value; $B=[int]$bm.Groups[4].Value
    $text = if ($tm.Success) { $tm.Groups[1].Value } else { "" }
    $desc = if ($cm.Success) { $cm.Groups[1].Value } else { "" }
    $list += [pscustomobject]@{
      Text = $text
      Desc = $desc
      L = $L; T = $T; R = $R; B = $B
      Clickable = ($attrs -match 'clickable="true"')
      Enabled = ($attrs -notmatch 'enabled="false"')
      Area = ($R - $L) * ($B - $T)
    }
  }
  return $list
}

function Find-Bounds([string]$substr) {
  $nodes = @(Get-UiNodes | Where-Object {
    ($_.Text -and $_.Text.Contains($substr)) -or ($_.Desc -and $_.Desc.Contains($substr))
  } | Where-Object { $_.Area -gt 100 } | Sort-Object { -$_.Area })
  if ($nodes.Count -eq 0) { return $null }
  $n = $nodes[0]
  return @{ Text = $(if ($n.Text) { $n.Text } else { $n.Desc }); L=$n.L; T=$n.T; R=$n.R; B=$n.B }
}

function Find-AllBounds([string]$exactText) {
  $nodes = @(Get-UiNodes | Where-Object { $_.Text -eq $exactText -or $_.Desc -eq $exactText })
  $list = @()
  foreach ($n in $nodes) {
    $list += @{
      Text = $(if ($n.Text) { $n.Text } else { $n.Desc })
      L=$n.L; T=$n.T; R=$n.R; B=$n.B
      Clickable=$n.Clickable; Enabled=$n.Enabled; Area=$n.Area
    }
  }
  return $list
}

function Tap-Bounds($b) {
  $x = [int](($b.L + $b.R) / 2)
  $y = [int](($b.T + $b.B) / 2)
  & adb -s $Serial shell input tap $x $y 2>$null | Out-Null
  Start-Sleep -Milliseconds 800
}

function Tap-Substr([string]$substr, [switch]$Exact) {
  Dump-Ui "pre" | Out-Null
  $b = $null
  if ($Exact) {
    $all = @(Find-AllBounds $substr | Where-Object { $_.Area -gt 100 })
    if ($all.Count -eq 0) { throw "UI node not found exact: $substr" }
    $b = $all[0]
  } else {
    $b = Find-Bounds $substr
  }
  if (-not $b) { throw "UI node not found: $substr" }
  Obs "TAP '$($b.Text)' @ $([int](($b.L+$b.R)/2)),$([int](($b.T+$b.B)/2))"
  Tap-Bounds $b
}

function Tap-Pin([string]$n) {
  Dump-Ui "pre-pin" | Out-Null
  $all = @(Find-AllBounds $n | Where-Object { $_.Clickable -and $_.Enabled -and $_.Area -gt 1000 })
  if ($all.Count -eq 0) { $all = @(Find-AllBounds $n | Where-Object { $_.Clickable -and $_.Area -gt 100 }) }
  if ($all.Count -eq 0) { throw "Pin pad node not found: $n" }
  $sorted = @($all | Sort-Object { $_.T })
  $b = $sorted[0]
  Obs "TAP_PIN '$($b.Text)' #$($all.Count) bounds=[$($b.L),$($b.T)][$($b.R),$($b.B)]"
  Tap-Bounds $b
}

function Tap-Standing([string]$n) {
  Dump-Ui "pre-stand" | Out-Null
  $all = @(Find-AllBounds $n | Where-Object { $_.Clickable -and $_.Enabled -and $_.Area -gt 1000 })
  if ($all.Count -eq 0) { $all = @(Find-AllBounds $n | Where-Object { $_.Clickable -and $_.Area -gt 100 }) }
  if ($all.Count -eq 0) { throw "Standing pin not found: $n" }
  $sorted = @($all | Sort-Object { $_.T })
  $b = $sorted[-1]
  Obs "TAP_STAND '$($b.Text)' #$($all.Count) bounds=[$($b.L),$($b.T)][$($b.R),$($b.B)]"
  Tap-Bounds $b
}

function Saw([string]$substr, [string]$label) {
  Dump-Ui $label | Out-Null
  $texts = @(Get-UiTexts)
  $hit = $texts | Where-Object { $_.Contains($substr) }
  if (-not $hit) {
    Obs "MISS '$substr' [$label] texts=$($texts -join ' || ')"
    return $false
  }
  Obs "SAW '$substr'"
  return $true
}

function Shot([string]$name) {
  $png = Join-Path $EvidenceDir ("b1-device-" + $name + ".png")
  & adb -s $Serial shell screencap -p /sdcard/b1shot.png 2>$null | Out-Null
  & adb -s $Serial pull /sdcard/b1shot.png $png 2>$null | Out-Null
  Obs "SHOT $name -> $png"
}

function Restart-App {
  & adb -s $Serial shell am force-stop com.drago1068.bowling 2>$null | Out-Null
  Start-Sleep 1
  & adb -s $Serial shell am start -n com.drago1068.bowling/.MainActivity 2>$null | Out-Null
  Start-Sleep 4
}

function Swipe-Up {
  # Portrait phone ~1440x3120-ish; swipe content up to reveal lower controls
  & adb -s $Serial shell input swipe 720 2400 720 900 400 2>$null | Out-Null
  Start-Sleep -Milliseconds 600
}

function Swipe-Down {
  & adb -s $Serial shell input swipe 720 900 720 2400 400 2>$null | Out-Null
  Start-Sleep -Milliseconds 600
}

function Fail-Stop([string]$reason) {
  Obs "FAIL_STOP: $reason"
  Shot "fail-stop"
  Dump-Ui "fail-stop" | Out-Null
  $obs | Set-Content -Encoding utf8 $LogPath
  throw $reason
}

# Ensure airplane / offline? Package says offline without Metro. App is embedded JS so Metro not needed.
# Disable wifi briefly? Prefer not to disrupt device. Embedded APK = offline capable.
Obs "BEGIN B1 device verification"
Restart-App
Dump-Ui "launch" | Out-Null
Obs ("launch UI: " + ((Get-UiTexts) -join " | "))
# Pre-existing 9/13 game may be current or only in history after earlier acceptance games
$hasExistingOnScreen = Saw "9/13/2026" "existing-game-screen"
if (-not $hasExistingOnScreen) {
  Tap-Substr "Previous games"
  Start-Sleep 1
  if (-not (Saw "9/13/2026" "existing-game-history")) { Fail-Stop "Pre-existing 9/13 game missing from history" }
  Obs "Pre-existing 9/13 game observed in Previous games"
  Shot "01-existing-game-preserved"
  # History panel has its own Start a new game — use that to leave history
} else {
  Shot "01-existing-game-preserved"
}

# --- New acceptance game 1: pinfall-only + standing + empty + cancel ---
Tap-Substr "Start a new game"
Start-Sleep 1
if (-not (Saw "How many pins did you knock down" "new-game-1")) { Fail-Stop "New game prompt missing" }
Shot "02-new-game-prompt"

# Pinfall-only: pick 3, Save without standing
Tap-Pin "3"
Start-Sleep 1
if (-not (Saw "Which pins are still standing" "standing-prompt")) { Fail-Stop "Standing prompt missing after pinfall" }
Shot "03-standing-optional"
Tap-Substr "Save" -Exact
Start-Sleep 1
if (-not (Saw "Pin detail not recorded" "pinfall-only")) {
  # notice text: "Pin detail not recorded for this ball."
  if (-not (Saw "not recorded" "pinfall-only-2")) { Fail-Stop "Pinfall-only not-recorded notice missing" }
}
Shot "04-pinfall-only-saved"

# Optional numbered standing on a fresh rack (Frame 2 ball 1):
# First finish Frame 1 ball 2 pinfall-only.
Tap-Pin "4"
Start-Sleep 1
Tap-Substr "Save" -Exact
Start-Sleep 1
if (-not (Saw "Frame 2" "frame2-for-standing")) { Fail-Stop "Expected Frame 2 before numbered standing" }
Tap-Pin "8"
Start-Sleep 1
Tap-Standing "9"
Tap-Standing "10"
Tap-Substr "Save" -Exact
Start-Sleep 1
if (-not (Saw "Standing: 9, 10" "standing-saved")) {
  if (-not (Saw "9, 10" "standing-saved-2")) { Fail-Stop "Standing 9,10 save notice missing" }
}
Shot "05-standing-numbered"

# Explicit empty standing on Frame 2 ball 2: remaining=2, pinfall=2, standing=[]
Dump-Ui "after-stand" | Out-Null
Obs ("UI: " + ((Get-UiTexts) -join " | "))
if (-not (Saw "Frame 2" "frame2-b2")) { Fail-Stop "Expected Frame 2 ball 2" }
Tap-Pin "2"
Start-Sleep 1
Tap-Standing "1"
Tap-Standing "1"  # deselect -> explicit empty, standingTouched
Tap-Substr "Save" -Exact
Start-Sleep 1
if (-not (Saw "Standing: none" "empty-standing")) { Fail-Stop "Explicit empty standing not distinct" }
Shot "06-explicit-empty-standing"

# Cancellation writes nothing: pick pinfall, cancel
Tap-Pin "5"
Start-Sleep 1
if (-not (Saw "Which pins are still standing" "cancel-prep")) { Fail-Stop "standing prompt before cancel" }
Tap-Substr "Cancel"
Start-Sleep 1
Dump-Ui "after-cancel" | Out-Null
$texts = @(Get-UiTexts)
if ($texts -match 'Saved:.*5') { Fail-Stop "Cancel still wrote a save for 5" }
if (-not (Saw "How many pins did you knock down" "after-cancel-prompt")) { Fail-Stop "After cancel, entry prompt missing" }
Shot "07-cancel-no-write"
Obs "Cancel path OK"

# Fix: add/correct/remove/re-add detail on F1B1 (pinfall 3 => need 7 standing)
Tap-Substr "Fix a ball"
Start-Sleep 1
if (-not (Saw "Choose the ball to change" "fix-mode")) { Fail-Stop "Fix mode missing" }
Tap-Substr "detail not recorded"
Start-Sleep 1
if (-not (Saw "What did you actually knock down" "fix-selected")) { Fail-Stop "Fix roll not selected" }
Shot "08-fix-selected"
Swipe-Up
Swipe-Up
# Add consistent standing for pinfall 3 on fresh rack: 7 standing pins
foreach ($p in @("1","2","3","4","5","6","7")) { Tap-Standing $p }
Dump-Ui "before-save-standing" | Out-Null
if (-not (Find-Bounds "Save standing pins")) {
  Swipe-Up
  Dump-Ui "before-save-standing-2" | Out-Null
}
Tap-Substr "Save standing pins"
Start-Sleep 1
Swipe-Down
Swipe-Down
Dump-Ui "after-add-detail" | Out-Null
Obs ("after add: " + ((Get-UiTexts) -join " | "))
$addOk = (Saw "Saved standing pins:" "add-detail") -or (Saw "standing 1,2,3,4,5,6,7" "add-detail-roll") -or (Saw "EFFECTIVE" "add-detail-eff")
if (-not $addOk) {
  # Roll list may show standing without notice if scrolled; open Fix again
  if (-not (Saw "Choose the ball to change" "add-check-fix")) {
    Tap-Substr "Fix a ball"; Start-Sleep 1
  }
  Dump-Ui "add-detail-list" | Out-Null
  Obs ("add list: " + ((Get-UiTexts) -join " | "))
  if (-not ((Get-UiTexts) | Where-Object { $_ -match 'Frame 1, 1st.*standing' })) {
    Fail-Stop "Add detail failed"
  }
  Obs "OK add detail visible on Frame 1 1st ball roll row"
}
Shot "09-add-detail"

# Re-select Frame 1 so draftStanding loads current pins, then correct 7 -> 8
Tap-Substr "standing 1,2,3,4,5,6,7"
Start-Sleep 1
Swipe-Up
Tap-Standing "7"
Tap-Standing "8"
Tap-Substr "Save standing pins"
Start-Sleep 1
Swipe-Down
Swipe-Down
Dump-Ui "after-correct-detail" | Out-Null
Obs ("after correct: " + ((Get-UiTexts) -join " | "))
if (-not ((Get-UiTexts) | Where-Object { $_ -match 'Saved standing pins:|standing 1,2,3,4,5,6,8' })) {
  Fail-Stop "Correct detail failed"
}
Shot "10-correct-detail"

# Re-select for remove
Tap-Substr "standing 1,2,3,4,5,6,8"
Start-Sleep 1
Swipe-Up
if (-not (Saw "Remove pin detail" "remove-btn")) { Fail-Stop "Remove pin detail button missing" }
Tap-Substr "Remove pin detail"
Start-Sleep 1
Swipe-Down
if (-not (Saw "not recorded" "removed")) { Fail-Stop "Remove detail notice missing" }
Shot "11-remove-detail"

# Re-select NOT_RECORDED Frame 1 1st for re-add
Tap-Substr "Frame 1, 1st"
Start-Sleep 1
Swipe-Up
Swipe-Up
foreach ($p in @("4","5","6","7","8","9","10")) { Tap-Standing $p }
Tap-Substr "Save standing pins"
Start-Sleep 1
Swipe-Down
Swipe-Down
Dump-Ui "after-readd" | Out-Null
Obs ("after readd: " + ((Get-UiTexts) -join " | "))
if (-not ((Get-UiTexts) | Where-Object { $_ -match 'Saved standing pins:|standing 4,5,6,7,8,9,10' })) {
  Fail-Stop "Re-add detail failed"
}
Shot "12-readd-detail"
Obs "Fix add/correct/remove/re-add path exercised"

# Re-select then correct pinfall to 10 to stale the detail
Tap-Substr "standing 4,5,6,7,8,9,10"
Start-Sleep 1
Swipe-Up
Tap-Pin "10"
Start-Sleep 1
Swipe-Down
Dump-Ui "after-incompatible" | Out-Null
Obs ("incompatible UI: " + ((Get-UiTexts) -join " | "))
Shot "13-incompatible-detail"
$staleNow = @(Get-UiTexts) | Where-Object { $_ -match 'STALE_DETAIL' }
if ($staleNow) {
  Obs ("OK incompatible status visible: " + ($staleNow -join " | "))
} else {
  Obs "WARN: STALE_DETAIL not in current dump"
}
Swipe-Down
Swipe-Down
Dump-Ui "before-cancel-incompat" | Out-Null
if (Find-Bounds "Cancel") {
  Tap-Substr "Cancel"
  Start-Sleep 1
} else {
  Obs "Cancel not visible; force-restart to continue remaining checks"
  Restart-App
}

Restart-App
if (-not (Saw "Bowling" "cold-restart")) { Fail-Stop "App failed cold restart" }
Shot "14-cold-restart"
Dump-Ui "cold-restart" | Out-Null
Obs ("cold UI: " + ((Get-UiTexts) -join " | "))
& adb -s $Serial shell input keyevent KEYCODE_HOME 2>$null | Out-Null
Start-Sleep 2
& adb -s $Serial shell am start -n com.drago1068.bowling/.MainActivity 2>$null | Out-Null
Start-Sleep 3
Dump-Ui "hot-resume" | Out-Null
Obs ("hot UI: " + ((Get-UiTexts) -join " | "))
Shot "15-hot-resume"

Tap-Substr "Previous games"
Start-Sleep 1
$foundExisting = $false
for ($i = 0; $i -lt 8; $i++) {
  Dump-Ui "history-scroll-$i" | Out-Null
  if ((Get-UiTexts) | Where-Object { $_.Contains("9/13/2026") }) {
    $foundExisting = $true
    Obs "SAW '9/13/2026' in history after scroll $i"
    break
  }
  # swipe history list upward to reveal older games
  & adb -s $Serial shell input swipe 720 2200 720 1100 350 2>$null | Out-Null
  Start-Sleep -Milliseconds 500
}
if (-not $foundExisting) { Fail-Stop "Existing game missing from history" }
Shot "16-history-existing-preserved"
Obs "Existing game still in Previous games"

Tap-Substr "Start a new game"
Start-Sleep 1
for ($f = 1; $f -le 9; $f++) {
  Tap-Pin "10"
  Start-Sleep -Milliseconds 400
  Dump-Ui "strike-$f-save" | Out-Null
  if (@(Find-AllBounds "Save").Count -eq 0) { Fail-Stop "Save missing after strike $f" }
  Tap-Substr "Save" -Exact
  Start-Sleep -Milliseconds 600
}
Dump-Ui "tenth-start" | Out-Null
Obs ("tenth start: " + ((Get-UiTexts) -join " | "))
if (-not (Saw "Frame 10" "tenth-frame")) { Fail-Stop "Did not reach Frame 10" }
Shot "17-tenth-frame"

Tap-Pin "10"; Start-Sleep -Milliseconds 400; Tap-Substr "Save" -Exact; Start-Sleep -Milliseconds 600
Dump-Ui "tenth-b2" | Out-Null
Obs ("tenth b2: " + ((Get-UiTexts) -join " | "))
Tap-Pin "9"; Start-Sleep -Milliseconds 400; Tap-Substr "Save" -Exact; Start-Sleep -Milliseconds 600
Dump-Ui "tenth-b3" | Out-Null
Obs ("tenth b3: " + ((Get-UiTexts) -join " | "))
Shot "18-tenth-b3-restrictions"
# Illegal 5: only tap if clickable+enabled pin pad node exists
$b5 = @(Find-AllBounds "5" | Where-Object { $_.Clickable -and $_.Enabled -and $_.Area -gt 1000 })
if ($b5.Count -gt 0) {
  $sorted5 = @($b5 | Sort-Object { $_.T })
  Tap-Bounds $sorted5[0]
  Start-Sleep -Milliseconds 500
  Dump-Ui "after-tap5-tenth" | Out-Null
  if (Saw "Which pins are still standing" "illegal5") {
    Fail-Stop "Tenth 10,9,1 rack allowed illegal pinfall 5"
  }
  Obs "Tap 5 did not open standing (disabled or ignored) OK"
} else {
  Obs "Pin 5 not clickable/enabled on tenth ball3 (rack restriction) OK"
}
Tap-Pin "1"; Start-Sleep -Milliseconds 400; Tap-Substr "Save" -Exact; Start-Sleep -Milliseconds 600
Dump-Ui "tenth-done" | Out-Null
Obs ("tenth done: " + ((Get-UiTexts) -join " | "))
Shot "19-tenth-complete"

Obs "DEVICE_ACCEPTANCE checks completed without Fail-Stop"
$obs | Set-Content -Encoding utf8 $LogPath
Write-Host "LOG=$LogPath"
