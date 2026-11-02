// End-to-end loop on a local server: build → collect → plan (ledger add) → execute (edit front-matter) →
// rebuild → verify-live --ledger-item → ledger VERIFIED → DONE. Also proves the DONE gate refuses missing proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '../ops/serve.mjs';
import { checksFromItem } from '../ops/verify-live.mjs';
import { tempRepo, run, runAsync } from './helpers.mjs';

const NEW = 'Warm amber, vanilla bean and smoked wood in a hand-poured soy candle. A smoky glass jar with about 45 hours of burn time.';

test('checksFromItem builds field-specific checks and refuses incomplete tasks', () => {
  const c = checksFromItem({ id: 'x', field: 'meta_description', url: 'products/a/', new_value: 'New', old_value: 'Old' });
  assert.deepEqual(c, { path: 'products/a/', mustContain: ['<meta name="description" content="New">'], mustNotContain: ['<meta name="description" content="Old">'] });
  assert.deepEqual(checksFromItem({ id: 'y', field: 'title', url: 'p/', new_value: 'T' }).mustNotContain, []);
  assert.throws(() => checksFromItem({ id: 'z', field: 'price_eur', url: 'p/', new_value: '1' }), /no live check/);
  assert.throws(() => checksFromItem({ id: 'z', field: 'title', url: 'p/' }), /new_value/);
});

test('full local loop reaches VERIFIED with proof; DONE without proof is refused', async t => {
  const { dir, cleanup } = tempRepo(); t.after(cleanup);
  const srv = await serve(join(dir, 'docs')); t.after(srv.close);
  const base = srv.url;
  const cfg = JSON.parse(readFileSync(join(dir, 'atlas.config.json'), 'utf8')); cfg.base_url = base;
  writeFileSync(join(dir, 'atlas.config.json'), JSON.stringify(cfg, null, 2));

  assert.equal(run(dir, 'site/build.mjs').code, 0);
  const col = await runAsync(dir, 'ops/collect-site.mjs', ['--date=2026-11-02']);
  assert.equal(col.code, 0, col.out);
  const ev = JSON.parse(readFileSync(join(dir, 'evidence/site-2026-11-02.json'), 'utf8'));
  const amber = ev.pages.find(p => p.path === '/products/amber-evening/');
  assert.deepEqual(amber.issues, ['META_TOO_SHORT']);

  const L = (...a) => run(dir, 'ops/ledger.mjs', a);
  assert.equal(L('add', 'id=meta-amber-evening', 'title=Rewrite short meta description: Amber Evening', 'priority=3', 'goal=G1',
    'action=edit_meta_description', `file=${amber.source}`, 'field=meta_description', `old_value=${amber.meta_description}`, `new_value=${NEW}`,
    'url=products/amber-evening/', 'risk=low', 'acceptance=live page serves the new meta description; old one gone',
    'evidence=evidence/site-2026-11-02.json').code, 0);
  assert.equal(L('set', 'meta-amber-evening', 'state=EXECUTING').code, 0);

  // Executor step: change exactly one front-matter line, rebuild.
  const f = join(dir, amber.source);
  const before = readFileSync(f, 'utf8');
  const after = before.replace(/^meta_description: .*$/m, `meta_description: "${NEW}"`);
  assert.notEqual(after, before); writeFileSync(f, after);
  assert.equal(run(dir, 'site/build.mjs').code, 0);

  const v = await runAsync(dir, 'ops/verify-live.mjs', ['--ledger-item=meta-amber-evening', '--wait-minutes=0']);
  assert.equal(v.code, 0, v.out);
  const proof = v.out.match(/evidence=(\S+)/)[1];

  const refused = L('set', 'meta-amber-evening', 'state=DONE', 'output=meta updated');
  assert.equal(refused.code, 1); assert.match(refused.out, /refused: DONE needs proof — missing verification, external_result/);

  const ok = L('set', 'meta-amber-evening', 'state=VERIFIED', `output=${amber.source} meta_description rewritten`, `verification=${proof} PASS`, `external_result=${base}products/amber-evening/`);
  assert.equal(ok.code, 0, ok.out);
  const item = JSON.parse(L('show', 'meta-amber-evening').out);
  assert.equal(item.state, 'VERIFIED'); assert.equal(item.history.length, 2);
  assert.equal(L('set', 'meta-amber-evening', 'state=DONE').code, 0);
  assert.equal(L('today').out.trim(), '1');

  const col2 = await runAsync(dir, 'ops/collect-site.mjs', ['--date=2026-11-03']);
  const ev2 = JSON.parse(readFileSync(join(dir, 'evidence/site-2026-11-03.json'), 'utf8'));
  assert.equal(col2.code, 0);
  assert.deepEqual(ev2.pages.find(p => p.path === '/products/amber-evening/').issues, []);
});
