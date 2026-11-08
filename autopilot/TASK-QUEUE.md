# TASK-QUEUE — the work, its state and its proof

One line per task. Every task serves a goal, fixes something broken, or is exploration.

**States:** `READY` → `DOING` → `DONE` (verified, with proof) → `WAITING-FOR-RESULT` (measuring) → `CLOSED` (result
read, meaning stated, next step taken). Side states: `NEEDS-OWNER` (decision-ready question waiting) · `BLOCKED`
(exact reason + who/what unblocks) · `FAILED` (rolled back, reason written).

**Proof rule.** A task may only be `DONE` with three things written in its row: **output** (what was made) ·
**verification** (checked where it lives, as a customer sees it, against the source) · **external result** (the URL,
record or screenshot that shows it in the world). A draft, memo, plan, request or promise is not done. If you cannot
prove it, it is not DONE. A blocked task never stops the queue.

**Priority:** P0 broken and costing money · P1 restore proven revenue · P2 grow what works · P3 new ideas · P4 tooling.

Created 2026-11-08. Nothing below runs until you reply `APPROVE`; after that only read-only tasks run.

| ID | P | Task | Serves | State | Output | Verification | External result | Next / note |
|---|---|---|---|---|---|---|---|---|
| T-001 | P1 | Check the 3 best-sellers load and show a price (read-only); repeat daily | G3 · H-03 | DOING | first check 2026-11-08, all 3 load with price (`briefings/2026-11-08.md`) | built pages in `docs/` opened | not DONE: public URLs not reachable from here | repeat daily; shop buyability not visible from files |
| T-002 | P2 | Audit title, meta description and image alt text of all 8 product pages (read-only) | G1 | DONE | `briefings/2026-11-08.md` audit table | built pages compared with source files, all 8 match | built files `docs/products/*/index.html` on this branch | found 2 unsupported meta claims; feeds T-005 |
| T-003 | P3 | Baseline from the order export: orders per month, own shop vs marketplace, source of orders, Dec 2025 if present (read-only) | G1 · G2 | BLOCKED | — | — | — | you drop the shop export CSV in the Autopilot folder (due later this week) |
| T-004 | P3 | Baseline of search clicks and click-through per product page (read-only) | G1 · H-01 | BLOCKED | — | — | — | search data not connected; plan without it; unblocks only if you later export a page-level search report |
| T-005 | P2 | Rewrite the meta description of Pine Forest Soy Candle for gift searches, using only facts on its page; old text kept; rebuild and check `docs/` | G1 · H-01 | DOING (PARTIAL — live page not checked) | meta rewritten; commit 74f32a2 pushed to `course-v2/validation`; old text in `autopilot/snapshots/T-005/pine-forest-large.md` | rebuilt `docs/products/pine-forest-large/index.html` locally: new text present, "most-gifted" gone | not verified: pushed file and public page not reachable from here (public site shows only `main`) | not DONE until the pushed file is seen on GitHub; then WAITING-FOR-RESULT, H-01 read 28 days later |
