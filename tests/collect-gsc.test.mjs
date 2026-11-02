// Covers the offline parts of the optional Search Console collector. Real API calls are UNTESTED (see TEST-LOG.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeJwt, dateRange, configured } from '../ops/collect-gsc.mjs';
import { tempRepo, run } from './helpers.mjs';

test('not configured → prints skipped, writes a skip note, exits 0', t => {
  const { dir, cleanup } = tempRepo(); t.after(cleanup);
  const r = run(dir, 'ops/collect-gsc.mjs', ['--date=2026-11-02'], { GSC_KEY_FILE: '' });
  assert.equal(r.code, 0); assert.match(r.out, /skipped/);
  const ev = JSON.parse(readFileSync(join(dir, 'evidence/gsc-2026-11-02.json'), 'utf8'));
  assert.equal(ev.skipped, true);
});

test('configured() explains what is missing', () => {
  assert.match(configured({}, {}).reason, /GSC_KEY_FILE/);
  assert.match(configured({ GSC_KEY_FILE: '/nope/key.json' }, {}).reason, /does not exist/);
});

test('service-account JWT is RS256-signed with the right claims', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key = { client_email: 'atlas@demo.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  const jwt = makeJwt(key, 1000);
  const [h, c, s] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(c, 'base64url'));
  assert.equal(claims.iss, key.client_email); assert.equal(claims.exp, 4600); assert.match(claims.scope, /webmasters\.readonly/);
  assert.ok(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s, 'base64url')));
});

test('date range ends 3 days ago and spans 28 days', () => {
  assert.deepEqual(dateRange(new Date('2026-11-30T12:00:00Z'), 28), { startDate: '2026-10-31', endDate: '2026-11-27' });
});
