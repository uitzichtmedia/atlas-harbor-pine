import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempRepo, run } from './helpers.mjs';

const ev = (dir, at) => { mkdirSync(join(dir, 'evidence'), { recursive: true }); writeFileSync(join(dir, 'evidence/site-2026-11-02.json'), JSON.stringify({ kind: 'site', mode: 'live', collected_at: at, errors: [] })); };
const health = dir => JSON.parse(readFileSync(join(dir, 'health.json'), 'utf8'));

test('healthy with fresh evidence, a clean ledger and a complete governance pack', t => {
  const { dir, cleanup } = tempRepo(); t.after(cleanup);
  ev(dir, new Date().toISOString());
  const r = run(dir, 'ops/health.mjs', ['--record-run=plan']);
  assert.equal(r.code, 0, r.out);
  const h = health(dir); assert.equal(h.status, 'HEALTHY'); assert.equal(h.runs_today, 1); assert.equal(h.runs[0].run, 'plan');
  assert.ok(h.warnings.some(w => w.includes('placeholder')));
});

test('missing or stale evidence → unhealthy (exit 1); --skip-evidence ignores it', t => {
  const { dir, cleanup } = tempRepo(); t.after(cleanup);
  assert.equal(run(dir, 'ops/health.mjs').code, 1);
  assert.match(health(dir).problems.join(), /no site evidence/);
  assert.equal(run(dir, 'ops/health.mjs', ['--skip-evidence']).code, 0);
  ev(dir, new Date(Date.now() - 30 * 3600000).toISOString());
  assert.equal(run(dir, 'ops/health.mjs').code, 1);
  assert.match(health(dir).problems.join(), /h old/);
});

test('ledger item stuck in EXECUTING → unhealthy', t => {
  const { dir, cleanup } = tempRepo(); t.after(cleanup);
  ev(dir, new Date().toISOString());
  const old = new Date(Date.now() - 5 * 3600000).toISOString();
  writeFileSync(join(dir, 'ledger.json'), JSON.stringify({ version: 1, items: [{ id: 'x', title: 't', priority: 1, state: 'EXECUTING', started_at: old, created_at: old, history: [] }] }));
  assert.equal(run(dir, 'ops/health.mjs').code, 1);
  assert.deepEqual(health(dir).ledger.stale, ['x']);
});

test('STOP file → status STOPPED and exit 3', t => {
  const { dir, cleanup } = tempRepo(); t.after(cleanup);
  ev(dir, new Date().toISOString());
  writeFileSync(join(dir, 'governance/STOP'), 'paused by owner\n');
  const r = run(dir, 'ops/health.mjs');
  assert.equal(r.code, 3); assert.equal(health(dir).status, 'STOPPED');
});

test('changed is true only when the status differs from the previous check (one alert per change)', t => {
  const { dir, cleanup } = tempRepo(); t.after(cleanup);
  ev(dir, new Date().toISOString());
  run(dir, 'ops/health.mjs');
  let h = health(dir); assert.equal(h.status, 'HEALTHY'); assert.equal(h.previous_status, null); assert.equal(h.changed, true);
  run(dir, 'ops/health.mjs');
  h = health(dir); assert.equal(h.previous_status, 'HEALTHY'); assert.equal(h.changed, false);
  writeFileSync(join(dir, 'governance/STOP'), 'drill\n');
  assert.equal(run(dir, 'ops/health.mjs').code, 3);
  h = health(dir); assert.equal(h.status, 'STOPPED'); assert.equal(h.previous_status, 'HEALTHY'); assert.equal(h.changed, true);
  assert.equal(run(dir, 'ops/health.mjs').code, 3);
  assert.equal(health(dir).changed, false);
});

test('an unfinished governance file → unhealthy', t => {
  const { dir, cleanup } = tempRepo(); t.after(cleanup);
  ev(dir, new Date().toISOString());
  writeFileSync(join(dir, 'governance/STRATEGY.md'), '# STRATEGY\n\n<your goals>\n');
  assert.equal(run(dir, 'ops/health.mjs').code, 1);
  assert.match(health(dir).problems.join(), /STRATEGY/);
});
