# B27 Windows check: runs the course's PowerShell commands (scripts L3.x-L6.x, R-*.txt, cheat sheets) exactly as printed,
# in Windows PowerShell 5.1 and PowerShell 7. Each check prints PASS/FAIL; the script exits 1 if any check failed.
# Run from the repository root. Needs: Node on PATH, $env:FAKEBIN with the stand-in claude.exe (see fake-claude.cs).
param([string]$Label = 'shell')
$ErrorActionPreference = 'Continue'
$results = New-Object System.Collections.ArrayList
function Check([string]$id, [bool]$ok, [string]$detail) {
  $line = '{0} | {1} | {2} | {3}' -f $Label, $id, $(if ($ok) { 'PASS' } else { 'FAIL' }), ($detail -replace '\r?\n', ' / ')
  [void]$results.Add($line); Write-Host $line
}
function Run([scriptblock]$sb) { $o = & $sb 2>&1 | Out-String; return @{ out = $o; code = $LASTEXITCODE } }

Write-Host "PowerShell $($PSVersionTable.PSVersion) ($($PSVersionTable.PSEdition)) - node $(node --version) - git autocrlf=$(git config core.autocrlf)"
$repo = (Get-Location).Path

# --- L5.1 / build / evidence -------------------------------------------------------------------------------
$r = Run { node site/build.mjs };                     Check 'build' ($r.code -eq 0) ("exit $($r.code); " + ($r.out -split "`n")[0])
$r = Run { node ops/collect-site.mjs --local=docs };  Check 'collect-site --local=docs' ($r.code -eq 0 -and $r.out -match 'META_MISSING') "exit $($r.code)"
$r = Run { node ops/health.mjs };                     Check 'health HEALTHY' ($r.code -eq 0 -and $r.out -match 'HEALTHY') "exit $($r.code)"
$r = Run { git status --porcelain -- docs };          Check 'build is EOL-stable (no docs diff after rebuild)' ([string]::IsNullOrWhiteSpace($r.out)) $r.out

