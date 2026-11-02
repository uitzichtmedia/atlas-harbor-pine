# Atlas starter — your own AI operator, on a demo shop

*Uitzicht Academy · Claude Code for Business: Build Your Own AI Autopilot*

This repository is the running project of the course. It holds two things:

1. **Harbor & Pine Candles** — a small, fictional candle catalogue. It is a demo, not a shop: nothing is for sale.
   GitHub Pages publishes it for free from the `docs/` folder.
2. **Atlas** — an AI operator built with Claude Code. Every day it looks at the live site, picks what is worth fixing,
   makes one careful change, proves the change is live, and writes you a short briefing.

The site ships with real-looking SEO problems on purpose: two products without a meta description, two with one that is
too short, one image without alt text and two products with the same title. Watching Atlas find and fix them, one verified
change at a time, is the point of the demo.

You don't need to write code. You copy commands from this page and ask Claude to make edits.

---

## How Atlas works, in one picture

```
 07:12  PLAN     collect evidence from the live site → decide → write tasks in the ledger (READY)
 09:12  EXECUTE  take one READY task → snapshot → edit → build → commit + push → check the live page → VERIFIED
 17:12  BRIEF    write briefings/<date>.md: Done & verified · Waiting for measurement · Needs your decision · Problems
```

- The rules live in `governance/` (what Atlas may do alone, what needs you, what never happens).
- The **ledger** (`ledger.json`, via `ops/ledger.mjs`) refuses "done" without proof: what changed, how it was checked,
  and the live URL.
- `governance/STOP` is the kill switch. If that file exists, every run stops at its first step.

---

## Step by step

You need: a free **GitHub** account, a **Claude** plan with Claude Code (Pro, Max, Team or Enterprise), and for the local
steps **Node.js 18 or newer** and **git** (`node --version` and `git --version` should both print a version).

### 1. Make your own copy
1. Open the Atlas starter repository from the course resources and click **Use this template → Create a new repository**.
2. Owner: you. Name: `atlas-harbor-pine` (the name the course uses; any name works, it becomes part of your URL). Visibility: **Public**
   (GitHub Pages is free for public repositories).
3. Click **Create repository**.

### 2. Switch on GitHub Pages
1. In your new repository: **Settings → Pages**.
2. **Build and deployment → Source: Deploy from a branch**. Branch: **main**, folder: **/docs**. Click **Save**.
3. Wait 1–3 minutes, then refresh the page. It shows *"Your site is live at https://YOUR-NAME.github.io/atlas-harbor-pine/"*.
   Open it: you should see the candle catalogue with a dark "Demo catalogue" bar at the top.

### 3. Tell Atlas where the site lives
Open `atlas.config.json` (on GitHub: click the file → pencil icon) and replace the placeholder with your exact Pages URL,
ending with a slash:
```json
"base_url": "https://YOUR-NAME.github.io/atlas-harbor-pine/",
```
Commit the change.

### 4. First local run (about 15 minutes)
Get the code onto your computer (GitHub → **Code → copy the HTTPS URL**):
```
git clone https://github.com/YOUR-NAME/atlas-harbor-pine.git
cd atlas-harbor-pine
node --test
```
All tests should pass (`# fail 0`). Then build the site with your URL and look at it:
```
node site/build.mjs
node ops/serve.mjs
```
Open http://localhost:8080/ in your browser. Press **Ctrl+C** in the terminal to stop the preview.

Collect evidence from the copy on your disk, then from the live site:
```
node ops/collect-site.mjs --local=docs
git add docs && git commit -m "Build with my base URL" && git push
node ops/collect-site.mjs
node ops/health.mjs
```
`collect-site` lists 8 pages with issues — those are the seeded problems. `health` should say `HEALTHY` (a warning about
`--local` evidence is fine on the first day; the live collect replaces it).

Now let Claude do one full loop with you watching. Start Claude Code in the folder (`claude`) and paste, one at a time:
```
Read CLAUDE.md, then read prompts/plan.md and carry out every step.
```
```
Read prompts/execute.md and carry out every step.
```
```
Read prompts/brief.md and carry out every step.
```
Claude asks before commands it isn't allowed to run on its own. Read what it wants to do, then answer.
Afterwards check: `node ops/ledger.mjs list` shows one task as VERIFIED or DONE, the live product page shows the new text,
and `briefings/<today>.md` exists.

### 5. First scheduled run
Follow **scheduling/README.md**. Short version for the cloud (recommended):
1. claude.ai/code/routines → **New scheduled task** → your repository.
2. Edit the environment's network access: **Custom**, allow `YOUR-NAME.github.io`, keep the default list ticked.
3. Paste the text of `scheduling/cloud-daily.txt` as the prompt. Daily at 07:12. Remove all connectors.
4. **Run now**, open the run, and read along. Check the new commit, the ledger and the briefing.

From then on, read `briefings/` each day. When Atlas needs a decision, answer in `decisions/inbox.md`
(`APPROVE <id>` or `REJECT <id>`).

---

## What it costs

