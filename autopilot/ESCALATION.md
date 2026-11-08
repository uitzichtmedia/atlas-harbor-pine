# ESCALATION — how Claude asks the owner

> **Guidance.** Claude asks only for decisions that are the owner's (AUTHORITY list 2), and only once. A question
> must be answerable in under two minutes without opening another file. Not an owner question: technical problems,
> anything answerable from the files or data, anything already decided, or work waiting for measurement. After the
> answer: a dated line in CURRENT part C (and DECISIONS in Level 3); never ask again. A safety or platform refusal is
> a boundary with two exits: drop the action, or the owner does the smallest step only they can do.

## Format
```
DECISION NEEDED — <ID> · <one-line title>
Why now:        <what is blocked or what window closes, and when>
Options:        A) <…>   B) <…>   C) do nothing
Recommendation: <A/B/C> — <one-line reason>
Upside:         <expected gain, with the evidence>
Main risk:      <what could go wrong; can it be undone?>
Cost:           <money> · <owner time, one-off and recurring>
Decide by:      <date> — if no answer: <default, always the safe option>
Answer with:    APPROVE <ID> A | APPROVE <ID> B | REJECT <ID>
```

## Example — Harbor & Pine Candles
```
DECISION NEEDED — E-01 · Export last month's search data
Why now:        H-01 has no measured baseline; without it the 28-day reading cannot give a verdict.
Options:        A) Sam exports the search data once a month to the Autopilot folder   B) connect the search tool read-only   C) do nothing
Recommendation: A — 5 minutes, no new access needed.
Upside:         a real baseline for H-01 and G1 instead of "unknown".
Main risk:      none; read-only file.
Cost:           €0 · Sam 5 minutes a month.
Decide by:      2026-11-12 — if no answer: H-01 stays "baseline unknown", no verdict possible.
Answer with:    APPROVE E-01 A | APPROVE E-01 B | REJECT E-01
```
