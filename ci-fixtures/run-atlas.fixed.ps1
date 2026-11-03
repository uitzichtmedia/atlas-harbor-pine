# Runs one Atlas loop on Windows with Claude Code (headless). Tested on GitHub Actions windows-latest (Windows PowerShell 5.1
# and PowerShell 7) with a stand-in for claude.exe — see TEST-LOG.md. Not yet run with a real, logged-in Claude Code on Windows.
# Usage (PowerShell):  powershell -ExecutionPolicy Bypass -File scheduling\self-hosted\run-atlas.ps1 daily
# Needs: Claude Code installed and logged in (run `claude` once by hand), Git for Windows with push access, Node 18+.
param([ValidateSet('daily','plan','execute','brief')][string]$Run = 'daily')
# Continue, not Stop: git and claude write normal progress to stderr, which Windows PowerShell 5.1 would treat as a fatal error.
$ErrorActionPreference = 'Continue'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$LogDir = if ($env:ATLAS_LOG_DIR) { $env:ATLAS_LOG_DIR } else { Join-Path $HOME 'atlas-logs' }
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir ("atlas-{0}-{1}.log" -f (Get-Date -Format 'yyyy-MM-dd'), $Run)
# Task Scheduler starts with the machine PATH: add the usual Claude Code install folder (appended, so your own PATH wins).
$env:PATH = "$env:PATH;$env:USERPROFILE\.local\bin"
Set-Location $Repo
"=== Atlas $Run run $((Get-Date).ToUniversalTime().ToString('s'))Z in $Repo" | Add-Content $Log
& git pull --ff-only origin main 2>&1 | ForEach-Object { "$_" } | Add-Content $Log
if ($LASTEXITCODE -ne 0) { $rc = $LASTEXITCODE; "=== git pull failed, exit $rc" | Add-Content $Log; exit $rc }
$Prompt = Get-Content -Raw -Encoding UTF8 (Join-Path $Repo "scheduling\cloud-$Run.txt")
# Windows PowerShell 5.1 (and PowerShell before 7.3) drops double quotes inside an argument passed to a program;
# escape them so claude receives the prompt text exactly as it is in the file.
if ($PSVersionTable.PSVersion -lt [version]'7.3') { $Prompt = $Prompt -replace '(\\*)"', '$1$1\"' }
# dontAsk: only commands allowed in .claude/settings.json run; anything else is refused, nobody is asked.
& claude -p $Prompt --permission-mode dontAsk 2>&1 | ForEach-Object { "$_" } | Add-Content $Log
$rc = $LASTEXITCODE
"=== exit $rc" | Add-Content $Log
exit $rc
