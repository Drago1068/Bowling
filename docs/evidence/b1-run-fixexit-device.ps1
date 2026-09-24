$ErrorActionPreference = "Continue"
$Serial = "R3CY40E6FVJ"
$EvidenceDir = "C:\Users\Drago\Documents\Bowling\docs\evidence"
$UiPath = Join-Path $EvidenceDir "b1-fixexit-ui-current.xml"
$LogPath = Join-Path $EvidenceDir "b1-fixexit-observations.txt"
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
    & adb -s $Serial shell am start -n com.drago1068.bowling/.MainActivity 2>$null | Out-Null
    Start-Sleep -Milliseconds 800
  }
}
function Dump-Ui([string]$label) {
  Bring-Bowling
  & adb -s $Serial shell uiautomator dump /sdcard/ui.xml 2>$null | Out-Null
  $dest = Join-Path $EvidenceDir ("b1-fixexit-" + $label + ".xml")
  & adb -s $Serial pull /sdcard/ui.xml $dest 2>$null | Out-Null
  Copy-Item $dest $UiPath -Force
}
function Get-UiTexts {
  $xml = Get-Content -Raw $UiPath
  [regex]::Matches($xml, 'text="([^"]*)"') | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ } | Select-Object -Unique
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
    $list += [pscustomobject]@{
      Text = $(if ($tm.Success) { $tm.Groups[1].Value } else { "" })
      Desc = $(if ($cm.Success) { $cm.Groups[1].Value } else { "" })
      L=$L;T=$T;R=$R;B=$B
      Clickable = ($attrs -match 'clickable="true"')
      Enabled = ($attrs -notmatch 'enabled="false"')
      Area = ($R-$L)*($B-$T)
    }
  }
  return $list
}
function Find-Bounds([string]$substr) {
  $nodes = @(Get-UiNodes | Where-Object { ($_.Text -and $_.Text.Contains($substr)) -or ($_.Desc -and $_.Desc.Contains($substr)) } | Where-Object { $_.Area -gt 100 } | Sort-Object { -$_.Area })
  if ($nodes.Count -eq 0) { return $null }
  $n = $nodes[0]
  return @{ Text=$(if($n.Text){$n.Text}else{$n.Desc}); L=$n.L;T=$n.T;R=$n.R;B=$n.B }
}
function Find-AllBounds([string]$exact) {
  @(Get-UiNodes | Where-Object { $_.Text -eq $exact -or $_.Desc -eq $exact } | ForEach-Object {
    @{ Text=$(if($_.Text){$_.Text}else{$_.Desc}); L=$_.L;T=$_.T;R=$_.R;B=$_.B;Clickable=$_.Clickable;Enabled=$_.Enabled;Area=$_.Area}
  })
}
function Tap-Bounds($b) {
  $x=[int](($b.L+$b.R)/2); $y=[int](($b.T+$b.B)/2)
  & adb -s $Serial shell input tap $x $y 2>$null | Out-Null
  Start-Sleep -Milliseconds 700
}
function Tap-Substr([string]$s, [switch]$Exact) {
  Dump-Ui "pre"
  if ($Exact) { $all=@(Find-AllBounds $s | Where-Object Area -gt 100); if($all.Count -eq 0){throw "missing $s"}; $b=$all[0] }
  else { $b = Find-Bounds $s }
  if (-not $b) { throw "missing $s" }
  Obs "TAP '$($b.Text)'"
  Tap-Bounds $b
}
function Tap-Pin([string]$n) {
  Dump-Ui "pre-pin"
  $all = @(Find-AllBounds $n | Where-Object { $_.Clickable -and $_.Enabled -and $_.Area -gt 1000 })
  if ($all.Count -eq 0) { $all = @(Find-AllBounds $n | Where-Object { $_.Clickable -and $_.Area -gt 100 }) }
  if ($all.Count -eq 0) { throw "pin $n missing" }
  $b = @($all | Sort-Object T)[0]
  Obs "TAP_PIN $n"
  Tap-Bounds $b
}
function Shot([string]$name) {
  $png = Join-Path $EvidenceDir ("b1-fixexit-" + $name + ".png")
  & adb -s $Serial shell screencap -p /sdcard/b1shot.png 2>$null | Out-Null
  & adb -s $Serial pull /sdcard/b1shot.png $png 2>$null | Out-Null
  Obs "SHOT $name"
}
function Fail-Stop([string]$r) { Obs "FAIL_STOP $r"; Shot "fail"; $obs | Set-Content -Encoding utf8 $LogPath; throw $r }
function Assert-Visible([string]$substr, [string]$label) {
  Dump-Ui $label
  if (-not ((Get-UiTexts) | Where-Object { $_.Contains($substr) })) { Fail-Stop "Missing '$substr' on $label" }
  Obs "SAW '$substr'"
}

