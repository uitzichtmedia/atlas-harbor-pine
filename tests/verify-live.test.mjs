import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { verify, check } from '../ops/verify-live.mjs';
import { tempRepo, runAsync, run } from './helpers.mjs';

// A fake "GitHub Pages" that serves the old page first and the new page after `deployAfterMs`.
function fakePages(deployAfterMs) {
  const t0 = Date.now(); const seen = [];
  const s = createServer((req, res) => {
    seen.push(req.url);
    const fresh = Date.now() - t0 >= deployAfterMs;
    if (!req.url.startsWith('/products/amber-evening/')) { res.writeHead(404).end('nope'); return; }
    res.writeHead(200, { 'content-type': 'text/html' }).end(`<html><head><title>Amber Evening Candle</title>
<meta name="description" content="${fresh ? 'Warm amber &amp; vanilla soy candle, hand-poured, about 45 hours of burn time.' : 'Warm amber candle.'}"></head></html>`);
  });
  return new Promise(ok => s.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${s.address().port}/`, seen, close: () => new Promise(r => s.close(r)) })));
}
const NEW = 'Warm amber & vanilla soy candle, hand-poured, about 45 hours of burn time.';

test('check() matches decoded entities and reports missing/forbidden text', () => {
  assert.equal(check('<p>Harbor &amp; Pine</p>', 200, { mustContain: ['Harbor & Pine'] }).ok, true);
  const c = check('<p>old</p>', 200, { mustContain: ['new'], mustNotContain: ['old'] });
  assert.deepEqual([c.ok, c.missing, c.forbidden], [false, ['new'], ['old']]);
  assert.equal(check('x', 404, { mustContain: ['x'] }).ok, false);
});

test('PASS: new text is live, old text gone, cache-buster used', async t => {
  const s = await fakePages(0); t.after(s.close);
  const r = await verify({ url: `${s.url}products/amber-evening/`, mustContain: [NEW], mustNotContain: ['Warm amber candle.'], waitMinutes: 0 });
  assert.equal(r.passed, true); assert.equal(r.attempts.length, 1);
  assert.match(s.seen[0], /\?atlas_cb=\d+$/);
});

test('FAIL: text never appears → passed=false after the wait', async t => {
  const s = await fakePages(1e9); t.after(s.close);
  const r = await verify({ url: `${s.url}products/amber-evening/`, mustContain: [NEW], waitMinutes: 0.02, intervalSeconds: 0.3 });
  assert.equal(r.passed, false); assert.ok(r.attempts.length >= 2); assert.deepEqual(r.attempts.at(-1).missing, [NEW]);
});

test('waits for a slow deploy and then passes', async t => {
  const s = await fakePages(800); t.after(s.close);
  const r = await verify({ url: `${s.url}products/amber-evening/`, mustContain: [NEW], waitMinutes: 0.1, intervalSeconds: 0.3 });
  assert.equal(r.passed, true); assert.ok(r.attempts.length >= 2, `attempts ${r.attempts.length}`);
});

test('CLI exit codes 0 / 1 / 2 and evidence file', async t => {
  const { dir, cleanup } = tempRepo(); t.after(cleanup);
  const s = await fakePages(0); t.after(s.close);
  const ok = await runAsync(dir, 'ops/verify-live.mjs', [`--url=${s.url}products/amber-evening/`, `--must-contain=${NEW}`, '--id=meta-amber', '--wait-minutes=0']);
  assert.equal(ok.code, 0, ok.out); assert.match(ok.out, /^PASS .* evidence=evidence\/verify-meta-amber-\d{8}T\d{6}Z\.json/m);
  const files = readdirSync(join(dir, 'evidence')).filter(f => f.startsWith('verify-meta-amber'));
  const ev = JSON.parse(readFileSync(join(dir, 'evidence', files[0]), 'utf8'));
  assert.equal(ev.passed, true); assert.equal(ev.id, 'meta-amber');
  const bad = await runAsync(dir, 'ops/verify-live.mjs', [`--url=${s.url}products/amber-evening/`, '--must-contain=Not on the page', '--wait-minutes=0']);
  assert.equal(bad.code, 1); assert.match(bad.out, /^FAIL /m);
  const nf = await runAsync(dir, 'ops/verify-live.mjs', [`--url=${s.url}products/missing/`, '--must-contain=x', '--wait-minutes=0']);
  assert.equal(nf.code, 1);
  assert.equal(run(dir, 'ops/verify-live.mjs', ['--url=http://x/']).code, 2);
  assert.equal(run(dir, 'ops/verify-live.mjs', ['--path=products/x/', '--must-contain=x']).code, 2); // placeholder base_url
});
