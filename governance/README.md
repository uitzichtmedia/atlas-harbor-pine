# Governance — the rules Atlas reads before every run

These seven files are filled in for the fictional demo shop **Harbor & Pine Candles** so the starter works on day one.
In the course (Section 4) you replace them with your own business, using the templates and their instructions.

| File | Answers |
|---|---|
| PRINCIPLES.md | What must never happen, whatever the plan says? |
| BUSINESS-MODEL.md | How does the business make money, and what is "good"? |
| STRATEGY.md | What are we trying to achieve in the next weeks, in what order? |
| AUTHORITY.md | What may Atlas do alone, with approval, or never? |
| DECISIONS.md | Archive of owner decisions (append-only) |
| CURRENT.md | The decisions that apply right now |
| LESSONS.md | Rules learned from failures |
| RUNBOOK-REVOKE.md | How to stop Atlas and take back every access (a checklist, not a rule file; the checker ignores it) |

Precedence when files conflict: PRINCIPLES > AUTHORITY > CURRENT > STRATEGY > anything else.

**Kill switch:** create an empty file `governance/STOP` (GitHub → *Add file* → *Create new file* → name it `governance/STOP`
→ *Commit*). Every Atlas run then stops at its first step. Delete the file to resume.

**Check the pack** after every change: `node governance/check-governance.mjs governance/` → must end with `Governance pack OK.`
`node ops/health.mjs` runs the same check and refuses to let Atlas work when a file is unfinished.