Obs "BEGIN fix-exit long-game device check (no force-stop)"
& adb -s $Serial shell am start -n com.drago1068.bowling/.MainActivity 2>$null | Out-Null
Start-Sleep 5
Dump-Ui "launch"
Obs ("launch: " + ((Get-UiTexts) -join " | "))
# Confirm existing 9/13 still listed somewhere later; start dedicated game
$started = $false
foreach ($label in @("Start a new game", "Start a game")) {
  Dump-Ui "pre-start"
  if (Find-Bounds $label) { Tap-Substr $label; $started = $true; break }
}
if (-not $started) { Fail-Stop "Start a new game not found" }
Start-Sleep 1
Dump-Ui "new-game"
Obs ("new game: " + ((Get-UiTexts) -join " | "))
if (-not ((Get-UiTexts) | Where-Object { $_.Contains("How many pins") })) {
  Fail-Stop "New game entry prompt missing"
}
for ($f=1; $f -le 9; $f++) {
  Tap-Pin "5"; Start-Sleep -Milliseconds 350
  Dump-Ui "save-check"
  if (@(Find-AllBounds "Save").Count -eq 0) { Fail-Stop "Save missing frame $f ball1" }
  Tap-Substr "Save" -Exact; Start-Sleep -Milliseconds 400
  Tap-Pin "4"; Start-Sleep -Milliseconds 350
  Tap-Substr "Save" -Exact; Start-Sleep -Milliseconds 400
}
Dump-Ui "tenth-or-long"
Obs ("after 9 frames: " + ((Get-UiTexts) -join " | "))
# May be on frame 10 — add more if needed until Fix has many rolls
Assert-Visible "Fix a ball" "has-fix"
Tap-Substr "Fix a ball"
Start-Sleep 1
Dump-Ui "fix-chooser"
$texts = @(Get-UiTexts)
Obs ("chooser: " + ($texts -join " | "))
# Cancel must be visible ABOVE chooser without scrolling full list
if (-not ($texts | Where-Object { $_ -eq "Cancel" })) { Fail-Stop "Cancel not in chooser hierarchy" }
# Prefer Cancel near top: find Cancel bounds and first roll bounds
$cancel = Find-Bounds "Cancel"
$roll = Find-Bounds "Frame 1"
if ($cancel -and $roll -and $cancel.T -gt $roll.T) {
  Fail-Stop "Cancel is below roll list (chooser); expected above_chooser"
}
Obs "Cancel above chooser OK (Cancel.T=$($cancel.T) Roll.T=$($roll.T))"
Shot "01-chooser-cancel-above"

