# Scheduling Atlas

Atlas does nothing until something starts it. You have two ways. Pick **one**: running both doubles the work and the usage.

| | Cloud scheduled task (recommended) | Self-hosted (your own computer) |
|---|---|---|
| Runs when your laptop is closed | yes | no — the computer must be on and awake |
| Setup | 10 minutes in the browser | 15–30 minutes, some terminal work |
| Where it runs | Anthropic's cloud, on a fresh copy of your repo | your Mac / Linux / Windows machine |
| Needs | Claude Pro, Max, Team or Enterprise; GitHub connected to Claude | Claude Code installed and logged in; git push access |
| Network | must allow your `*.github.io` site (step 3 below) | your normal internet |
| Status in this starter | run in the cloud by Claude on the course's demo repository (see TEST-LOG.md) | `run-atlas.sh` and `run-atlas.ps1` tested with a stand-in for `claude` (Windows: Windows PowerShell 5.1 and PowerShell 7 on GitHub Actions); not yet with a real logged-in `claude` on Windows |

**One combined task or three?** Start with **one combined daily task** (`cloud-daily.txt`): one run, one place to look.
Switch to **three tasks** (`cloud-plan.txt` 07:12, `cloud-execute.txt` 09:12, `cloud-brief.txt` 17:12) when you want the
planner and executor separated in time — for example to read the plan before anything is changed, or to stop the
executor alone. Each run starts from a fresh copy of `main`, so every run commits and pushes its own results.

## Option A — Cloud scheduled task
Cloud scheduled tasks are a research-preview feature of Claude Code on the web; screens and limits may change.

1. Go to **claude.ai/code/routines** (or type `/schedule` in Claude Code) and choose **New scheduled task**.
2. **Repository:** your copy of this starter.
3. **Environment → network access:** the default ("Trusted") list does **not** include GitHub Pages sites. Edit the
   environment: set network access to **Limited** (older screens call it **Custom**), add `YOUR-GITHUB-USERNAME.github.io` to **Allowed domains**, and tick
   **Also include default list of common package managers**. Without this, `collect-site` and `verify-live` fail with HTTP 403.
4. **Prompt:** paste the full text of `scheduling/cloud-daily.txt` (or one of the three files for the 3-task variant).
5. **Schedule:** daily. Pick a few minutes past the hour (for example 07:12); runs exactly on the hour may start late.
   Custom cron expressions without a `CRON_TZ=` prefix are read as UTC.
6. **Connectors:** remove all connectors. Atlas does not need any.
7. Save, then press **Run now** once and open the run to watch it. Check afterwards: a new commit on `main`,
   `briefings/<today>.md`, and `health.json`.

**Pushing to main.** Cloud runs push to a `claude/…` branch unless the prompt says otherwise. Atlas's prompts tell it to push
to `main`, because GitHub Pages publishes from `main`. If your repository has branch protection on `main`, the push is refused —
see TROUBLESHOOTING.md.

**Approvals.** Cloud runs start in auto mode: a safety classifier allows or blocks each action. Atlas's prompts only use
commands that `.claude/settings.json` allows. If a run stops to wait for an approval, open it from the task page, answer,
and tell Claude (or fix the prompt) so it does not happen again.

## Option B — Self-hosted (Mac, Linux, Windows)
All three use `scheduling/self-hosted/run-atlas.sh` (or `.ps1`), which runs
`claude -p "<prompt>" --permission-mode dontAsk` in your repository. *dontAsk* means: only commands allowed in
`.claude/settings.json` run; anything else is refused and nobody is asked. Logs go to `~/atlas-logs/`.

First run it by hand once: `bash scheduling/self-hosted/run-atlas.sh daily` (Windows:
`powershell -ExecutionPolicy Bypass -File scheduling\self-hosted\run-atlas.ps1 daily`).

**macOS (launchd)** — runs even after a restart; a missed run starts when the Mac wakes.
1. Open `scheduling/self-hosted/academy.atlas.daily.plist` and replace `/Users/YOU/atlas-harbor-pine` (twice) with your path.
2. `cp scheduling/self-hosted/academy.atlas.daily.plist ~/Library/LaunchAgents/`
3. `launchctl load ~/Library/LaunchAgents/academy.atlas.daily.plist` — test at once with `launchctl start academy.atlas.daily`.
4. Stop: `launchctl unload ~/Library/LaunchAgents/academy.atlas.daily.plist`.

**Linux / macOS (cron)** — `crontab -e`, add one line (07:12 every day, computer's local time):
```
12 7 * * * /bin/bash "$HOME/atlas-harbor-pine/scheduling/self-hosted/run-atlas.sh" daily
```
3-task variant: three lines with `plan` at 7:12, `execute` at 9:12, `brief` at 17:12.

**Windows (Task Scheduler)** — `run-atlas.ps1` and the exact `/TR` command line below were tested on Windows (GitHub Actions,
with a stand-in for `claude`); registering the task itself was not tested. The steps follow Microsoft's standard procedure.
1. Install Git for Windows, Node.js 18+ and Claude Code; run `claude` once and log in.
2. Task Scheduler → **Create Basic Task** → name "Atlas daily" → **Daily**, 07:12 → **Start a program**.
3. Program: `powershell.exe` · Arguments:
   `-NoProfile -ExecutionPolicy Bypass -File "C:\Users\YOU\atlas-harbor-pine\scheduling\self-hosted\run-atlas.ps1" daily`
   · Start in: `C:\Users\YOU\atlas-harbor-pine`
4. Properties → tick **Run whether user is logged on or not** only if your git credentials work for that account; otherwise keep
   "Run only when user is logged on". Tick **Run task as soon as possible after a scheduled start is missed**.
   Command-line alternative:
   `schtasks /Create /TN "Atlas daily" /SC DAILY /ST 07:12 /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Users\YOU\atlas-harbor-pine\scheduling\self-hosted\run-atlas.ps1 daily"`
   If the path to your repository contains a space (for example `C:\Users\John Smith\…`), use the Task Scheduler steps 2–3
   instead: there the path sits in quotes in the Arguments field.
5. Stop: Task Scheduler → right-click "Atlas daily" → **Disable** or **Delete** (or `schtasks /Delete /TN "Atlas daily"`).
