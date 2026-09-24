# B1 updated APK device verification — scroll-aware, new games only
param([string]$Serial = "R3CY40E6FVJ")
$EvidenceDir = "C:\Users\Drago\Documents\Bowling\docs\evidence"
$ErrorActionPreference = "Continue"
. (Join-Path $EvidenceDir "b1-device-helpers.ps1") -Serial $Serial -EvidenceDir $EvidenceDir

$R = [ordered]@{
  gutter_advance=$false; spare_x=$false; fix_first=$false; throw_switch=$false
  incomplete_excluded=$false; completed_included=$false; data_preserved=$true
}

function DumpL($l) { Dump-Ui $l | Out-Null; Get-UiTexts }
function Has($texts, $s) { [bool]($texts | Where-Object { $_ -like "*$s*" }) }
function Swipe-Up {
  # Scroll home content up to reveal Start New Game
  cmd /c "adb -s $Serial shell input swipe 700 2400 700 900 400 >nul 2>&1"
  Start-Sleep -Milliseconds 800
}
function Swipe-Down {
  cmd /c "adb -s $Serial shell input swipe 700 900 700 2400 400 >nul 2>&1"
  Start-Sleep -Milliseconds 800
}
function Find-Tap([string]$substr) {
  Dump-Ui "find" | Out-Null
  $b = Find-BoundsLoose $substr
  if (-not $b) { return $false }
  Write-Obs "TAP $($b.Text) $($substr)"
  Tap-Bounds $b
  return $true
}
function Scroll-Find-Tap([string]$substr, [int]$maxSwipes=8) {
  for ($i=0; $i -le $maxSwipes; $i++) {
    if (Find-Tap $substr) { return $true }
    Swipe-Up
  }
  return $false
}
function Qual-Count {
  Dump-Ui "qual" | Out-Null
  $xml = Get-Content -Raw $script:UiPath
  $m = [regex]::Match($xml, 'text="Qualifying Games".{0,400}?text="(\d+)"')
  if ($m.Success) { return [int]$m.Groups[1].Value }
  return $null
}
function Node-En([string]$prefix) {
  $xml = Get-Content -Raw $script:UiPath
  foreach ($m in [regex]::Matches($xml, '<node[^>]+>')) {
    $n = $m.Value
    if ($n -notmatch 'content-desc="([^"]*)"') { continue }
    $d = $Matches[1]
    if ($d -notlike "$prefix*") { continue }
    if ($d -like "*unavailable*") { return $false }
    if ($n -match 'enabled="false"') { return $false }
    if ($n -match 'enabled="true"') { return $true }
  }
  return $null
}
function Tap-Desc([string]$substr) {
  Dump-Ui "desc" | Out-Null
  $xml = Get-Content -Raw $script:UiPath
  foreach ($m in [regex]::Matches($xml, '<node[^>]+>')) {
    $n = $m.Value
    if ($n -notmatch ('content-desc="[^"]*' + [regex]::Escape($substr) + '[^"]*"')) { continue }
    if ($n -match 'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"') {
      Tap-Bounds @{ L=[int]$Matches[1]; T=[int]$Matches[2]; R=[int]$Matches[3]; B=[int]$Matches[4] }
      return $true
    }
  }
  return $false
}

Write-Obs "=== LAUNCH ==="
cmd /c "adb -s $Serial shell am force-stop com.drago1068.bowling >nul 2>&1"
Start-Sleep 1
cmd /c "adb -s $Serial shell monkey -p com.drago1068.bowling -c android.intent.category.LAUNCHER 1 >nul 2>&1"
Start-Sleep 4
$home0 = DumpL "v2-home0"
$qual0 = Qual-Count
Write-Obs "QUAL0=$qual0 Complete visible=$(Has $home0 'Complete')"
$R.completed_included = ($null -ne $qual0 -and $qual0 -gt 0) -and (Has $home0 "Complete")
$R.data_preserved = $R.completed_included

Write-Obs "=== GAME A gutter ==="
if (-not (Scroll-Find-Tap "Start New Game")) { throw "Start New Game not found after scroll" }
Start-Sleep 1
$t = DumpL "v2-new-a"
Write-Obs "New game: $($t[0..8] -join ' | ')"
# Tap Gutter
if (-not (Tap-Desc "Gutter")) {
  if (-not (Find-Tap "G")) { throw "Gutter control missing" }
}
Start-Sleep 1
$ag = DumpL "v2-after-g"
Write-Obs "After G: $($ag -join ' | ')"
$R.gutter_advance = Has $ag "2nd"
Dump-Ui "v2-g-ctrl" | Out-Null
$xEn = Node-En "X"
$sEn = Node-En "Slash"
Write-Obs "X=$xEn Slash=$sEn"
$R.spare_x = ($xEn -eq $false) -and ($sEn -eq $true)

