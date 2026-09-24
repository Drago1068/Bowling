$ErrorActionPreference = "Continue"
$Serial = "R3CY40E6FVJ"
$EvidenceDir = "C:\Users\Drago\Documents\Bowling\docs\evidence"
$UiPath = Join-Path $EvidenceDir "b1-device-ui-current.xml"
$LogPath = Join-Path $EvidenceDir "b1-device-observations-continued.txt"
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
  $dest = Join-Path $EvidenceDir ("b1-device-" + $label + ".xml")
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
  Start-Sleep -Milliseconds 800
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
  $png = Join-Path $EvidenceDir ("b1-device-" + $name + ".png")
  & adb -s $Serial shell screencap -p /sdcard/b1shot.png 2>$null | Out-Null
  & adb -s $Serial pull /sdcard/b1shot.png $png 2>$null | Out-Null
  Obs "SHOT $name"
}
function Fail-Stop([string]$r) { Obs "FAIL_STOP $r"; Shot "fail-continued"; $obs | Set-Content -Encoding utf8 $LogPath; throw $r }

Obs "CONTINUE: history scroll + tenth frame"
& adb -s $Serial shell am start -n com.drago1068.bowling/.MainActivity 2>$null | Out-Null
Start-Sleep 3

# History may already be open from prior fail
Dump-Ui "cont-start"
if (-not ((Get-UiTexts) | Where-Object { $_ -match 'These are your games|Previous games|9/21/2026' })) {
  Tap-Substr "Previous games"
}
$found = $false
for ($i=0; $i -lt 12; $i++) {
  Dump-Ui "history-scroll-$i"
  $texts = @(Get-UiTexts)
  Obs ("history scroll $i sample: " + (($texts | Select-Object -First 8) -join " | "))
  if ($texts | Where-Object { $_.Contains("9/13/2026") }) { $found=$true; Obs "FOUND 9/13/2026"; break }
  & adb -s $Serial shell input swipe 720 2300 720 1000 300 2>$null | Out-Null
  Start-Sleep -Milliseconds 450
}
if (-not $found) { Fail-Stop "9/13/2026 not found after scrolling history" }
Shot "16-history-existing-preserved"
# Open the existing game briefly to confirm accessible
Tap-Substr "9/13/2026"
Start-Sleep 2
Dump-Ui "existing-opened"
Obs ("opened existing: " + ((Get-UiTexts) -join " | "))
Shot "16b-existing-opened"
if (-not ((Get-UiTexts) | Where-Object { $_.Contains("9/13/2026") -or $_.Contains("Bowling") })) {
  Fail-Stop "Failed to open existing game"
}
Obs "Existing 9/13 game opened OK"

# Dedicated tenth-frame game
Tap-Substr "Start a new game"
Start-Sleep 1
for ($f=1; $f -le 9; $f++) {
  Tap-Pin "10"
  Start-Sleep -Milliseconds 400
  Dump-Ui "strike-$f"
  if (@(Find-AllBounds "Save").Count -eq 0) { Fail-Stop "Save missing strike $f" }
  Tap-Substr "Save" -Exact
  Start-Sleep -Milliseconds 500
}
Dump-Ui "tenth-start"
Obs ("tenth: " + ((Get-UiTexts) -join " | "))
if (-not ((Get-UiTexts) | Where-Object { $_.Contains("Frame 10") })) { Fail-Stop "Did not reach Frame 10" }
Shot "17-tenth-frame"
Tap-Pin "10"; Start-Sleep -Milliseconds 400; Tap-Substr "Save" -Exact; Start-Sleep -Milliseconds 500
Dump-Ui "tenth-b2"; Obs ("b2: " + ((Get-UiTexts) -join " | "))
Tap-Pin "9"; Start-Sleep -Milliseconds 400; Tap-Substr "Save" -Exact; Start-Sleep -Milliseconds 500
Dump-Ui "tenth-b3"; Obs ("b3: " + ((Get-UiTexts) -join " | "))
Shot "18-tenth-b3-restrictions"
$b5 = @(Find-AllBounds "5" | Where-Object { $_.Clickable -and $_.Enabled -and $_.Area -gt 1000 })
if ($b5.Count -gt 0) {
  Tap-Bounds (@($b5 | Sort-Object T)[0])
  Start-Sleep -Milliseconds 500
  Dump-Ui "after-5"
  if ((Get-UiTexts) | Where-Object { $_.Contains("Which pins are still standing") }) {
    Fail-Stop "Illegal pinfall 5 accepted on tenth 10,9 remaining"
  }
  Obs "Tap 5 did not accept (OK)"
} else {
  Obs "Pin 5 not enabled on tenth ball3 (OK)"
}
Tap-Pin "1"; Start-Sleep -Milliseconds 400; Tap-Substr "Save" -Exact; Start-Sleep -Milliseconds 500
Dump-Ui "tenth-done"
Obs ("tenth done: " + ((Get-UiTexts) -join " | "))
Shot "19-tenth-complete"
Obs "CONTINUED_CHECKS_PASS"
$obs | Set-Content -Encoding utf8 $LogPath
Write-Host "LOG=$LogPath"
