# Runs one Atlas loop on Windows with Claude Code (headless). UNTESTED on Windows — see TEST-LOG.md.
# Usage (PowerShell):  powershell -ExecutionPolicy Bypass -File scheduling\self-hosted\run-atlas.ps1 daily
# Needs: Claude Code installed and logged in (run `claude` once by hand), Git for Windows with push access, Node 18+.
param([ValidateSet('daily','plan','execute','brief')][string]$Run = 'daily')
$ErrorActionPreference = 'Stop'
$Repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$LogDir = if ($env:ATLAS_LOG_DIR) { $env:ATLAS_LOG_DIR } else { Join-Path $HOME 'atlas-logs' }
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir ("atlas-{0}-{1}.log" -f (Get-Date -Format 'yyyy-MM-dd'), $Run)
Set-Location $Repo
"=== Atlas $Run run $((Get-Date).ToUniversalTime().ToString('s'))Z in $Repo" | Add-Content $Log
git pull --ff-only origin main *>> $Log
$Prompt = Get-Content -Raw (Join-Path $Repo "scheduling\cloud-$Run.txt")
claude -p $Prompt --permission-mode dontAsk *>> $Log
"=== exit $LASTEXITCODE" | Add-Content $Log
