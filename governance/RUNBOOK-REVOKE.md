# RUNBOOK-REVOKE — stop Atlas and take back every access

Use this when something looks wrong, or when you stop using Atlas. Work top to bottom: pause first, then remove access.
Fill in the **Where / name** column for your own setup today, and add a row the same day you grant Atlas a new access.
This is a checklist, not a rule file: `check-governance.mjs` does not read it, and Atlas never edits it.

## 1. Pause (minutes)
| # | Step | How | Where / name (fill in) | Tested on |
|---|---|---|---|---|
| 1 | Kill switch | GitHub → your repository → **Add file → Create new file** → `governance/STOP` → one line with the reason → **Commit directly to main**. Every run stops at step 1 (`health: STOPPED`). Delete the file to resume. | repo: | |
| 2 | Cloud scheduled task(s) | claude.ai/code/routines → task → switch **off** (or **Delete**). If the task has an API trigger token: Edit → **Delete token**. | tasks: | |
| 3 | Self-hosted schedule | macOS: `launchctl unload ~/Library/LaunchAgents/academy.atlas.daily.plist` · Linux/macOS cron: `crontab -e`, remove the Atlas line · Windows: Task Scheduler → "Atlas daily" → **Disable** (or `schtasks /Delete /TN "Atlas daily"`). | machine: | |
| 4 | Desktop scheduled task | Claude Desktop → Code → Scheduled → task → revoke its **Always allowed** approvals → **Delete**. Its folder `~/.claude/scheduled-tasks/<name>/` stays on disk until you remove it. | task: | |

## 2. Remove access
| # | Access | How to revoke | Where / name (fill in) | Tested on |
|---|---|---|---|---|
| 5 | GitHub (Claude app) | GitHub → avatar → **Settings → Applications → Installed GitHub Apps → Claude → Configure** → remove this repository, or uninstall. | | |
| 6 | Connectors on tasks | Remove them from each task, or disconnect them at claude.ai/customize/connectors. | | |
| 7 | Cloud environment | Edit the environment → delete network secrets; remove your shop's domain from **Allowed domains** if you added one. | environment: | |
| 8 | Login on a self-hosted machine | In Claude Code: `/logout`. If you created a token with `claude setup-token`, remove `CLAUDE_CODE_OAUTH_TOKEN` from that machine's environment or keychain. | machine: | |
| 9 | Search Console (optional) | Search Console → Settings → Users and permissions → remove the service account; Google Cloud → IAM → Service accounts → Keys → delete the key. | | |
| 10 | Shop passwords (e.g. WordPress application password) | In the shop: Users → the operator's user → Application Passwords → **Revoke**. Then consider removing the user. | user: | |
| 11 | The demo site | Settings → Pages → **Unpublish site**, or delete the repository. | | |

## 3. Undo one change instead
Every change is one commit `atlas(<id>): …` with a copy of the old file in `snapshots/<id>/`. Restore that file, run
`node site/build.mjs`, commit and push. The ledger keeps its history; nothing is deleted.
