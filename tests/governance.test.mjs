import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { checkDir } from '../governance/check-governance.mjs';
import { ROOT } from '../ops/lib.mjs';

test('the starter governance pack (Harbor & Pine example) passes the checker', () => {
  for (const [f, p] of Object.entries(checkDir(join(ROOT, 'governance')))) assert.deepEqual(p, [], `${f}: ${p.join('; ')}`);
});