# --- L5.3 ledger sequence, single-quoted arguments ------------------------------------------------------------
$future = (Get-Date).ToUniversalTime().AddDays(28).ToString('yyyy-MM-dd')
$r = Run { node ops/ledger.mjs };       Check 'L5.3 usage line' ($r.out -match '^commands: add id=') "exit $($r.code)"
$r = Run { node ops/ledger.mjs list };  Check 'L5.3 list' ($r.code -eq 0) "exit $($r.code)"
$r = Run { node ops/ledger.mjs add id=try-meta-orange-and-clove 'title=Practice: write meta description, Orange and Clove' priority=1 }
Check 'L5.3 add try-meta-orange-and-clove' ($r.code -eq 0 -and $r.out -match 'added try-meta-orange-and-clove') $r.out
$r = Run { node ops/ledger.mjs add id=try-meta-lavender-hearth 'title=Practice: rewrite short meta description, Lavender Hearth' priority=1 }
Check 'L5.3 add try-meta-lavender-hearth' ($r.code -eq 0) $r.out
$r = Run { node ops/ledger.mjs add id=try-alt-linen-morning 'title=Practice: add alt text, Linen Morning photo' priority=1 }
Check 'L5.3 add try-alt-linen-morning' ($r.code -eq 0) $r.out
$r = Run { node ops/ledger.mjs show try-meta-orange-and-clove }
Check 'L5.3 title with spaces+comma stored intact' ($r.out -match '"title": "Practice: write meta description, Orange and Clove"') ''
$r = Run { node ops/ledger.mjs list };  Check 'L5.3 list shows three try- lines' (([regex]::Matches($r.out, 'p1 try-')).Count -eq 3) ''
$r = Run { node ops/ledger.mjs next };  Check 'L5.3 next = try-meta-orange-and-clove' ($r.out -match '"id":"try-meta-orange-and-clove"') ''
$r = Run { node ops/ledger.mjs add id=try-ctr-orange-and-clove 'title=Practice: check CTR after meta change, Orange and Clove' priority=1 not_before=${future}T09:00:00Z }
Check 'L5.3 add with not_before' ($r.code -eq 0) $r.out
$r = Run { node ops/ledger.mjs next };  Check 'L5.3 next still orange (not_before in future)' ($r.out -match '"id":"try-meta-orange-and-clove"') ''
$r = Run { node ops/ledger.mjs set try-meta-orange-and-clove state=EXECUTING }
Check 'L5.3 set EXECUTING' ($r.code -eq 0 -and $r.out -match '-> EXECUTING') $r.out
$r = Run { node ops/ledger.mjs set try-meta-orange-and-clove state=DONE 'output=meta description updated' }
Check 'L5.3 DONE without proof refused, $LASTEXITCODE = 1' ($r.code -eq 1 -and $r.out -match 'refused: DONE needs proof') ("LASTEXITCODE=$($r.code); " + $r.out.Trim())
$r = Run { node ops/ledger.mjs set try-meta-lavender-hearth state=DONE output=x verification=y external_result=z }
Check 'L5.3 READY -> DONE not allowed' ($r.code -eq 1 -and $r.out -match 'READY -> DONE not allowed') $r.out.Trim()
$r = Run { node ops/ledger.mjs set try-alt-linen-morning state=BLOCKED }
Check 'L5.3 BLOCKED without reason refused' ($r.code -eq 1 -and $r.out -match 'BLOCKED needs a blocker reason') $r.out.Trim()
$r = Run { node ops/ledger.mjs set try-alt-linen-morning state=BLOCKED 'blocker=Owner: confirm the photo shows the 200 g jar' }
Check 'L5.3 BLOCKED with quoted reason' ($r.code -eq 0) $r.out.Trim()
$r = Run { node ops/ledger.mjs show try-alt-linen-morning }
Check 'L5.3 blocker text stored intact' ($r.out -match '"blocker": "Owner: confirm the photo shows the 200 g jar"') ''
$r = Run { node ops/ledger.mjs next };  Check 'L5.3 next = lavender' ($r.out -match '"id":"try-meta-lavender-hearth"') ''
$r = Run { node ops/ledger.mjs set try-meta-orange-and-clove state=READY }; Check 'L5.3 back to READY' ($r.code -eq 0) $r.out.Trim()
$r = Run { node --test tests/ledger.test.mjs };  Check 'L5.3 node --test tests/ledger.test.mjs' ($r.code -eq 0 -and $r.out -match '# fail 0') (($r.out -split "`n" | Select-String '^# (pass|fail)') -join ' ')
$r = Run { node ops/ledger.mjs check };  Check 'L5.3 check ok' ($r.code -eq 0 -and $r.out -match 'ok') $r.out.Trim()
$r = Run { node ops/ledger.mjs today };  Check 'L5.3 today' ($r.code -eq 0) $r.out.Trim()
$r = Run { git restore ledger.json };    Check 'L5.3 git restore ledger.json' ($r.code -eq 0) $r.out.Trim()
$r = Run { node ops/ledger.mjs list };   Check 'L5.3 practice tasks gone' (-not ($r.out -match 'try-')) ''

# --- L4.4 / L6.3 kill switch -----------------------------------------------------------------------------
$r = Run { New-Item governance/STOP -ItemType File };  Check 'L4.4 New-Item governance/STOP -ItemType File' (Test-Path governance/STOP) ''
$r = Run { node ops/health.mjs };  Check 'L6.3 health STOPPED exit 3' ($r.code -eq 3 -and $r.out -match 'STOPPED') "exit $($r.code)"
$r = Run { Remove-Item governance/STOP };  Check 'L6.3 Remove-Item governance/STOP' (-not (Test-Path governance/STOP)) ''
$r = Run { New-Item governance/STOP };     Check 'cheat-sheet 6: New-Item governance/STOP (no -ItemType)' ((Test-Path governance/STOP -PathType Leaf)) $r.out.Trim()
Remove-Item governance/STOP -ErrorAction SilentlyContinue
$r = Run { node ops/health.mjs };  Check 'L6.3 health back to HEALTHY' ($r.code -eq 0) "exit $($r.code)"

