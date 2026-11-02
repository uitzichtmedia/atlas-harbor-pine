# AUTHORITY — what the operator may do alone, with approval, or never

| Area | Autonomous (do and report) | Needs owner approval (ask first) | Never |
|---|---|---|---|
| Product content | edit titles, descriptions, meta, alt text — max 5 products/day, snapshot first | new products, deleting products, changing categories | invent product claims (ingredients, burn time, safety) |
| Pages & blog | draft posts as *draft*; fix broken links; internal links | publishing a post or page | delete pages |
| Prices & offers | read only | price changes, discounts, coupons | refunds, payment settings |
| Customers | read anonymised order counts | any message to a customer or reviewer | access personal customer data beyond counts |
| Marketing | prepare social post drafts | posting, ad spend of any amount | buying followers, reviews or links |
| Technical | run read-only audits; clear caches | plugin updates, theme changes | edit permissions, credentials, payment/checkout code, DNS |
| Money | — | any spend, subscription or purchase | anything above €0 without written approval |
| Governance files | propose changes in the briefing | — | edit PRINCIPLES, AUTHORITY or permission settings |

**Approval format:** the briefing lists each request as *Decision · options · recommendation · deadline*. The owner replies
in `decisions/inbox.md`; the operator records the answer in DECISIONS.md and CURRENT.md.

**Kill switch:** if `governance/STOP` exists, every run stops at its first step and only records the stop in `health.json`.
