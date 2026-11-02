#!/usr/bin/env node
// OPTIONAL Atlas collector: Google Search Console search analytics → evidence/gsc-YYYY-MM-DD.json.
// Zero dependencies, Node 18+. Read-only scope (webmasters.readonly).
//
// STATUS: the Search Console API calls in this file are UNTESTED against Google (see TEST-LOG.md).
// The "not configured → skipped" path and the token signing are covered by tests/collect-gsc.test.mjs.
//
// Setup (once, see README "Optional: Search Console"):
//   1. Google Cloud: create a project, enable "Google Search Console API", create a service account, add a JSON key.
//   2. Search Console: add the service account's e-mail as a user (Restricted is enough) on your property.
//   3. Put the property in atlas.config.json → "gsc": { "site_url": "https://you.github.io/atlas-harbor-pine/" }
//      (or "sc-domain:example.com" for a domain property).
//   4. Save the JSON key OUTSIDE the repository and set GSC_KEY_FILE to its path when you run this script.
// Not configured? The script prints "skipped", writes a small skip note and exits 0, so the daily loop continues.
// Usage: node ops/collect-gsc.mjs [--date=YYYY-MM-DD] [--out=evidence]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createSign } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { ROOT, args, config, today, ensureDir } from './lib.mjs';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const b64url = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export function makeJwt(key, now = Math.floor(Date.now() / 1000)) {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: key.token_uri || TOKEN_URL, iat: now, exp: now + 3600 }));
  const sig = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(key.private_key);
  return `${head}.${claims}.${b64url(sig)}`;
}

// Search Console data lags about 2–3 days: end 3 days ago, span `days` days.
export function dateRange(now = new Date(), days = 28) {
  const end = new Date(now.getTime() - 3 * 86400000);
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  return { startDate: today(start), endDate: today(end) };
}

export function configured(env = process.env, cfg = config()) {
  const site = env.GSC_SITE_URL || cfg.gsc?.site_url;
  const keyFile = env.GSC_KEY_FILE;
  if (!keyFile) return { ok: false, reason: 'GSC_KEY_FILE is not set' };
  if (!existsSync(keyFile)) return { ok: false, reason: 'GSC_KEY_FILE points to a file that does not exist' };
  if (!site) return { ok: false, reason: 'gsc.site_url is empty in atlas.config.json' };
  return { ok: true, site, keyFile };
}

async function post(url, body, headers) {
  const r = await fetch(url, { method: 'POST', headers, body });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}: ${json.error_description || json.error?.message || json.error || 'error'}`);
  return json;
}

export async function collectGsc({ site, keyFile, days = 28, rowLimit = 250, now = new Date() }) {
  const key = JSON.parse(readFileSync(keyFile, 'utf8'));
  if (!key.client_email || !key.private_key) throw new Error('key file is not a service-account JSON key');
  const tok = await post(key.token_uri || TOKEN_URL,
    new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: makeJwt(key) }),
    { 'content-type': 'application/x-www-form-urlencoded' });
  const api = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
  const headers = { authorization: `Bearer ${tok.access_token}`, 'content-type': 'application/json' };
  const range = dateRange(now, days);
  const q = dims => post(api, JSON.stringify({ ...range, dimensions: dims, rowLimit, dataState: 'final' }), headers);
  const row = (r, names) => ({ ...Object.fromEntries(names.map((n, i) => [n, r.keys[i]])), clicks: r.clicks, impressions: r.impressions, ctr: Math.round(r.ctr * 10000) / 10000, position: Math.round(r.position * 10) / 10 });
  const pages = (await q(['page'])).rows || [];
  const queries = (await q(['page', 'query'])).rows || [];
  return {
    kind: 'gsc', collected_at: now.toISOString(), site_url: site, ...range,
    pages: pages.map(r => row(r, ['page'])),
    page_queries: queries.map(r => row(r, ['page', 'query'])),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = args();
  const cfg = config();
  const outDir = ensureDir(resolve(a.out || join(ROOT, 'evidence')));
  const file = join(outDir, `gsc-${a.date || today()}.json`);
  const c = configured(process.env, cfg);
  if (!c.ok) {
    writeFileSync(file, JSON.stringify({ kind: 'gsc', skipped: true, reason: c.reason, collected_at: new Date().toISOString() }, null, 2) + '\n');
    console.log(`collect-gsc: skipped — ${c.reason}. Search Console is optional; the loop continues without it.`);
    process.exit(0);
  }
  try {
    const ev = await collectGsc({ site: c.site, keyFile: c.keyFile, days: cfg.gsc?.days ?? 28, rowLimit: cfg.gsc?.row_limit ?? 250 });
    writeFileSync(file, JSON.stringify(ev, null, 2) + '\n');
    console.log(`collect-gsc: ${ev.pages.length} pages, ${ev.page_queries.length} page/query rows (${ev.startDate}..${ev.endDate}) → ${file}`);
  } catch (e) {
    writeFileSync(file, JSON.stringify({ kind: 'gsc', skipped: false, error: e.message, collected_at: new Date().toISOString() }, null, 2) + '\n');
    console.error(`collect-gsc: failed — ${e.message}`);
    process.exit(1);
  }
}
