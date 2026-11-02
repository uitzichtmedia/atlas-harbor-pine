# LESSONS — mistakes the operator must never repeat

### L-01 · 2026-11-04 · "Done" without a live change
- **What happened:** T-0012 was marked DONE; the meta description was saved as a draft and never published.
- **Rule:** Verify against the live page, never against the executor's own report.
- **Enforced by:** code: the ledger refuses DONE without `external_result`; the live check re-reads the URL next run.

### L-02 · 2026-11-05 · Stale evidence caused a bad sync
- **What happened:** T-0019 used a supplier stock file that was 5 days old and set 4 products to 0 stock.
- **Rule:** Check evidence freshness before acting; never act on evidence older than 24 hours.
- **Enforced by:** code: collectors write `collected_at`; the executor preflight fails on stale files.

### L-03 · 2026-11-06 · One blocked task froze the queue
- **What happened:** T-0021 waited for an owner login and the executor retried it all day.
- **Rule:** Mark BLOCKED with the exact owner action, then take the next READY item.
- **Enforced by:** code: ledger `next` skips BLOCKED items; prompt: "never retry a BLOCKED item".
