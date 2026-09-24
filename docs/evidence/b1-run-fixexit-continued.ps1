$ErrorActionPreference = "Continue"
$Serial = "R3CY40E6FVJ"
$EvidenceDir = "C:\Users\Drago\Documents\Bowling\docs\evidence"
$UiPath = Join-Path $EvidenceDir "b1-fixexit-ui-current.xml"
$LogPath = Join-Path $EvidenceDir "b1-fixexit-observations-continued.txt"
$obs = [System.Collections.Generic.List[string]]::new()

function Obs([string]$msg) {
  $line = "$(Get-Date -Format 'HH:mm:ss') $msg"
  $obs.Add($line)
  Write-Host $line
}
function Bring-Bowling {
  $focus = & adb -s $Serial shell dumpsys window 2>$null | Select-String -Pattern 'mCurrentFocus' | Select-Object -First 2
  if ((($focus | ForEach-Object { $_.Line }) -join " ") -notmatch 'com.drago1068.bowling') {
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
  [regex]::Matches((Get-Content -Raw $UiPath), 'text="([^"]*)"') | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ } | Select-Object -Unique
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
      Text=$(if($tm.Success){$tm.Groups[1].Value}else{""}); Desc=$(if($cm.Success){$cm.Groups[1].Value}else{""})
      L=$L;T=$T;R=$R;B=$B; Clickable=($attrs -match 'clickable="true"'); Enabled=($attrs -notmatch 'enabled="false"'); Area=($R-$L)*($B-$T)
    }
  }
  return $list
}
function Find-Bounds([string]$substr) {
  $nodes = @(Get-UiNodes | Where-Object { ($_.Text -and $_.Text.Contains($substr)) -or ($_.Desc -and $_.Desc.Contains($substr)) } | Where-Object { $_.Area -gt 100 } | Sort-Object { -$_.Area })
  if ($nodes.Count -eq 0) { return $null }
  $n=$nodes[0]; return @{ Text=$(if($n.Text){$n.Text}else{$n.Desc}); L=$n.L;T=$n.T;R=$n.R;B=$n.B }
}
function Find-AllBounds([string]$exact) {
  @(Get-UiNodes | Where-Object { $_.Text -eq $exact -or $_.Desc -eq $exact } | ForEach-Object {
    @{ Text=$(if($_.Text){$_.Text}else{$_.Desc}); L=$_.L;T=$_.T;R=$_.R;B=$_.B;Clickable=$_.Clickable;Enabled=$_.Enabled;Area=$_.Area}
  })
}
function Tap-Bounds($b) {
  & adb -s $Serial shell input tap ([int](($b.L+$b.R)/2)) ([int](($b.T+$b.B)/2)) 2>$null | Out-Null
  Start-Sleep -Milliseconds 700
}
function Tap-Substr([string]$s) {
  Dump-Ui "pre"; $b=Find-Bounds $s; if(-not $b){throw "missing $s"}; Obs "TAP '$($b.Text)'"; Tap-Bounds $b
}
function Shot([string]$name) {
  $png = Join-Path $EvidenceDir ("b1-fixexit-" + $name + ".png")
  & adb -s $Serial shell screencap -p /sdcard/b1shot.png 2>$null | Out-Null
  & adb -s $Serial pull /sdcard/b1shot.png $png 2>$null | Out-Null
  Obs "SHOT $name"
}
function Fail-Stop([string]$r) { Obs "FAIL_STOP $r"; Shot "fail"; $obs | Set-Content -Encoding utf8 $LogPath; throw $r }

Obs "CONTINUE editor/save/cancel on existing long game (no force-stop)"
& adb -s $Serial shell am start -n com.drago1068.bowling/.MainActivity 2>$null | Out-Null
Start-Sleep 3
Dump-Ui "cont"
Obs ("ui: " + ((Get-UiTexts) -join " | "))

# Ensure in Fix chooser on the long game
if (-not ((Get-UiTexts) | Where-Object { $_.Contains("Choose the ball to change") -or $_.Contains("Fix a ball") -or $_.Contains("Change Frame") })) {
  Fail-Stop "Unexpected screen"
}
if ((Get-UiTexts) | Where-Object { $_.Contains("Change Frame") -and $_.Contains("Choose a different ball") }) {
  Obs "Already in editor"
} elseif ((Get-UiTexts) | Where-Object { $_.Contains("Choose the ball to change") }) {
  Obs "In chooser"
} else {
  Tap-Substr "Fix a ball"
  Start-Sleep 1
  Dump-Ui "chooser2"
}

