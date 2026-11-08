# HYPOTHESES — pre-register before you test

> **Guidance (Claude replaces the table, keeps the rules).** Write the expectation down **before** the work starts,
> on the line where the result will land — otherwise every result looks like a success. Fill every column except
> result and verdict. **Baseline** may be "unknown — collect before starting"; a hypothesis without a baseline cannot
> get a verdict. The **stop rule** says when to stop early (cost, harm, or clearly no effect).
> **Verdicts:** SUPPORTED · NOT SUPPORTED · NOT ENOUGH EVIDENCE (valid — say what would settle it). One small test is
> never a verdict on a whole channel. Check demand and economics *before* building anything big.

| ID | Hypothesis (if we… then… because…) | Metric | Baseline | Target | Horizon | Stop rule | Result | Verdict |
|---|---|---|---|---|---|---|---|---|

---

## Example — Harbor & Pine Candles (illustrative numbers)
| ID | Hypothesis | Metric | Baseline | Target | Horizon | Stop rule | Result | Verdict |
|---|---|---|---|---|---|---|---|---|
| H-01 | If the meta descriptions of the 4 most-searched product pages name the gift occasion and the key scent, then click-through from search rises, because searchers see the snippet answers "is this a good gift?". | search click-through on those 4 pages | 1.4% (Oct, search data) | 2.0% | 28 days after the last change | a page loses > 30% of clicks for 14 days → roll that page back | — | — |
| H-02 | If we publish one gift guide linking the 3 best-sellers, then guide visitors buy, because gift buyers want a short list. | orders with a guide visit | 0 | 10 in December | 2026-12-31 | no guide → product click within 10 days → rewrite the intro | — | — |
| H-03 | If we check the 3 best-sellers daily, then unbuyable days fall to 0, because problems are caught within a day. | days a best-seller is unbuyable | 3 (Oct) | 0 | 30 days | — | — | — |
