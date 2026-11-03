// node --test tests/wp-collector.test.mjs — runs a local mock WordPress; no network needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collect, write, freshness, findings } from '../ops/wp-collector.mjs';

const longText = '<p>' + 'word '.repeat(60) + '</p>';
const pages = Array.from({ length: 3 }, (_, i) => ({ id: i + 1, type: 'page', slug: `p${i}`, title: { rendered: `Page ${i}` }, link: `/p${i}`, status: 'publish', modified_gmt: '2026-11-01T10:00:00', content: { rendered: i === 0 ? '<p>short</p>' : '<p>' + 'w '.repeat(200) + '</p>' }, excerpt: { rendered: '' } }));
const products = Array.from({ length: 130 }, (_, i) => ({ id: 100 + i, slug: `c${i}`, name: `Candle ${i}`, permalink: `/product/c${i}`, sku: `C${i}`,
  prices: { price: '2450', currency_code: 'EUR', currency_minor_unit: 2 }, is_in_stock: i !== 5,
  description: i === 0 ? '' : i === 1 ? '<p>too short</p>' : longText, short_description: '', images: i === 2 ? [] : [{ alt: i === 3 ? '' : 'candle' }], categories: [{ slug: 'gifts' }] }));

function server({ woo = true } = {}) {
  return new Promise(resolve => {
    const s = createServer((req, res) => {
      const u = new URL(req.url, 'http://x'); const per = Number(u.searchParams.get('per_page')); const page = Number(u.searchParams.get('page'));
      const send = (all) => { const pages = Math.max(1, Math.ceil(all.length / per)); if (page > pages) { res.writeHead(400); return res.end('{}'); }
        res.writeHead(200, { 'content-type': 'application/json', 'x-wp-totalpages': String(pages) }); res.end(JSON.stringify(all.slice((page - 1) * per, page * per))); };
      if (u.pathname === '/wp-json/wp/v2/pages') return send(pages);
      if (u.pathname === '/wp-json/wp/v2/posts') return send([]);
      if (u.pathname === '/wp-json/wc/store/v1/products' && woo) return send(products);
      res.writeHead(404); res.end('{}');
    }).listen(0, '127.0.0.1', () => resolve(s));
  });
}
const url = s => `http://127.0.0.1:${s.address().port}/`;

test('collects pages and paginated products, computes findings', async () => {
  const s = await server();
  try {
    const ev = await collect(url(s), { now: new Date('2026-11-02T08:00:00Z') });
    assert.equal(ev.complete, true); assert.equal(ev.woocommerce, true);
    assert.deepEqual(ev.counts, { pages: 3, posts: 0, products: 130 });
    assert.equal(ev.products[0].price, 24.5);
    const kinds = ev.findings.map(f => `${f.kind}:${f.id}`);
    for (const k of ['product_no_description:100', 'product_thin_description:101', 'product_no_image:102', 'product_image_missing_alt:103', 'product_out_of_stock:105', 'page_thin_content:1'])
      assert.ok(kinds.includes(k), k);
    assert.equal(ev.findings.length, 6);
  } finally { s.close(); }
});

test('site without WooCommerce: products empty, still complete', async () => {
  const s = await server({ woo: false });
  try { const ev = await collect(url(s)); assert.equal(ev.woocommerce, false); assert.equal(ev.counts.products, 0); assert.equal(ev.complete, true); }
  finally { s.close(); }
});

test('unreachable site: incomplete evidence, never fresh', async () => {
  const ev = await collect('http://127.0.0.1:9', {});
  assert.equal(ev.complete, false); assert.ok(ev.errors.length >= 1);
  assert.equal(freshness(ev).fresh, false);
});

test('freshness: 24h window', () => {
  const ev = { collected_at: '2026-11-01T08:00:00Z', complete: true };
  assert.equal(freshness(ev, new Date('2026-11-02T07:00:00Z')).fresh, true);
  assert.equal(freshness(ev, new Date('2026-11-02T09:00:00Z')).fresh, false);
});

test('write: dated + latest files, valid JSON', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-ev-'));
  const files = write({ collected_at: '2026-11-02T08:00:00.000Z', products: [], pages: [], findings: [] }, dir);
  assert.ok(files.every(existsSync)); assert.equal(JSON.parse(readFileSync(join(dir, 'wp-latest.json'), 'utf8')).collected_at, '2026-11-02T08:00:00.000Z');
});

test('findings thresholds are configurable', () => {
  assert.equal(findings({ products: [{ id: 1, description_words: 30, images: 1, images_missing_alt: 0 }], pages: [] }, { minDescriptionWords: 20 }).length, 0);
});

test('read-only: only GET requests without credentials; a URL with a password is refused', async () => {
  const seen = [];
  const fetchImpl = async (url, opts = {}) => { seen.push({ method: opts.method ?? 'GET', auth: Object.keys(opts.headers ?? {}).some(h => /authorization|cookie/i.test(h)) });
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }); };
  const ev = await collect('https://shop.example', { fetchImpl });
  assert.equal(ev.complete, true);
  assert.ok(seen.length >= 3);
  assert.ok(seen.every(r => r.method === 'GET' && !r.auth));
  await assert.rejects(collect('https://atlas:secret-app-password@shop.example', { fetchImpl }), /refused: remove the user name\/password/);
  assert.equal(seen.length, 3);
});
