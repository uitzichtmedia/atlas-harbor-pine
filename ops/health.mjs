#!/usr/bin/env node
// Atlas health check: is it safe and sensible for the operator to run right now?
// Checks the STOP kill switch, governance pack, evidence freshness and the ledger (stale EXECUTING items).
// Zero dependencies, Node 18+. Writes health.json.
// Usage: node ops/health.mjs [--skip-evidence] [--record-run=plan|execute|brief|daily] [--quiet]
// health.json also says whether the status changed since the previous check ("changed", "previous_status"):
// that is the signal for one alert per change.
// Exit 0 = healthy, 1 = unhealthy (read health.json → problems), 3 = STOP file present: do nothing.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, args, config, isPlaceholderBase } from './lib.mjs';
import { load, check as ledgerCheck } from './ledger.mjs';
import { checkDir } from '../governance/check-governance.mjs';

export function latestEvidence(dir, prefix = 'site-') {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.json')).sort();
  if (!files.length) return null;
  const file = files[files.length - 1];
  try { return { file, data: JSON.parse(readFileSync(join(dir, file), 'utf8')) }; }
  catch { return { file, data: null }; }
}

export function health({ root = ROOT, now = new Date(), skipEvidence = false, cfg = config(root) } = {}) {
  const problems = [], warnings = [];
  const stop = existsSync(join(root, 'governance', 'STOP'));
  if (stop) problems.push('governance/STOP exists — the kill switch is on; no run may act');

  const gov = checkDir(join(root, 'governance'));
  const govBad = Object.entries(gov).filter(([, p]) => p.length);
  for (const [f, p] of govBad) problems.push(`governance/${f}: ${p[0]}${p.length > 1 ? ` (+${p.length - 1} more)` : ''}`);

  const maxH = cfg.evidence_max_age_hours ?? 24;
  let evidence = null;
  const ev = latestEvidence(join(root, 'evidence'));
  if (ev?.data) {
    const ageH = (now - new Date(ev.data.collected_at)) / 3600000;
    evidence = { file: `evidence/${ev.file}`, collected_at: ev.data.collected_at, mode: ev.data.mode, age_hours: Math.round(ageH * 10) / 10, errors: ev.data.errors || [] };
    if (!skipEvidence && ageH > maxH) problems.push(`site evidence is ${evidence.age_hours} h old (max ${maxH} h) — run ops/collect-site.mjs`);
    if (!skipEvidence && ev.data.mode === 'local') warnings.push('latest site evidence came from --local docs, not the live site');
    for (const w of ev.data.warnings || []) warnings.push(`site evidence: ${w}`);
    if (!skipEvidence && evidence.errors.length) problems.push(`latest site evidence has errors: ${evidence.errors[0]}`);
  } else if (ev && !ev.data) problems.push(`evidence/${ev.file} is not valid JSON`);
  else if (!skipEvidence) problems.push('no site evidence yet — run ops/collect-site.mjs');

  let ledger = null;
  try {
    const l = load(join(root, process.env.LEDGER_FILE || 'ledger.json'));
    const counts = {};
    for (const i of l.items) counts[i.state] = (counts[i.state] || 0) + 1;
    const stale = ledgerCheck(l, now, cfg.ledger_stale_minutes ?? 180);
    ledger = { items: l.items.length, counts, stale };
    if (stale.length) problems.push(`ledger items stuck in EXECUTING: ${stale.join(', ')} — check them, then set READY, FAILED or BLOCKED`);
  } catch (e) { problems.push(`ledger.json unreadable: ${e.message}`); }

  if (isPlaceholderBase(cfg.base_url)) warnings.push('base_url in atlas.config.json is still the placeholder');

  return { checked_at: now.toISOString(), status: stop ? 'STOPPED' : problems.length ? 'UNHEALTHY' : 'HEALTHY', stop, problems, warnings, evidence, ledger };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = args();
  const file = join(ROOT, 'health.json');
  let prev = {};
  try { prev = JSON.parse(readFileSync(file, 'utf8')); } catch { /* first run */ }
  const h = health({ skipEvidence: !!a['skip-evidence'] });
  let runs = Array.isArray(prev.runs) ? prev.runs : [];
  if (a['record-run']) runs = [...runs, { at: h.checked_at, run: String(a['record-run']), status: h.status }].slice(-60);
  const day = h.checked_at.slice(0, 10);
  h.runs_today = runs.filter(r => r.at.startsWith(day)).length;
  h.runs = runs;
  h.previous_status = prev.status ?? null;
  h.changed = h.previous_status !== h.status;
  writeFileSync(file, JSON.stringify(h, null, 2) + '\n');
  if (!a.quiet) {
    console.log(`health: ${h.status}`);
    for (const p of h.problems) console.log(`  problem: ${p}`);
    for (const w of h.warnings) console.log(`  warning: ${w}`);
    if (h.changed) console.log(`  changed: ${h.previous_status ?? 'first check'} -> ${h.status}`);
  }
  process.exit(h.stop ? 3 : h.problems.length ? 1 : 0);
}
