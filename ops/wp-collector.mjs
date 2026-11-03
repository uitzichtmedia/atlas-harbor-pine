#!/usr/bin/env node
// Atlas evidence collector — WordPress / WooCommerce (public REST endpoints, read-only).
// Zero dependencies. Node 18+ (built-in fetch).
// Optional adapter for your own WordPress / WooCommerce site (course lecture L7.3). Not used by the demo loop.
// Usage: node ops/wp-collector.mjs <site-url> [out-dir]      e.g. node ops/wp-collector.mjs http://127.0.0.1:9400 evidence
//        node ops/wp-collector.mjs check evidence/wp-latest.json [maxHours]   → exit 0 fresh, 1 stale/incomplete
// Writes <out-dir>/wp-<YYYY-MM-DD>.json and <out-dir>/wp-latest.json. Never writes to the site.
import { writeFileSync, mkdirSync, renameSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SCHEMA_VERSION = 1;
const strip = (html = '') => String(html).replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const words = (txt) => (txt ? txt.split(' ').filter(Boolean).length : 0);

async function getAll(base, path, fetchImpl, perPage = 100, maxPages = 20) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const url = `${base}${path}${sep}per_page=${perPage}&page=${page}`;
    const res = await fetchImpl(url, { headers: { accept: 'application/json', 'user-agent': 'atlas-collector/1' } });
    if (res.status === 404) return { ok: false, status: 404, items: out };
    if (res.status === 400 && page > 1) break; // WordPress returns 400 past the last page
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    const batch = await res.json();
    if (!Array.isArray(batch)) throw new Error(`${url} -> expected an array`);
    out.push(...batch);
    const totalPages = Number(res.headers.get('x-wp-totalpages') || 0);
    if (batch.length < perPage || (totalPages && page >= totalPages)) break;
  }
  return { ok: true, status: 200, items: out };
}

export function summarisePage(p) {
  const text = strip(p.content?.rendered);
  return { id: p.id, type: p.type, slug: p.slug, title: strip(p.title?.rendered), link: p.link, status: p.status,
    modified: p.modified_gmt ? `${p.modified_gmt}Z` : null, words: words(text), excerpt_words: words(strip(p.excerpt?.rendered)) };
}
export function summariseProduct(p) {
  const desc = strip(p.description); const short = strip(p.short_description);
  return { id: p.id, slug: p.slug, name: strip(p.name), link: p.permalink, sku: p.sku || null,
    price: p.prices ? Number(p.prices.price) / 10 ** (p.prices.currency_minor_unit ?? 2) : null, currency: p.prices?.currency_code ?? null,
    in_stock: p.is_in_stock ?? null, description_words: words(desc), short_description_words: words(short),
    images: Array.isArray(p.images) ? p.images.length : 0, images_missing_alt: Array.isArray(p.images) ? p.images.filter(i => !String(i.alt ?? '').trim()).length : 0,
    categories: (p.categories || []).map(c => c.slug) };
}

// Deterministic findings the planner can use. Thresholds are deliberately simple and visible.
export function findings(ev, { minDescriptionWords = 40, minPageWords = 150 } = {}) {
  const f = [];
  for (const p of ev.products) {
    if (p.description_words === 0) f.push({ kind: 'product_no_description', id: p.id, link: p.link });
    else if (p.description_words < minDescriptionWords) f.push({ kind: 'product_thin_description', id: p.id, link: p.link, words: p.description_words });
    if (p.images === 0) f.push({ kind: 'product_no_image', id: p.id, link: p.link });
    if (p.images_missing_alt > 0) f.push({ kind: 'product_image_missing_alt', id: p.id, link: p.link, count: p.images_missing_alt });
    if (p.in_stock === false) f.push({ kind: 'product_out_of_stock', id: p.id, link: p.link });
  }
  for (const p of ev.pages) if (p.words < minPageWords) f.push({ kind: 'page_thin_content', id: p.id, link: p.link, words: p.words });
  return f;
}

export async function collect(site, { fetchImpl = fetch, now = new Date() } = {}) {
  // Read-only by design: only GET requests to public endpoints, never a login. A URL with a user name or password in it
  // is refused, so a credential can never end up in a request, an evidence file or the terminal.
  const u = new URL(site);
  if (u.username || u.password) throw new Error('refused: remove the user name/password from the site URL - this collector only reads public data');
  const base = site.replace(/\/+$/, '');
  const errors = [];
  const safe = async (label, fn) => { try { return await fn(); } catch (e) { errors.push(`${label}: ${e.message}`); return { ok: false, items: [] }; } };
  const pages = await safe('pages', () => getAll(base, '/wp-json/wp/v2/pages', fetchImpl));
  const posts = await safe('posts', () => getAll(base, '/wp-json/wp/v2/posts', fetchImpl));
  const products = await safe('products', () => getAll(base, '/wp-json/wc/store/v1/products', fetchImpl));
  const ev = {
    schema_version: SCHEMA_VERSION, source: 'wordpress-rest', site: base, collected_at: now.toISOString(),
    woocommerce: products.ok === true, errors,
    counts: { pages: pages.items.length, posts: posts.items.length, products: products.items.length },
    pages: [...pages.items, ...posts.items].map(summarisePage),
    products: products.items.map(summariseProduct),
  };
  ev.findings = findings(ev);
  ev.complete = errors.length === 0;
  return ev;
}

// Freshness gate used by the planner: evidence older than maxHours (or incomplete) must not be planned on.
export function freshness(ev, now = new Date(), maxHours = 24) {
  const ageHours = (now - new Date(ev.collected_at)) / 3.6e6;
  return { fresh: ev.complete !== false && ageHours <= maxHours, age_hours: Math.round(ageHours * 10) / 10, complete: ev.complete !== false };
}

export function write(ev, outDir) {
  mkdirSync(outDir, { recursive: true });
  const day = ev.collected_at.slice(0, 10);
  const files = [join(outDir, `wp-${day}.json`), join(outDir, 'wp-latest.json')];
  for (const f of files) { writeFileSync(`${f}.tmp`, JSON.stringify(ev, null, 2) + '\n'); renameSync(`${f}.tmp`, f); }
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'check') { // node ops/wp-collector.mjs check evidence/wp-latest.json [maxHours]
    if (!a || !existsSync(a)) { console.error('no evidence file'); process.exit(2); }
    const r = freshness(JSON.parse(readFileSync(a, 'utf8')), new Date(), Number(b || 24));
    console.log(JSON.stringify(r)); process.exit(r.fresh ? 0 : 1);
  }
  if (!cmd) { console.error('usage: node ops/wp-collector.mjs <site-url> [out-dir] | check <file> [maxHours]'); process.exit(2); }
  let ev;
  try { ev = await collect(cmd); } catch (e) { console.error(e.message); process.exit(2); }
  const files = write(ev, a || 'evidence');
  console.log(`collected ${ev.counts.pages} pages, ${ev.counts.posts} posts, ${ev.counts.products} products, ${ev.findings.length} findings -> ${files.join(', ')}`);
  if (!ev.complete) { console.error('INCOMPLETE:', ev.errors.join(' | ')); process.exit(1); }
}
