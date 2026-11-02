import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBrief } from '../ops/brief-check.mjs';

const good = `# Atlas briefing — 2026-11-02

## Done & verified
- meta-amber-evening: new meta description is live (https://example.github.io/atlas-starter/products/amber-evening/).

## Waiting for measurement
None.

## Needs your decision
None.

## Problems
None.
`;
test('a correct briefing passes', () => assert.deepEqual(checkBrief(good).problems, []));
test('wrong headings, empty section and too many words are caught', () => {
  assert.ok(checkBrief(good.replace('## Problems', '## Issues')).problems.some(p => p.includes('headings')));
  assert.ok(checkBrief(good.replace('None.\n\n## Needs', '\n## Needs')).problems.some(p => p.includes('empty')));
  assert.ok(checkBrief(good + 'word '.repeat(220)).problems.some(p => p.includes('words')));
});
