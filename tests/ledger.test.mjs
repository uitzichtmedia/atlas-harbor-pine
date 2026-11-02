import test from 'node:test';
import assert from 'node:assert/strict';
import { add, setState, next, check, changedToday } from '../ops/ledger.mjs';

const fresh = () => ({ version: 1, items: [] });

test('refuses DONE without proof', () => {
  const l = fresh(); add(l, { id: 'meta-1', title: 'Fix meta description' });
  setState(l, 'meta-1', { state: 'EXECUTING' });
  assert.throws(() => setState(l, 'meta-1', { state: 'DONE', output: 'updated' }), /missing verification, external_result/);
});
test('accepts DONE with output, verification and external result', () => {
  const l = fresh(); add(l, { id: 'a', title: 't' });
  setState(l, 'a', { state: 'EXECUTING' });
  const it = setState(l, 'a', { state: 'DONE', output: 'meta updated', verification: 'live page shows new meta', external_result: 'https://shop.test/p/1' });
  assert.equal(it.state, 'DONE'); assert.equal(it.history.length, 2);
});
test('cannot skip EXECUTING', () => {
  const l = fresh(); add(l, { id: 'a', title: 't' });
  assert.throws(() => setState(l, 'a', { state: 'DONE', output: 'x', verification: 'y', external_result: 'z' }), /not allowed/);
});
test('BLOCKED and FAILED need a reason', () => {
  const l = fresh(); add(l, { id: 'a', title: 't' }); setState(l, 'a', { state: 'EXECUTING' });
  assert.throws(() => setState(l, 'a', { state: 'BLOCKED' }), /blocker/);
  assert.throws(() => setState(l, 'a', { state: 'FAILED' }), /failure/);
});
test('next picks highest priority due item and skips not_before', () => {
  const l = fresh(); const now = new Date('2026-11-02T10:00:00Z');
  add(l, { id: 'low', title: 't', priority: 5 }, now);
  add(l, { id: 'later', title: 't', priority: 1, not_before: '2026-11-05T00:00:00Z' }, now);
  add(l, { id: 'high', title: 't', priority: 2 }, now);
  assert.equal(next(l, now).id, 'high');
});
test('check flags stale EXECUTING items', () => {
  const l = fresh(); add(l, { id: 'a', title: 't' });
  setState(l, 'a', { state: 'EXECUTING' }, new Date('2026-11-02T06:00:00Z'));
  assert.deepEqual(check(l, new Date('2026-11-02T10:00:00Z')), ['a']);
});
test('duplicate ids are refused', () => {
  const l = fresh(); add(l, { id: 'a', title: 't' });
  assert.throws(() => add(l, { id: 'a', title: 't' }), /duplicate/);
});
test('planner fields are stored; unknown fields are refused', () => {
  const l = fresh();
  const it = add(l, { id: 'm', title: 't', file: 'site/content/products/a.md', field: 'meta_description', risk: 'low', acceptance: 'live page contains new meta' });
  assert.equal(it.field, 'meta_description'); assert.equal(it.risk, 'low');
  assert.throws(() => add(l, { id: 'n', title: 't', price_eur: '1' }), /unknown field/);
});
test('changedToday counts items verified today (daily limit gate)', () => {
  const l = fresh(); const now = new Date('2026-11-02T10:00:00Z');
  add(l, { id: 'a', title: 't' }, now); add(l, { id: 'b', title: 't' }, now);
  setState(l, 'a', { state: 'EXECUTING' }, now);
  setState(l, 'a', { state: 'VERIFIED', output: 'o', verification: 'v', external_result: 'u' }, now);
  setState(l, 'a', { state: 'DONE' }, now);
  assert.equal(changedToday(l, now), 1);
  assert.equal(changedToday(l, new Date('2026-11-03T10:00:00Z')), 0);
});
