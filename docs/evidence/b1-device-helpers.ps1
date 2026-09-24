# B1 device UI helpers for adb/uiautomator
param(
  [Parameter(Mandatory=$true)][string]$Serial,
  [string]$EvidenceDir = "C:\Users\Drago\Documents\Bowling\docs\evidence"
)

$ErrorActionPreference = "Stop"
$script:Serial = $Serial
$script:EvidenceDir = $EvidenceDir
$script:UiPath = Join-Path $EvidenceDir "b1-device-ui-current.xml"
$script:Log = [System.Collections.Generic.List[string]]::new()

function Write-Obs([string]$msg) {
  $line = "$(Get-Date -Format 'HH:mm:ss') $msg"
  $script:Log.Add($line)
  Write-Host $line
}

function Dump-Ui([string]$label) {
  cmd /c "adb -s $script:Serial shell uiautomator dump /sdcard/ui.xml >nul 2>&1"
  $dest = Join-Path $script:EvidenceDir ("b1-device-" + $label + ".xml")
  cmd /c "adb -s $script:Serial pull /sdcard/ui.xml `"$dest`" >nul 2>&1"
  Copy-Item $dest $script:UiPath -Force -ErrorAction SilentlyContinue
  return $dest
}

function Get-UiTexts {
  if (-not (Test-Path $script:UiPath)) { return @() }
  $xml = Get-Content -Raw $script:UiPath
  [regex]::Matches($xml, 'text="([^"]*)"') | ForEach-Object { $_.Groups[1].Value } |
    Where-Object { $_ -ne "" } | Select-Object -Unique
}

function Find-NodeBounds([string]$textExact) {
  $xml = Get-Content -Raw $script:UiPath
  # Prefer exact text match; escape for regex
  $esc = [regex]::Escape($textExact)
  $pat = 'text="' + $esc + '"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"'
  $m = [regex]::Match($xml, $pat)
  if (-not $m.Success) {
    # sometimes attributes order differs
    $pat2 = 'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*text="' + $esc + '"'
    $m = [regex]::Match($xml, $pat2)
  }
  if (-not $m.Success) { return $null }
  return @{
    L = [int]$m.Groups[1].Value
    T = [int]$m.Groups[2].Value
    R = [int]$m.Groups[3].Value
    B = [int]$m.Groups[4].Value
  }
}

function Find-NodeBoundsContains([string]$substr) {
  $xml = Get-Content -Raw $script:UiPath
  $nodes = [regex]::Matches($xml, 'text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"|bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*text="([^"]*)"')
  foreach ($m in $nodes) {
    $t = if ($m.Groups[1].Success -and $m.Groups[1].Value) { $m.Groups[1].Value } else { $m.Groups[9].Value }
    if ($t -and $t.Contains($substr)) {
      if ($m.Groups[2].Success -and $m.Groups[2].Value) {
        return @{ L=[int]$m.Groups[2].Value; T=[int]$m.Groups[3].Value; R=[int]$m.Groups[4].Value; B=[int]$m.Groups[5].Value; Text=$t }
      } else {
        return @{ L=[int]$m.Groups[6].Value; T=[int]$m.Groups[7].Value; R=[int]$m.Groups[8].Value; B=[int]$m.Groups[9].Value; Text=$t }
      }
    }
  }
  # Fix group indexing for second alt - redo simpler parse
  return $null
}

function Find-BoundsLoose([string]$substr) {
  $xml = Get-Content -Raw $script:UiPath
  $rx = [regex]'<node\b[^>]*>'
  foreach ($m in $rx.Matches($xml)) {
    $n = $m.Value
    $tm = [regex]::Match($n, 'text="([^"]*)"')
    if (-not $tm.Success) { continue }
    $t = $tm.Groups[1].Value
    if ($t -notlike ("*" + $substr + "*")) { continue }
    $bm = [regex]::Match($n, 'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"')
    if (-not $bm.Success) { continue }
    return @{
      L = [int]$bm.Groups[1].Value
      T = [int]$bm.Groups[2].Value
      R = [int]$bm.Groups[3].Value
      B = [int]$bm.Groups[4].Value
      Text = $t
    }
  }
  return $null
}

function Tap-Bounds($b) {
  $left = [int]$b["L"]; $top = [int]$b["T"]; $right = [int]$b["R"]; $bottom = [int]$b["B"]
  $x = [int](($left + $right) / 2)
  $y = [int](($top + $bottom) / 2)
  Write-Obs "XY $x,$y bounds=$left,$top,$right,$bottom"
  cmd /c "adb -s $script:Serial shell input tap $x $y >nul 2>&1"
  Start-Sleep -Milliseconds 700
}

function Tap-Text([string]$text, [switch]$Contains) {
  Dump-Ui "tap-pre" | Out-Null
  $b = if ($Contains) { Find-BoundsLoose $text } else { Find-NodeBounds $text }
  if (-not $b) { throw "UI node not found: $text" }
  Write-Obs "TAP '$(if ($b.Text) { $b.Text } else { $text })' @ $((($b.L+$b.R)/2)),$((($b.T+$b.B)/2))"
  Tap-Bounds $b
}

function Assert-Text([string]$substr, [string]$label) {
  Dump-Ui $label | Out-Null
  $texts = Get-UiTexts
  $hit = $texts | Where-Object { $_.Contains($substr) }
  if (-not $hit) {
    Write-Obs "FAIL missing '$substr' on $label. Seen: $($texts -join ' | ')"
    return $false
  }
  Write-Obs "OK saw '$substr'"
  return $true
}

function Screenshot([string]$name) {
  $png = Join-Path $script:EvidenceDir ("b1-device-" + $name + ".png")
  adb -s $script:Serial shell screencap -p /sdcard/b1shot.png | Out-Null
  adb -s $script:Serial pull /sdcard/b1shot.png $png 2>&1 | Out-Null
  Write-Obs "SHOT $name"
}

function Restart-App {
  adb -s $script:Serial shell am force-stop com.drago1068.bowling | Out-Null
  Start-Sleep 1
  adb -s $script:Serial shell am start -n com.drago1068.bowling/.MainActivity | Out-Null
  Start-Sleep 4
}

# When dot-sourced, functions are available.
