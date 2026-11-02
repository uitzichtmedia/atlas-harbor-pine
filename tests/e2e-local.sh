#!/usr/bin/env bash
# End-to-end local loop (TEST-LOG.md): copies this repo to a temp dir, uses a local bare git repo as "origin" and a
# local "Pages simulator" (a clone of origin that pulls every 5 s, served over HTTP). Needs bash, git, python3, curl, Node 18+.
# Usage: bash tests/e2e-local.sh   (takes about 1–2 minutes; touches nothing outside the temp dir)
set -u
PORT=${ATLAS_E2E_PORT:-8765}
SRC="$(cd "$(dirname "$0")/.." && pwd)"
T=$(mktemp -d "${TMPDIR:-/tmp}/atlas-e2e-XXXX")
step() { echo; echo "\$ $*"; "$@"; echo "[exit $?]"; }
echo "TEMP=$T  node $(node --version)  git $(git --version | cut -d' ' -f3)"
# 1. clean copy ("use this template"), bare origin, Pages simulator
cp -r "$SRC" "$T/repo"; rm -rf "$T/repo/.git"
git init -q --bare -b main "$T/origin.git"
cd "$T/repo"
git init -q -b main && git config user.email atlas@example.test && git config user.name "Atlas test"
git remote add origin "$T/origin.git"
# Pages simulator: a clone of origin that pulls every 5 s, served over HTTP from its docs/ folder (deploy delay ~ up to 5 s + 25 s sleep)
git add -A && git commit -qm "Atlas starter (from template)" && git push -q origin main
git clone -q "$T/origin.git" "$T/pages"
( while true; do sleep 5; if [ -f "$T/deploy-delay" ]; then sleep "$(cat "$T/deploy-delay")"; rm -f "$T/deploy-delay"; fi; git -C "$T/pages" pull -q --ff-only origin main 2>/dev/null; done ) &
PULLER=$!
node "$T/repo/ops/serve.mjs" --dir="$T/pages/docs" --port=$PORT > "$T/serve.log" 2>&1 &
SERVER=$!
sleep 1
BASE=http://127.0.0.1:$PORT/
trap 'kill $PULLER $SERVER 2>/dev/null; rm -rf "$T"' EXIT
# 2. config + tests
node -e "const f='atlas.config.json',c=JSON.parse(require('fs').readFileSync(f));c.base_url='$BASE';c.verify.interval_seconds=10;require('fs').writeFileSync(f,JSON.stringify(c,null,2)+'\n')"
step node --test --test-reporter=dot
step node site/build.mjs
git add -A && git commit -qm "Set base_url, build" && git push -q origin main && echo "pushed config+build"; sleep 7
# 3. PLAN (as prompts/plan.md)
step node ops/health.mjs --skip-evidence --record-run=plan
step node ops/collect-site.mjs
step node ops/collect-gsc.mjs
step node ops/health.mjs
NEW='Warm amber, vanilla bean and a little smoked wood in a 200 g soy candle. Made for long evenings with a book, with about 45 hours of burn time.'
D=$(date -u +%Y-%m-%d)
step node ops/ledger.mjs add id="meta-amber-evening" title="Rewrite short meta description: Amber Evening" priority="3" goal="G1" action="edit_meta_description" file="site/content/products/amber-evening.md" field="meta_description" old_value="Warm amber candle." new_value="$NEW" url="products/amber-evening/" expected_value="Replaces an 18-character snippet with a full one; no traffic data, expected value unknown (G1)." risk="low: one meta line, facts from the product file" acceptance="Live page products/amber-evening/ serves the new meta description and no longer the old one (verify-live --ledger-item)" evidence="evidence/site-$D.json"
step node ops/ledger.mjs list
git add ledger.json evidence health.json && git commit -qm "atlas(plan): 1 new task" && step git push origin HEAD:main
# 4. EXECUTE (as prompts/execute.md)
step node ops/health.mjs --record-run=execute
step node ops/ledger.mjs today
step node ops/ledger.mjs next
step node ops/ledger.mjs set meta-amber-evening state=EXECUTING
echo; echo "# DONE gate: try to mark DONE without proof"
step node ops/ledger.mjs set meta-amber-evening state=DONE output="meta updated"
mkdir -p snapshots/meta-amber-evening && cp site/content/products/amber-evening.md snapshots/meta-amber-evening/amber-evening.md
echo "# snapshot written: snapshots/meta-amber-evening/amber-evening.md"
# the executor's edit: replace exactly the one front-matter line
python3 - "$NEW" <<'PY'
import sys,re
f='site/content/products/amber-evening.md'; s=open(f).read()
n=re.sub(r'^meta_description: .*$', 'meta_description: "%s"' % sys.argv[1], s, count=1, flags=re.M)
open(f,'w').write(n)
PY
step git diff --stat
step git diff site/content/products/amber-evening.md
step node site/build.mjs
step node --test --test-reporter=dot
git add site/content/products/amber-evening.md docs snapshots/meta-amber-evening ledger.json
step git commit -qm "atlas(meta-amber-evening): Rewrite short meta description: Amber Evening"
echo 25 > "$T/deploy-delay"   # simulate a slow Pages deploy
step git push origin HEAD:main
SHA=$(git rev-parse --short HEAD); echo "commit $SHA"
step node ops/verify-live.mjs --ledger-item=meta-amber-evening --wait-minutes=1.5
PROOF=$(ls -t evidence/verify-meta-amber-evening-*.json | head -1)
step node ops/ledger.mjs set meta-amber-evening state=VERIFIED output="site/content/products/amber-evening.md: meta_description changed in commit $SHA" verification="$PROOF PASS" external_result="${BASE}products/amber-evening/"
step node -e "console.log(require('./evidence/gsc-$D.json').skipped)"
step node ops/ledger.mjs set meta-amber-evening state=DONE
step node ops/ledger.mjs show meta-amber-evening
git add ledger.json evidence health.json && git commit -qm "atlas(meta-amber-evening): DONE" && step git push origin HEAD:main
# 5. BRIEF (as prompts/brief.md)
step node ops/health.mjs --skip-evidence --record-run=brief
cat > briefings/$D.md <<B
# Atlas briefing — $D

