# TASK-QUEUE — the work, its state and its proof

> **Guidance (Claude replaces the table, keeps the rules).** One line per task. Every task serves a goal, fixes
> something broken, or is exploration.
>
> **States:** `READY` (can be done now) → `DOING` → `DONE` (verified, with proof) → `WAITING-FOR-RESULT` (measuring)
> → `CLOSED` (result read, meaning stated, next step taken). Side states: `NEEDS-OWNER` (decision-ready question
> waiting) · `BLOCKED` (exact reason + who/what unblocks) · `FAILED` (rolled back, reason written).
>
> **Proof rule.** A task may only be `DONE` with three things written in its row:
> **output** (what was made) · **verification** (checked where it lives, as a customer sees it, against the source) ·
> **external result** (the URL, record or screenshot that shows it in the world). A draft, memo, plan, request or
> promise is not done. If you cannot prove it, it is not DONE. A blocked task never stops the queue.
>
> **Priority:** P0 something broken that costs money · P1 restore proven revenue · P2 grow what works · P3 new ideas ·
> P4 tooling. Within a level: highest expected value first.

| ID | P | Task | Serves | State | Output | Verification | External result | Next / note |
|---|---|---|---|---|---|---|---|---|

---

## Example — Harbor & Pine Candles
| ID | P | Task | Serves | State | Output | Verification | External result | Next / note |
|---|---|---|---|---|---|---|---|---|
| T-001 | P1 | Check the 3 best-sellers load and show a price | G3 | DONE | check of 3 pages | each page opened, price and "add" visible | live URLs, 2026-11-08 09:40 | daily |
| T-002 | P2 | Audit titles, meta descriptions, alt text of all 8 product pages | G1 | DONE | audit table in the briefing | read from the live pages | live URLs | feeds T-003 |
| T-003 | P2 | Rewrite meta description of Pine Forest Soy Candle for gift searches | G1 · H-01 | NEEDS-OWNER | — | — | — | first live change; Sam approves |
| T-004 | P3 | Collect a search-click baseline for the 8 product pages | G1 | BLOCKED | — | — | — | Sam exports search data (5 min); queue continues |