# --- L5.4 executor checks + owner rollback drill -----------------------------------------------------------
$r = Run { dir snapshots\meta-orange-and-clove };  Check 'L5.4 dir snapshots\<id>' ($r.out -match 'orange-and-clove.md') ''
$r = Run { git log --oneline -3 };  Check 'L5.4 git log --oneline -3' ($r.code -eq 0) ''
$c = (git log --format=%h -1 --grep='atlas(meta-orange-and-clove): Write').Trim()
$r = Run { git diff "$c~1" $c -- site/content/products/orange-and-clove.md }
Check 'L5.4 git diff <c>~1 <c> -- file (one line)' ($r.out -match '\+meta_description') "commit $c"
$r = Run { git restore --source=$c~1 site/content/products/orange-and-clove.md }
$s = git diff --stat -- site/content/products/orange-and-clove.md | Out-String
Check 'L5.4 rollback drill: git restore --source=<c>~1 <file>' ($r.code -eq 0 -and $s -match '1 deletion') $s.Trim()
git restore site/content/products/orange-and-clove.md

# --- L5.5 verify-live with double-quoted text (local server) -----------------------------------------------
$srv = Start-Process node -ArgumentList 'ops/serve.mjs' -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 6
$r = Run { node ops/verify-live.mjs --path=products/orange-and-clove/ --must-contain="Our winter kitchen in a jar." --wait-minutes=0.5 --interval=3 --base=http://localhost:8080/ }
Check 'L5.5 verify-live --must-contain="<sentence with spaces>" PASS' ($r.code -eq 0 -and $r.out -match 'PASS') (($r.out -split "`n" | Select-Object -Last 2) -join ' ')
$r = Run { node ops/verify-live.mjs --path=products/orange-and-clove/ --must-contain="A sentence that is not there" --wait-minutes=0.1 --interval=2 --base=http://localhost:8080/ }
Check 'L5.5 verify-live FAIL exit 1' ($r.code -eq 1 -and $r.out -match 'FAIL') "exit $($r.code)"
Stop-Process -Id $srv.Id -ErrorAction SilentlyContinue
git restore evidence 2>$null

# --- L3.1 / L3.2 / L3.3 / L3.4 shell commands -------------------------------------------------------------
$r = Run { mkdir $HOME\atlas-course -Force; cd $HOME\atlas-course; Get-Location }
Check 'L3.1 L1: mkdir $HOME\atlas-course; cd' ($r.out -match 'atlas-course') ''
Set-Location $repo
$env:ANTHROPIC_API_KEY = 'sk-demo-not-real'
$r = Run { echo $env:ANTHROPIC_API_KEY };  Check 'L3.2 echo $env:ANTHROPIC_API_KEY' ($r.out -match 'sk-demo-not-real') ''
$r = Run { Remove-Item Env:ANTHROPIC_API_KEY };  Check 'L3.2 Remove-Item Env:ANTHROPIC_API_KEY' (-not (Test-Path Env:ANTHROPIC_API_KEY)) ''
$r = Run { Remove-Item Env:ANTHROPIC_API_KEY }
Check 'L3.2 Remove-Item when no key is set (informational)' $true ('prints: ' + ($r.out.Trim() -split "`n")[0])
$env:CLAUDE_CODE_OAUTH_TOKEN = "your-token";  Check 'L3.2 $env:CLAUDE_CODE_OAUTH_TOKEN = "your-token"' ($env:CLAUDE_CODE_OAUTH_TOKEN -eq 'your-token') ''
Remove-Item Env:CLAUDE_CODE_OAUTH_TOKEN
$r = Run { Set-Content .env "DEMO_ONLY=not-a-real-secret" };  Check 'L3.4 H4 Set-Content .env' ((Get-Content .env) -eq 'DEMO_ONLY=not-a-real-secret') ''
$r = Run { git status --porcelain };  Check 'L3.4 .env is git-ignored' (-not ($r.out -match '\.env')) $r.out.Trim()
$r = Run { Remove-Item .env };  Check 'L3.4 H6 Remove-Item .env' (-not (Test-Path .env)) ''
$env:GSC_KEY_FILE = "$HOME\keys\atlas-gsc.json";  Check 'R-gsc-setup $env:GSC_KEY_FILE = "$HOME\keys\..."' ($env:GSC_KEY_FILE -like '*\keys\atlas-gsc.json') $env:GSC_KEY_FILE
Remove-Item Env:GSC_KEY_FILE

# --- headless claude command lines: what does claude.exe actually receive? (stand-in exe, no model call) -------
$env:PATH = "$env:FAKEBIN;$env:PATH"
$env:FAKE_CLAUDE_LOG = Join-Path $env:RUNNER_TEMP "args-$Label.txt"
function ArgsSeen { return (Get-Content -Raw -Encoding UTF8 $env:FAKE_CLAUDE_LOG) -split "`n<<<ARG>>>`n" }
claude -p "Read the product files in site/content/products/. List the three products with the shortest meta_description, with the number of characters of each. Do not create, change or delete any files." --permission-mode dontAsk | Out-Null
$a = ArgsSeen
Check 'L3.4 H1 claude -p "..." --permission-mode dontAsk' ($a.Count -eq 4 -and $a[1] -eq 'Read the product files in site/content/products/. List the three products with the shortest meta_description, with the number of characters of each. Do not create, change or delete any files.' -and $a[3] -eq 'dontAsk') "args=$($a.Count)"
claude -p "How many product files are in site/content/products/? Answer with one number. Do not change any files." --permission-mode dontAsk --output-format json | Out-Null
$a = ArgsSeen;  Check 'L3.4 H7 --output-format json' ($a.Count -eq 6 -and $a[5] -eq 'json') "args=$($a.Count)"
claude -p "In governance/PRINCIPLES.md, add a tenth rule: answer every customer within one day." --permission-mode dontAsk | Out-Null
$a = ArgsSeen;  Check 'L4.1 K2 claude -p (colon in prompt)' ($a[1] -eq 'In governance/PRINCIPLES.md, add a tenth rule: answer every customer within one day.') "args=$($a.Count)"
$env:FAKE_CLAUDE_EXIT = '1'; claude -p "x" | Out-Null
Check 'L3.4 H3 $LASTEXITCODE after claude' ($LASTEXITCODE -eq 1) "LASTEXITCODE=$LASTEXITCODE"
Remove-Item Env:FAKE_CLAUDE_EXIT
$prompt = Get-Content -Raw scheduling\cloud-daily.txt
claude -p $prompt --permission-mode dontAsk | Out-Null
$a = ArgsSeen;  Check 'claude -p $Prompt (cloud-daily.txt, contains double quotes) arrives intact' ($a.Count -eq 4 -and $a[1] -eq $prompt) ("args=$($a.Count); first 80 chars seen: " + $a[1].Substring(0, [Math]::Min(80, $a[1].Length)))

# --- L4.6 E1w: unpack the governance templates ------------------------------------------------------------
$dl = Join-Path $HOME 'Downloads'; New-Item -ItemType Directory -Force $dl | Out-Null
Copy-Item ci-fixtures\governance-templates.zip $dl -Force
Remove-Item -Recurse -Force $HOME\atlas-course\my-operator -ErrorAction SilentlyContinue
$r = Run {
  New-Item -ItemType Directory -Force $HOME\atlas-course\my-operator
  Expand-Archive $HOME\Downloads\governance-templates.zip -DestinationPath $HOME\atlas-course\my-operator\
  cd $HOME\atlas-course\my-operator
  dir governance
}
Check 'L4.6 E1w New-Item + Expand-Archive + cd + dir governance' ($r.out -match 'check-governance.mjs' -and $r.out -match 'PRINCIPLES.md') ''
$r = Run { node governance/check-governance.mjs governance/ --templates }
Check 'L4.6 templates checker (--templates) in my-operator' ($r.code -eq 0) (($r.out.Trim() -split "`n")[-1])
$r = Run { Expand-Archive $HOME\Downloads\governance-templates.zip -DestinationPath $HOME\atlas-course\my-operator\ }
Check 'L4.6 E1w run twice (informational: fails if files exist)' $true ('exit/err: ' + (($r.out.Trim() -split "`n")[0]))
Set-Location $repo

Write-Host ''
Write-Host '=== SUMMARY'
$results | ForEach-Object { Write-Host $_ }
$results | Out-File -Encoding utf8 (Join-Path $env:RUNNER_TEMP "results-$Label.txt")
$failed = @($results | Where-Object { $_ -match '\| FAIL \|' }).Count
Write-Host "failed checks: $failed"
if ($failed -gt 0) { exit 1 } else { exit 0 }