| Item | Cost | Notes |
|---|---|---|
| Claude plan (Pro, Max, Team or Enterprise) | your plan's monthly price — see claude.com/pricing | Scheduled runs use your plan's usage like normal sessions. Check claude.ai/settings/usage. |
| Usage per day | about 1 run (combined) or 3 runs (split) | `health.json` → `runs_today` counts them. How much of your plan a run uses depends on the day's work; check your usage page after the first week. |
| GitHub account, public repository, GitHub Pages | €0 | Pages is for the demo site; GitHub's terms don't allow Pages to run a real online shop. |
| Google Search Console (optional) | €0 | Needs a Google Cloud project with a service account; the Search Console API has no charge. |
| Self-hosted scheduling (optional) | €0 | Your own computer must be on and awake. |

Atlas never spends money: AUTHORITY.md puts every purchase in the *Needs owner approval* column, and nothing in this repository
can pay for anything.

---

## How to stop or revoke Atlas

From quick pause to complete removal:

1. **Pause everything now:** create the file `governance/STOP` (GitHub → **Add file → Create new file** → name `governance/STOP`
   → **Commit**). Every run stops at step 1. Delete the file to resume.
2. **Pause the schedule:** claude.ai/code/routines → your task → switch it off. **Delete** removes it.
   Self-hosted: `launchctl unload ~/Library/LaunchAgents/academy.atlas.daily.plist`, remove the cron line (`crontab -e`),
   or disable the task in Windows Task Scheduler.
3. **Take away GitHub access:** GitHub → your avatar → **Settings → Applications → Installed GitHub Apps → Claude → Configure**
   → remove this repository, or uninstall the app.
4. **Search Console or a shop password (if you set one up):** remove the service account's user in Search Console (Settings → Users and permissions)
   and delete its key in Google Cloud (IAM → Service accounts → Keys). Revoke any shop application password in the shop itself.
5. **Take the site offline:** Settings → Pages → **Unpublish site**, or delete the repository.

The same steps, as a checklist you fill in with your own task names and accesses: `governance/RUNBOOK-REVOKE.md`.

Undo a single change: every change is one commit `atlas(<id>): …` and a copy of the old file sits in `snapshots/<id>/`.
Ask Claude: *"Restore snapshots/<id>/ over the product file, rebuild with node site/build.mjs, commit and push."*

---

## Optional: Search Console
Without it, Atlas still fixes what the crawler finds, but it cannot tell which pages get search traffic. To add it, follow the
comment block at the top of `ops/collect-gsc.mjs` (service account, add it as a user in Search Console, set `gsc.site_url` in
`atlas.config.json`, set `GSC_KEY_FILE` to the key's path **outside** this repository). Status: written but **not yet tested
against Google** — see TEST-LOG.md. In cloud runs a key file is not available; use self-hosted scheduling for Search Console.

---

## Top 10 problems (details in TROUBLESHOOTING.md)

| # | You see | Fix |
|---|---|---|
| 1 | The Pages URL shows "404 There isn't a GitHub Pages site here" | Settings → Pages: branch **main**, folder **/docs**, repository **public**; wait a few minutes. |
| 2 | `collect-site: set "base_url"…` (exit 2) | Step 3: put your Pages URL in `atlas.config.json`. |
| 3 | Cloud run: HTTP 403 / `host_not_allowed` when fetching your site | Allow `YOUR-NAME.github.io` in the cloud environment's network access. |
| 4 | `verify-live` prints `FAIL` | Pages was slow, or the deploy failed: check the **Actions** tab. The executor retries 6 times, then rolls back. |
| 5 | `git push` rejected | Branch protection on `main`, or someone pushed meanwhile. See TROUBLESHOOTING.md. |
| 6 | The run pushed to a `claude/…` branch | The prompt text was changed or shortened. Paste the full text from `scheduling/`. |
| 7 | `health: UNHEALTHY` — evidence old or missing | Run `node ops/collect-site.mjs`. The planner does this every day. |
| 8 | `health: UNHEALTHY` — `governance/…` problem | Run `node governance/check-governance.mjs governance/` and fix the named file. |
| 9 | `refused: DONE needs proof` | Working as designed: the task has no live check yet. Let the executor verify it. |
| 10 | `node: command not found` or a syntax error in the scripts | Install Node.js 18 or newer; in launchd/cron, see the PATH note in TROUBLESHOOTING.md. |

---

## What's in the box
| Path | Purpose |
|---|---|
| `site/content/products/*.md` | the 8 demo products (front-matter + text) |
| `site/build.mjs` | builds `docs/` (pages, sitemap.xml, robots.txt, CSS) |
| `ops/` | ledger, collectors (site, Search Console, optional WordPress), live verifier, health check, briefing check, local preview server |
| `prompts/` | the three run prompts: plan, execute, brief |
| `governance/` | the seven rule files + checker (filled for Harbor & Pine Candles), revoke runbook |
| `scheduling/` | cloud task prompts, launchd / cron / Windows scripts |
| `tests/` | `node --test` — no installs, nothing leaves your computer |
| `.claude/settings.json` | what Claude may do without asking, and what never |
| `TEST-LOG.md` | what has been verified, and what not yet |

Zero dependencies: everything runs on plain Node.js 18+. No `npm install`.
