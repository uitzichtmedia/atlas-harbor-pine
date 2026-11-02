#!/usr/bin/env node
// Atlas live verifier: fetches a live URL (with a cache-buster) and checks what the public actually gets.
// Retries until GitHub Pages has deployed the change, or until the wait time runs out.
// Zero dependencies, Node 18+.
// Usage:
//   node ops/verify-live.mjs --path=products/amber-evening/ --must-contain="New meta text" [--must-contain=...]
//   node ops/verify-live.mjs --url=https://you.github.io/atlas-harbor-pine/products/x/ --must-not-contain="Old text"
//   node ops/verify-live.mjs --ledger-item=meta-amber-evening     build the checks from the ledger task itself
//                                  (url + field + new_value/old_value) — no shell quoting of long texts needed
//   options: --id=<ledger id>  --wait-minutes=10  --interval=30  --base=...  --out=evidence  --quiet
// --path is joined to base_url from atlas.config.json (or --base). Text is matched against the raw HTML
// and against the HTML with entities decoded, so "Harbor & Pine" matches "Harbor &amp; Pine".
// Writes evidence/verify-<id>-<timestamp>.json. Exit 0 = PASS, 1 = FAIL (after all retries), 2 = usage error.
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, args, list, config, withSlash, isPlaceholderBase, ensureDir, decode, fetchText } from './lib.mjs';
import { load } from './ledger.mjs';

// The exact HTML each editable field must produce (matched against the entity-decoded page too).
export const PATTERNS = {
  meta_description: v => `<meta name="description" content="${v}">`,
  title: v => `<title>${v}</title>`,
  image_alt: v => `alt="${v}"`,
};

// Turn a ledger task into verify-live checks. Throws when the task lacks what verification needs.
export function checksFromItem(item) {
  const p = PATTERNS[item.field];
  if (!p) throw new Error(`task ${item.id}: field "${item.field}" has no live check (allowed: ${Object.keys(PATTERNS).join(', ')})`);
  if (!item.url) throw new Error(`task ${item.id}: no url (page path such as products/<slug>/)`);
  if (!String(item.new_value ?? '').trim()) throw new Error(`task ${item.id}: no new_value`);
  const old = String(item.old_value ?? '').trim();
  return { path: item.url, mustContain: [p(item.new_value)], mustNotContain: old && old !== item.new_value ? [p(old)] : [] };
}

export function check(html, status, { mustContain = [], mustNotContain = [] }) {
  const hay = html + '\n' + decode(html);
  const missing = mustContain.filter(t => !hay.includes(t));
  const forbidden = mustNotContain.filter(t => hay.includes(t));
  return { status, ok: status === 200 && !missing.length && !forbidden.length, missing, forbidden };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function verify({ url, mustContain = [], mustNotContain = [], waitMinutes = 10, intervalSeconds = 30, log = () => {} }) {
  const started = new Date();
  const deadline = started.getTime() + waitMinutes * 60000;
  const attempts = [];
  for (let n = 1; ; n++) {
    const at = new Date();
    const fetched = url + (url.includes('?') ? '&' : '?') + `atlas_cb=${at.getTime()}`;
    const r = await fetchText(fetched, { headers: { 'cache-control': 'no-cache', pragma: 'no-cache' } });
    const c = check(r.text, r.status, { mustContain, mustNotContain });
    attempts.push({ n, at: at.toISOString(), status: r.status, ...(r.error ? { error: r.error } : {}), missing: c.missing, forbidden: c.forbidden });
    log(`attempt ${n}: HTTP ${r.status}${c.ok ? ' PASS' : ` (missing ${c.missing.length}, forbidden ${c.forbidden.length})`}`);
    if (c.ok || Date.now() + intervalSeconds * 1000 > deadline) {
      return { kind: 'verify', url, passed: c.ok, started_at: started.toISOString(), finished_at: new Date().toISOString(),
        must_contain: mustContain, must_not_contain: mustNotContain, wait_minutes: waitMinutes, attempts };
    }
    await sleep(intervalSeconds * 1000);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = args();
  const cfg = config();
  const base = a.base || cfg.base_url;
  let url = a.url;
  let mustContain = list(a['must-contain']), mustNotContain = list(a['must-not-contain']);
  if (a['ledger-item']) {
    const id = String(a['ledger-item']);
    const item = load(process.env.LEDGER_FILE || join(ROOT, 'ledger.json')).items.find(i => i.id === id);
    if (!item) { console.error(`verify-live: no ledger item ${id}`); process.exit(2); }
    try { const c = checksFromItem(item); a.path = a.path || c.path; mustContain.push(...c.mustContain); mustNotContain.push(...c.mustNotContain); }
    catch (e) { console.error(`verify-live: ${e.message}`); process.exit(2); }
    a.id = a.id || id;
  }
  if (!url && a.path && /^https?:\/\//.test(a.path)) url = a.path;
  if (!url && a.path) {
    if (isPlaceholderBase(base)) { console.error('verify-live: set "base_url" in atlas.config.json (or pass --base / --url).'); process.exit(2); }
    url = withSlash(base) + String(a.path).replace(/^\//, '');
  }
  if (!url || (!mustContain.length && !mustNotContain.length)) {
    console.error('usage: node ops/verify-live.mjs (--url=URL | --path=PATH) --must-contain=TEXT [--must-not-contain=TEXT] [--id=ID] [--wait-minutes=N] [--interval=S]\n   or: node ops/verify-live.mjs --ledger-item=ID [--base=URL] [--wait-minutes=N]');
    process.exit(2);
  }
  const res = await verify({
    url, mustContain, mustNotContain,
    waitMinutes: Number(a['wait-minutes'] ?? cfg.verify?.wait_minutes ?? 10),
    intervalSeconds: Number(a.interval ?? cfg.verify?.interval_seconds ?? 30),
    log: a.quiet ? () => {} : m => console.log(m),
  });
  res.id = a.id || null;
  const stamp = res.finished_at.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const name = (a.id || url.replace(/^https?:\/\//, '')).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const file = join(ensureDir(resolve(a.out || join(ROOT, 'evidence'))), `verify-${name}-${stamp}.json`);
  writeFileSync(file, JSON.stringify(res, null, 2) + '\n');
  const rel = file.startsWith(ROOT) ? file.slice(ROOT.length + 1).replace(/\\/g, '/') : file;
  console.log(`${res.passed ? 'PASS' : 'FAIL'} ${url} after ${res.attempts.length} attempt(s) evidence=${rel}`);
  process.exit(res.passed ? 0 : 1);
}
