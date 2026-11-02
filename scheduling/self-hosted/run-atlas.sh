#!/usr/bin/env bash
# Runs one Atlas loop on your own Mac or Linux computer with Claude Code (headless).
# Usage: scheduling/self-hosted/run-atlas.sh [daily|plan|execute|brief]     (default: daily)
# Needs: Claude Code installed and logged in (run `claude` once by hand), git with push access to your repo, Node 18+.
set -euo pipefail
RUN="${1:-daily}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LOGDIR="${ATLAS_LOG_DIR:-$HOME/atlas-logs}"
mkdir -p "$LOGDIR"
LOG="$LOGDIR/atlas-$(date +%Y-%m-%d)-$RUN.log"
# cron and launchd start with a minimal PATH: add the usual install places of node and claude
# (appended, so a PATH you set yourself still wins).
export PATH="$PATH:$HOME/.local/bin:$HOME/.claude/local:/opt/homebrew/bin:/usr/local/bin"
cd "$REPO"
RC=0
{
  echo "=== Atlas $RUN run $(date -u +%Y-%m-%dT%H:%M:%SZ) in $REPO"
  git pull --ff-only origin main
  # dontAsk: only commands allowed in .claude/settings.json run; anything else is refused, nobody is asked.
  claude -p "$(cat "scheduling/cloud-$RUN.txt")" --permission-mode dontAsk || RC=$?
  echo "=== exit $RC"
} >>"$LOG" 2>&1
exit "$RC"
