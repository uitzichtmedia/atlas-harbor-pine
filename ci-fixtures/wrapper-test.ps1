# B27 Windows check of scheduling/self-hosted/run-atlas.ps1 (L6.2, cheat sheet 6) with a stand-in claude.exe.
# Sets up a throw-away copy of the repository with a local bare "origin", then starts the wrapper the way
# the course says (powershell -ExecutionPolicy Bypass -File ...) and the way the schtasks /TR line would.
# Usage: wrapper-test.ps1 -Host powershell|pwsh -Wrapper <path to run-atlas.ps1 to test> -Label <name>
param([string]$Exe = 'powershell', [string]$Wrapper = 'scheduling\self-hosted\run-atlas.ps1', [string]$Label = 'wrapper')
$ErrorActionPreference = 'Continue'
$results = New-Object System.Collections.ArrayList
function Check([string]$id, [bool]$ok, [string]$detail) {
  $line = '{0} | {1} | {2} | {3}' -f $Label, $id, $(if ($ok) { 'PASS' } else { 'FAIL' }), ($detail -replace '\r?\n', ' / ')
  [void]$results.Add($line); Write-Host $line
}
$src = (Get-Location).Path
$wrapperSrc = (Resolve-Path $Wrapper).Path
$t = Join-Path $env:RUNNER_TEMP ("wr-" + $Label)
Remove-Item -Recurse -Force $t -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $t | Out-Null
git clone -q --no-hardlinks $src "$t\work" 2>&1 | Out-Null
git -C "$t\work" checkout -q -B main 2>&1 | Out-Null
git clone -q --bare "$t\work" "$t\origin.git" 2>&1 | Out-Null
git -C "$t\work" remote set-url origin "$t\origin.git"
git -C "$t\work" fetch -q origin 2>&1 | Out-Null
Copy-Item $wrapperSrc "$t\work\scheduling\self-hosted\run-atlas.ps1" -Force
$env:PATH = "$env:FAKEBIN;$env:PATH"
$env:ATLAS_LOG_DIR = "$t\logs"
$env:FAKE_CLAUDE_LOG = "$t\args.txt"
$expected = Get-Content -Raw "$t\work\scheduling\cloud-daily.txt"

# 1. as in cheat sheet 6 (relative path, from the repository root)
Push-Location "$t\work"
& $Exe -NoProfile -ExecutionPolicy Bypass -File scheduling\self-hosted\run-atlas.ps1 daily
$code = $LASTEXITCODE
Pop-Location
$log = Get-ChildItem "$t\logs" -Filter '*-daily.log' | Select-Object -First 1
$logText = if ($log) { Get-Content -Raw $log.FullName } else { '' }
Check "$Exe -File run-atlas.ps1 daily: wrapper exit 0" ($code -eq 0) "exit $code"
Check 'log written to ATLAS_LOG_DIR with "=== exit 0"' ($logText -match '=== exit 0') ("log: " + ($logText -replace '\s+', ' ').Substring(0, [Math]::Min(300, $logText.Length)))
Check 'git pull ran (log mentions up to date / main)' ($logText -match 'Already up to date|up-to-date|main') ''
$seen = if (Test-Path "$t\args.txt") { (Get-Content -Raw -Encoding UTF8 "$t\args.txt") -split "`n<<<ARG>>>`n" } else { @() }
Check 'claude received -p <cloud-daily.txt> --permission-mode dontAsk' ($seen.Count -eq 4 -and $seen[0] -eq '-p' -and $seen[1] -eq $expected -and $seen[3] -eq 'dontAsk') ("args=$($seen.Count); prompt intact=$($seen.Count -gt 1 -and $seen[1] -eq $expected)")

# 2. failing claude -> wrapper must exit non-zero (like run-atlas.sh)
$env:FAKE_CLAUDE_EXIT = '1'
Push-Location "$t\work"
& $Exe -NoProfile -ExecutionPolicy Bypass -File scheduling\self-hosted\run-atlas.ps1 daily
$code = $LASTEXITCODE
Pop-Location
Remove-Item Env:FAKE_CLAUDE_EXIT
Check 'claude exit 1 -> wrapper exit non-zero' ($code -ne 0) "exit $code"

# 3. the schtasks /TR command, executed directly from another folder (absolute path, as Task Scheduler does)
$tr = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File $t\work\scheduling\self-hosted\run-atlas.ps1 daily"
Push-Location $env:RUNNER_TEMP
cmd /c $tr
$code = $LASTEXITCODE
Pop-Location
Check 'schtasks /TR command line run directly (from another folder)' ($code -eq 0) "exit $code"
$course = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\YOU\atlas-harbor-pine\scheduling\self-hosted\run-atlas.ps1 daily'
Check 'schtasks /TR length <= 261 characters' ($course.Length -le 261) "length $($course.Length)"

Write-Host '=== SUMMARY'
$results | ForEach-Object { Write-Host $_ }
$results | Out-File -Encoding utf8 (Join-Path $env:RUNNER_TEMP "results-$Label.txt")
$failed = @($results | Where-Object { $_ -match '\| FAIL \|' }).Count
Write-Host "failed checks: $failed"
if ($failed -gt 0) { exit 1 } else { exit 0 }