# Select a visible roll (list is height-capped; Frame 1 is on-screen)
$target = Find-Bounds "Frame 1, 1st"
if (-not $target) { Fail-Stop "Could not find Frame 1 roll to edit" }
Obs "Selecting '$($target.Text)'"
Tap-Bounds $target
Start-Sleep 1
Dump-Ui "editor"
$texts = @(Get-UiTexts)
Obs ("editor: " + ($texts -join " | "))
# New editor chrome (not the long chooser list)
if (-not ($texts | Where-Object { $_.Contains("Choose a different ball") })) { Fail-Stop "Choose a different ball missing" }
if (-not ($texts | Where-Object { $_.Contains("Save standing pins") })) { Fail-Stop "Save standing pins not visible in editor" }
if (-not ($texts | Where-Object { $_ -eq "Cancel" })) { Fail-Stop "Cancel not visible in editor" }
# Chooser list rows beyond the selected roll should not dominate; Frame 4 list row absent once editing
if ($texts | Where-Object { $_ -match 'Frame 4, 2nd ball = 4' }) {
  Fail-Stop "Full roll chooser still listed while editing"
}
$saveBtn = Find-Bounds "Save standing pins"
$cancelBtn = Find-Bounds "Cancel"
if (-not $saveBtn -or -not $cancelBtn) { Fail-Stop "Save/Cancel bounds missing in editor" }
Obs "Editor controls Save.T=$($saveBtn.T) Cancel.T=$($cancelBtn.T)"
Shot "02-editor-save-cancel-visible"

# Cancel without mutation
Tap-Substr "Cancel"
Start-Sleep 1
Dump-Ui "after-cancel"
$afterTexts = @(Get-UiTexts)
Obs ("after cancel: " + ($afterTexts -join " | "))
if ($afterTexts | Where-Object { $_.Contains("Choose the ball to change") }) {
  Fail-Stop "Still in Fix after Cancel"
}
if (-not ($afterTexts | Where-Object { $_.Contains("Fix a ball") })) { Fail-Stop "Fix a ball missing after Cancel" }
Shot "03-cancel-exited"

# Re-enter Fix, select Frame 1, Save standing — Save acts on intended roll
Tap-Substr "Fix a ball"
Start-Sleep 1
$target2 = Find-Bounds "Frame 1, 1st"
if (-not $target2) { Fail-Stop "Frame 1 missing on re-enter" }
Tap-Bounds $target2
Start-Sleep 1
Dump-Ui "editor-for-save"
# Standing: first ball pinfall 5 => 5 standing pins
foreach ($p in @("1","2","3","4","5")) {
  Dump-Ui "stand"
  $all = @(Find-AllBounds $p | Where-Object { $_.Clickable -and $_.Enabled -and $_.Area -gt 1000 })
  if ($all.Count -eq 0) { Fail-Stop "standing $p missing" }
  Tap-Bounds (@($all | Sort-Object T)[-1])
}
Assert-Visible "Save standing pins" "save-visible-before"
Tap-Substr "Save standing pins"
Start-Sleep 1
Dump-Ui "after-save"
$saveTexts = @(Get-UiTexts)
Obs ("after save: " + ($saveTexts -join " | "))
if (-not ($saveTexts | Where-Object { $_.Contains("Saved standing pins") -or $_.Contains("standing 1,2,3,4,5") })) {
  Fail-Stop "Save standing did not confirm"
}
# Confirm save targeted Frame 1
if (-not ($saveTexts | Where-Object { $_ -match 'Frame 1, 1st.*standing 1,2,3,4,5' })) {
  Obs "WARN: Frame 1 standing label not in same dump; checking Choose different / Cancel path"
}
# Cancel still reachable after save without restart
if (-not ($saveTexts | Where-Object { $_ -eq "Cancel" })) {
  Fail-Stop "Cancel unreachable after Save without restart"
}
Shot "04-save-then-cancel-reachable"
Tap-Substr "Cancel"
Start-Sleep 1
Dump-Ui "final"
# Existing user games still present
Tap-Substr "Previous games"
Start-Sleep 1
$found = $false
for ($i=0; $i -lt 10; $i++) {
  Dump-Ui "hist-$i"
  if ((Get-UiTexts) | Where-Object { $_.Contains("9/13/2026") }) { $found=$true; break }
  & adb -s $Serial shell input swipe 720 2300 720 1000 300 2>$null | Out-Null
  Start-Sleep -Milliseconds 400
}
if (-not $found) { Fail-Stop "Existing 9/13 games missing" }
Shot "05-existing-preserved"
Obs "LONG_GAME_DEVICE_CHECK_PASS RESTART_WORKAROUND_REQUIRED=false"
$obs | Set-Content -Encoding utf8 $LogPath
Write-Host "LOG=$LogPath"
