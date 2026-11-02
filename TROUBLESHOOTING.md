# Troubleshooting Atlas

Start with two commands; most answers are in their output:
```
node ops/health.mjs          # STOP, governance, evidence age, stuck tasks → health.json
node ops/ledger.mjs list     # every task and its state
```
For a scheduled cloud run, open the run from claude.ai/code/routines → your task → the run: you see every command and its output.

---

### 1. GitHub Pages shows "404 — There isn't a GitHub Pages site here"
- Settings → Pages must say **Deploy from a branch**, branch **main**, folder **/docs**.
- The repository must be **public** (Pages for private repositories needs a paid GitHub plan).
- The first deploy takes a few minutes. Watch the **Actions** tab: a workflow called *pages build and deployment* must finish green.
- The URL is case-sensitive in the repository part: `https://you.github.io/atlas-harbor-pine/` is not `…/Atlas-Harbor-Pine/`.

### 2. `collect-site: set "base_url" in atlas.config.json…` (exit code 2)
`atlas.config.json` still contains `YOUR-GITHUB-USERNAME`. Put your exact Pages URL there, with `https://` and a trailing `/`.
Then run `node site/build.mjs`, commit and push, so canonical links and the sitemap use the right URL too.

### 3. Cloud run fails with HTTP 403 or `host_not_allowed`
The cloud environment's default network list does not include `github.io`. Edit the environment used by your scheduled task:
network access **Custom**, allowed domain `YOUR-NAME.github.io`, and tick **Also include default list of common package managers**.
GitHub itself (git push) goes through a separate proxy and needs no entry.

### 4. `verify-live` prints `FAIL`
Open the evidence file it names (`evidence/verify-…json`) and look at `attempts`:
- **HTTP 200 but `missing` lists the new text** → Pages had not deployed yet. Check the **Actions** tab. A deploy normally takes
  1–10 minutes; the executor tries 6 times (about 10 minutes) and then rolls back. Raise `verify.wait_minutes` in
  `atlas.config.json` if your deploys are always slow.
- **HTTP 404** → the page path or `base_url` is wrong, or Pages is off (see 1).
- **HTTP 0 with an error** → no network (see 3 for cloud runs).
- `forbidden` lists the old text → an old copy is still served. The verifier already adds a cache-buster (`?atlas_cb=…`);
  wait and retry.

### 5. `git push` is rejected
- *"non-fast-forward" / "fetch first"*: someone (or another run) pushed meanwhile. The prompts run `git pull --rebase origin main`
  once and push again. If that also fails, look at `git status` for a conflict and ask Claude to explain it before changing anything.
- *"protected branch" / "Changes must be made through a pull request"*: branch protection or a ruleset on `main` blocks direct
  pushes. Atlas publishes by pushing to `main`, so for this demo repository remove that rule (Settings → Rules / Branches),
  or keep it and accept that Atlas can only prepare changes.
- *Permission denied*: the Claude GitHub app has no access to this repository (GitHub → Settings → Applications →
  Installed GitHub Apps → Claude → Configure), or, self-hosted, your git credentials expired.

### 6. The cloud run pushed to a `claude/…` branch instead of `main`
Cloud runs use a `claude/` branch unless the prompt says otherwise. Paste the full prompt text from `scheduling/cloud-*.txt`
— it tells Atlas to run `git push origin HEAD:main`. To publish what is on the branch now, open a pull request on GitHub and merge it.

### 7. `health: UNHEALTHY` — "site evidence is … h old" or "no site evidence yet"
Atlas plans only from evidence younger than 24 hours (PRINCIPLES 2). Run `node ops/collect-site.mjs`. If it fails, the
message says why (often 2, 3 or 1 above). `evidence_max_age_hours` in `atlas.config.json` sets the limit.

### 8. `health: UNHEALTHY` — a `governance/…` problem
Run `node governance/check-governance.mjs governance/`. It names the file and the problem: an Instructions block or
`<placeholder>` left in, a missing heading, or a file over its word budget. Atlas does no work until the pack is complete.

### 9. `refused: VERIFIED needs proof — missing …` or `transition … not allowed`
That is the ledger doing its job: a task cannot be VERIFIED or DONE without `output`, `verification` (the verify-live
evidence file) and `external_result` (the live URL), and it cannot skip EXECUTING. Let the executor verify the change.
A FAILED or BLOCKED task goes back to the queue with `node ops/ledger.mjs set <id> state=READY` once you've fixed the cause.

### 10. "ledger items stuck in EXECUTING"
A run stopped half-way (timeout, usage limit, lost network). The next executor run recovers it: if its commit exists it
re-verifies the live page; if not, it puts the task back to READY. To do it by hand: `node ops/ledger.mjs show <id>`,
then `git log --oneline -20` and decide.

### More
- **`node: command not found`, or a syntax error in `ops/*.mjs`** — install Node.js 18 or newer (`node --version`). launchd and
  cron start with a short PATH; `run-atlas.sh` adds the usual places (`/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`).
  If `node` or `claude` lives elsewhere (`which node`, `which claude`), add that folder to the `export PATH=` line.
- **Self-hosted run does nothing / log shows "permission denied" for a command** — `--permission-mode dontAsk` refuses every
  command that `.claude/settings.json` does not allow. That is deliberate. If the command is one the prompt needs, check that the
  prompt and the allow list use exactly the same wording.
- **Cloud run waits for an approval** — open the run and answer. Then check which command caused it; usually a command that is
  not in the prompt. Tighten the prompt rather than widening permissions.
- **`collect-gsc: skipped`** — normal when Search Console is not set up. Atlas works without it.
- **Search Console errors (`HTTP 403 … User does not have sufficient permission`)** — add the service account's e-mail as a
  user on the exact property in `gsc.site_url` (URL-prefix properties need the trailing `/`). This collector is untested
  against Google so far; please report what you see.
- **A test fails after you changed something** — the tests use the original products in `tests/fixtures/`, so Atlas's normal
  edits never break them. A failing test means a script, `atlas.config.json` keys or the build changed. Ask Claude:
  *"Run node --test and explain the first failure. Don't change anything yet."*
- **Windows:** use PowerShell; commands are the same (`node site/build.mjs`, `node --test`). The scripts use no Unix-only
  features, but the Windows path has not been tested yet (see TEST-LOG.md).