## Done & verified
- meta-amber-evening: the Amber Evening page now has a full search snippet instead of 18 characters — ${BASE}products/amber-evening/

## Waiting for measurement
None. Search Console is not connected, so there is no traffic data.

## Needs your decision
None.

## Problems
- 7 pages still have SEO issues; Atlas plans them tomorrow.
B
step node ops/brief-check.mjs briefings/$D.md
git add briefings health.json && git commit -qm "atlas(brief): $D" && step git push origin HEAD:main
# 6. Re-collect live, STOP switch, origin history
step node ops/collect-site.mjs
touch governance/STOP; step node ops/health.mjs; rm governance/STOP
echo; echo "# origin (bare repo) history:"; git -C "$T/origin.git" log --oneline main
echo; echo "# live meta tag served by the Pages simulator:"; curl -s "${BASE}products/amber-evening/" | grep 'name="description"'
# 7. self-hosted wrapper with a stand-in claude
mkdir -p "$T/bin"; printf '#!/usr/bin/env bash\necho "FAKE claude called with: $1" | cut -c1-120; echo "args: ${@:2}"\n' > "$T/bin/claude"; chmod +x "$T/bin/claude"
PATH="$T/bin:$PATH" ATLAS_LOG_DIR="$T/logs" bash scheduling/self-hosted/run-atlas.sh plan; RC=$?; echo "[run-atlas.sh exit $RC]"; cat "$T/logs/"*.log
if [ "$RC" -ne 0 ]; then echo "FAIL: run-atlas.sh exited $RC"; exit 1; fi
