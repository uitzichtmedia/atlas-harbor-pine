#!/usr/bin/env node
// Atlas ledger — the task queue where "done" means verified.
// Atlas starter copy of 07-course/atlas/ledger/ledger.mjs, extended with planning fields, `show` and `today`.
// Zero dependencies. Node 18+. Usage: node ledger.mjs <command> [args]
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const STATES = ['READY', 'EXECUTING', 'BLOCKED', 'FAILED', 'VERIFIED', 'DONE', 'MEASUREMENT_WAIT'];
const ALLOWED = {
  READY: ['EXECUTING', 'BLOCKED'],
  EXECUTING: ['VERIFIED', 'DONE', 'MEASUREMENT_WAIT', 'BLOCKED', 'FAILED', 'READY'],
  BLOCKED: ['READY'],
  FAILED: ['READY'],
  VERIFIED: ['DONE', 'MEASUREMENT_WAIT'],
  MEASUREMENT_WAIT: ['DONE'],
  DONE: [],
};
// States that claim business value: each needs proof.
const PROOF_REQUIRED = ['VERIFIED', 'DONE', 'MEASUREMENT_WAIT'];
const PROOF_FIELDS = ['output', 'verification', 'external_result'];

export function load(file) {
  if (!existsSync(file)) return { version: 1, items: [] };
  return JSON.parse(readFileSync(file, 'utf8'));
}
export function save(file, ledger) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(ledger, null, 2) + '\n');
  renameSync(tmp, file); // atomic replace: a crash never leaves half a ledger
}

// Optional planning fields the planner may attach to a task (Atlas starter extension; all plain strings).
export const PLAN_FIELDS = ['goal', 'action', 'file', 'field', 'old_value', 'new_value', 'url', 'expected_value', 'risk', 'acceptance', 'evidence'];

export function add(ledger, { id, title, priority = 5, not_before = null, route = 'executor', ...extra }, now = new Date()) {
  if (!id || !title) throw new Error('add needs id and title');
  if (ledger.items.some(i => i.id === id)) throw new Error(`duplicate id ${id}`);
  const unknown = Object.keys(extra).filter(k => !PLAN_FIELDS.includes(k));
  if (unknown.length) throw new Error(`unknown field(s): ${unknown.join(', ')} — allowed: ${PLAN_FIELDS.join(', ')}`);
  const item = { id, title, priority: Number(priority), route, state: 'READY', not_before, ...extra, created_at: now.toISOString(), history: [] };
  ledger.items.push(item);
  return item;
}

export function setState(ledger, id, fields, now = new Date()) {
  const item = ledger.items.find(i => i.id === id);
  if (!item) throw new Error(`unknown id ${id}`);
  const to = fields.state;
  if (!STATES.includes(to)) throw new Error(`unknown state ${to}`);
  if (!ALLOWED[item.state].includes(to)) throw new Error(`transition ${item.state} -> ${to} not allowed`);
  const merged = { ...item, ...fields };
  if (PROOF_REQUIRED.includes(to)) {
    const missing = PROOF_FIELDS.filter(f => !String(merged[f] ?? '').trim());
    if (missing.length) throw new Error(`refused: ${to} needs proof — missing ${missing.join(', ')}`);
  }
  if (to === 'BLOCKED' && !String(fields.blocker ?? '').trim()) throw new Error('refused: BLOCKED needs a blocker reason');
  if (to === 'FAILED' && !String(fields.failure ?? '').trim()) throw new Error('refused: FAILED needs a failure reason');
  item.history.push({ from: item.state, to, at: now.toISOString() });
  Object.assign(item, fields);
  if (to === 'EXECUTING') item.started_at = now.toISOString();
  item.updated_at = now.toISOString();
  return item;
}

// The next item an executor may take: due READY items, highest priority first, oldest first.
export function next(ledger, now = new Date()) {
  const due = ledger.items.filter(i => i.state === 'READY' && (!i.not_before || new Date(i.not_before) <= now));
  due.sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at));
  return due[0] ?? null;
}

// Items stuck in EXECUTING longer than maxMinutes are stale (a crashed run): report them.
export function check(ledger, now = new Date(), maxMinutes = 180) {
  return ledger.items.filter(i => i.state === 'EXECUTING' && (now - new Date(i.started_at)) / 60000 > maxMinutes).map(i => i.id);
}

// How many items reached VERIFIED or DONE on the given UTC day — the executor's daily-limit gate.
export function changedToday(ledger, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return ledger.items.filter(i => i.history.some(h => (h.to === 'VERIFIED' || (h.to === 'DONE' && h.from === 'EXECUTING')) && h.at.slice(0, 10) === day)).length;
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) { const m = a.match(/^([a-z_]+)=(.*)$/s); if (m) out[m[1]] = m[2]; }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.env.LEDGER_FILE || fileURLToPath(new URL('../ledger.json', import.meta.url)); // repo-root ledger.json
  const [cmd, maybeId, ...rest] = process.argv.slice(2);
  const ledger = load(file);
  try {
    if (cmd === 'add') { const it = add(ledger, parseArgs([maybeId, ...rest].filter(Boolean))); save(file, ledger); console.log(`added ${it.id}`); }
    else if (cmd === 'set') { const it = setState(ledger, maybeId, parseArgs(rest)); save(file, ledger); console.log(`${it.id} -> ${it.state}`); }
    else if (cmd === 'next') { const it = next(ledger); console.log(it ? JSON.stringify(it) : 'null'); }
    else if (cmd === 'list') { for (const i of ledger.items) console.log(`${i.state.padEnd(16)} p${i.priority} ${i.id}  ${i.title}`); }
    else if (cmd === 'show') { const it = ledger.items.find(i => i.id === maybeId); if (!it) throw new Error(`unknown id ${maybeId}`); console.log(JSON.stringify(it, null, 2)); }
    else if (cmd === 'today') { console.log(String(changedToday(ledger))); }
    else if (cmd === 'check') { const s = check(ledger); console.log(s.length ? `stale: ${s.join(', ')}` : 'ok'); if (s.length) process.exitCode = 2; }
    else { console.log('commands: add id=.. title=.. [priority=1-6] [not_before=ISO] [goal=.. action=.. file=.. field=.. old_value=.. new_value=.. url=.. expected_value=.. risk=.. acceptance=.. evidence=..] | show <id> | today | set <id> state=.. [output=..] [verification=..] [external_result=..] [blocker=..] [failure=..] | next | list | check'); }
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