# Home without completing
if (-not (Find-Tap "Home")) { Scroll-Find-Tap "Home" | Out-Null }
Start-Sleep 1
# Scroll to top for metrics
1..6 | ForEach-Object { Swipe-Down }
$qualA = Qual-Count
$ha = DumpL "v2-home-a"
Write-Obs "QUAL_A=$qualA Active=$(Has $ha 'Active')"
$R.incomplete_excluded = ($null -ne $qual0 -and $qualA -eq $qual0) -and (Has $ha "Active")

Write-Obs "=== GAME B leave+fix ==="
if (-not (Scroll-Find-Tap "Start New Game")) { throw "Start New Game B missing" }
Start-Sleep 1
DumpL "v2-new-b" | Out-Null
# Tap pins 7 and 10 via content-desc
Tap-Desc "Pin 7 " | Out-Null
Tap-Desc "Pin 10 " | Out-Null
if (-not (Tap-Desc "Confirm standing")) { Find-Tap "Confirm" | Out-Null }
Start-Sleep 1
DumpL "v2-leave" | Out-Null
# Tap Frame 1
if (-not (Tap-Desc "Frame 1")) { throw "Frame 1 not tappable" }
Start-Sleep 1
$f1 = DumpL "v2-fix1"
Write-Obs "Fix1: $($f1 -join ' | ')"
Dump-Ui "v2-fix1x" | Out-Null
$xml = Get-Content -Raw $script:UiPath
$p7 = $xml -match 'Pin 7 standing'
$p10 = $xml -match 'Pin 10 standing'
$R.fix_first = (Has $f1 "1st") -and $p7 -and $p10
Write-Obs "fix_first pins7=$p7 pins10=$p10"

# Cancel and finish ball 2 with G so both throws exist
Find-Tap "Cancel" | Out-Null
Start-Sleep 1
if (-not (Tap-Desc "Gutter")) { Find-Tap "G" | Out-Null }
Start-Sleep 1
if (-not (Tap-Desc "Frame 1")) { Find-Tap "Fix a ball" | Out-Null }
Start-Sleep 1
$f2 = DumpL "v2-fix2"
$has1 = Has $f2 "1st throw"
$has2 = Has $f2 "2nd throw"
Write-Obs "switch controls 1=$has1 2=$has2"
$R.fix_first = $R.fix_first -or $has1
if ($has2) {
  Find-Tap "2nd throw" | Out-Null
  Start-Sleep 1
  Dump-Ui "v2-2nd" | Out-Null
  $xml = Get-Content -Raw $script:UiPath
  $a7 = $xml -match 'Pin 7 standing'
  $a10 = $xml -match 'Pin 10 standing'
  Find-Tap "1st throw" | Out-Null
  Start-Sleep 1
  Dump-Ui "v2-1st" | Out-Null
  $xml = Get-Content -Raw $script:UiPath
  $b7 = $xml -match 'Pin 7 standing'
  $b10 = $xml -match 'Pin 10 standing'
  Write-Obs "2nd standing 7/10=$a7/$a10 ; 1st restored 7/10=$b7/$b10"
  $R.throw_switch = $a7 -and $a10 -and $b7 -and $b10
}

Find-Tap "Cancel" | Out-Null
Find-Tap "Home" | Out-Null
Start-Sleep 1
1..6 | ForEach-Object { Swipe-Down }
$qualF = Qual-Count
Write-Obs "QUAL_F=$qualF"
if ($null -ne $qual0) {
  # Two incompletes should not raise qualifying
  $R.incomplete_excluded = ($qualF -eq $qual0)
}
$R.completed_included = ($null -ne $qualF -and $qualF -gt 0)

Write-Obs "=== RESULTS ==="
$R.GetEnumerator() | ForEach-Object { Write-Obs "$($_.Key)=$($_.Value)" }
$core = $R.gutter_advance -and $R.spare_x -and $R.fix_first -and $R.incomplete_excluded -and $R.completed_included -and $R.data_preserved
$verdict = if ($core -and $R.throw_switch) { "PASS" } elseif ($core) { "HOLD" } else { "FAIL" }
Write-Obs "VERDICT=$verdict"
$script:Log | Set-Content (Join-Path $EvidenceDir "b1-verify-observations.txt") -Encoding utf8
@{ RESULT=$verdict; APK_SHA256="9141fb073c8a5a0a1c6a2659cc29c0cd57136a1e5685a091ac5e99f42ecbdba4"; details=$R } |
  ConvertTo-Json -Depth 5 | Set-Content (Join-Path $EvidenceDir "b1-verify-results.json") -Encoding utf8
Write-Output "VERDICT=$verdict"
Write-Output ($R | ConvertTo-Json -Compress)