# If in editor from prior, Cancel first to re-test chooser Cancel above list
if ((Get-UiTexts) | Where-Object { $_.Contains("Choose a different ball") }) {
  Tap-Substr "Cancel"
  Start-Sleep 1
  Tap-Substr "Fix a ball"
  Start-Sleep 1
}
Dump-Ui "chooser-check"
$cancel = Find-Bounds "Cancel"
$roll = Find-Bounds "Frame 1"
if (-not $cancel) { Fail-Stop "Cancel missing in chooser" }
if ($roll -and $cancel.T -gt $roll.T) { Fail-Stop "Cancel below roll list" }
Obs "Chooser Cancel above list OK"
Shot "01-chooser-cancel-above"

$target = Find-Bounds "Frame 1, 1st"
if (-not $target) { Fail-Stop "Frame 1 missing" }
Tap-Bounds $target
Start-Sleep 1
Dump-Ui "editor"
$texts = @(Get-UiTexts)
Obs ("editor: " + ($texts -join " | "))
if (-not ($texts | Where-Object { $_.Contains("Choose a different ball") })) { Fail-Stop "Choose a different ball missing" }
if (-not ($texts | Where-Object { $_.Contains("Save standing pins") })) { Fail-Stop "Save standing pins missing" }
if (-not ($texts | Where-Object { $_ -eq "Cancel" })) { Fail-Stop "Cancel missing in editor" }
if ($texts | Where-Object { $_ -match 'Frame 4, 2nd ball = 4' }) { Fail-Stop "Full chooser still listed while editing" }
Shot "02-editor-save-cancel-visible"

Tap-Substr "Cancel"
Start-Sleep 1
Dump-Ui "after-cancel"
if ((Get-UiTexts) | Where-Object { $_.Contains("Choose the ball to change") -and -not ($_.Contains("Fix a ball")) }) {
  # notice may still say choose; require Fix a ball button back
}
if (-not ((Get-UiTexts) | Where-Object { $_.Contains("Fix a ball") })) { Fail-Stop "Did not exit Fix via Cancel" }
Shot "03-cancel-exited"
Obs "Cancel exited Fix without restart"

Tap-Substr "Fix a ball"
Start-Sleep 1
Dump-Ui "reenter-chooser"
$t = Find-Bounds "Frame 1, 1st"
if (-not $t) { Fail-Stop "Frame 1 missing on re-enter" }
Tap-Bounds $t
Start-Sleep 1
Dump-Ui "editor-for-save"
Obs ("editor-for-save: " + ((Get-UiTexts) -join " | "))
foreach ($p in @("1","2","3","4","5")) {
  Dump-Ui "stand"
  $all = @(Find-AllBounds $p | Where-Object { $_.Clickable -and $_.Enabled -and $_.Area -gt 1000 })
  if ($all.Count -eq 0) { $all = @(Find-AllBounds $p | Where-Object { $_.Clickable -and $_.Area -gt 100 }) }
  if ($all.Count -eq 0) { Fail-Stop "standing $p missing" }
  Tap-Bounds (@($all | Sort-Object T)[-1])
}
Dump-Ui "before-save"
if (-not (Find-Bounds "Save standing pins")) { Fail-Stop "Save not visible before save" }
Tap-Substr "Save standing pins"
Start-Sleep 1
Dump-Ui "after-save"
$saveTexts = @(Get-UiTexts)
Obs ("after save: " + ($saveTexts -join " | "))
if (-not ($saveTexts | Where-Object { $_.Contains("Saved standing pins") -or $_.Contains("standing 1,2,3,4,5") })) {
  Fail-Stop "Save standing did not confirm"
}
if (-not ($saveTexts | Where-Object { $_ -eq "Cancel" })) { Fail-Stop "Cancel unreachable after Save" }
Shot "04-save-then-cancel-reachable"
Tap-Substr "Cancel"
Start-Sleep 1

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
