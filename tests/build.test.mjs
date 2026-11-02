import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { build, parseProduct, loadProducts } from '../site/build.mjs';
import { tempRepo } from './helpers.mjs';

const BASE = 'https://example.github.io/atlas-starter/';

test('builds every product page with title, meta, og tags, alt and a sitemap', t => {
  const { dir, cleanup } = tempRepo(); t.after(cleanup);
  const out = join(dir, 'docs');
  const r = build({ base: BASE, out, contentDir: join(dir, 'site/content/products') });
  assert.equal(r.products, 8);
  const products = loadProducts(join(dir, 'site/content/products'));
  for (const p of products) {
    const html = readFileSync(join(out, 'products', p.slug, 'index.html'), 'utf8');
    assert.match(html, /<title>[^<]+<\/title>/, p.slug);
    assert.match(html, /<meta property="og:title" content="/, p.slug);
    assert.match(html, new RegExp(`<link rel="canonical" href="${BASE}products/${p.slug}/">`));
    assert.match(html, new RegExp(`<meta name="atlas-source" content="site/content/products/${p.slug}.md">`));
    if (p.meta_description) assert.match(html, /<meta name="description" content="[^"]+">/, p.slug);
    else assert.doesNotMatch(html, /name="description"/, `${p.slug} should have no meta tag`);
    if (p.image_alt) assert.match(html, /<img [^>]*alt="[^"]+"/, p.slug);
    else assert.doesNotMatch(html, /<img [^>]*alt=/, `${p.slug} should have no alt`);
  }
  const sm = readFileSync(join(out, 'sitemap.xml'), 'utf8');
  assert.equal((sm.match(/<loc>/g) || []).length, 9);
  assert.ok(sm.includes(`<loc>${BASE}</loc>`));
  assert.ok(readFileSync(join(out, 'robots.txt'), 'utf8').includes(`Sitemap: ${BASE}sitemap.xml`));
  const css = readFileSync(join(out, 'style.css'), 'utf8');
  for (const c of ['#003C49', '#006154', '#FFF0E6', '#F7FAFC', 'Inter']) assert.ok(css.includes(c), c);
});

test('output is deterministic (two builds are byte-identical)', t => {
  const { dir, cleanup } = tempRepo(); t.after(cleanup);
  const hash = () => {
    const h = createHash('sha256');
    const walk = d => readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
      .forEach(e => e.isDirectory() ? walk(join(d, e.name)) : h.update(e.name + readFileSync(join(d, e.name))));
    walk(join(dir, 'docs')); return h.digest('hex');
  };
  build({ base: BASE, out: join(dir, 'docs'), contentDir: join(dir, 'site/content/products') }); const a = hash();
  build({ base: BASE, out: join(dir, 'docs'), contentDir: join(dir, 'site/content/products') }); const b = hash();
  assert.equal(a, b);
});

test('front-matter parsing: quotes, escapes, and clear errors', () => {
  const p = parseProduct('---\nslug: a\ntitle: A & B\nmeta_description: "Say \\"hi\\""\nprice_eur: 5\n---\nBody text\n');
  assert.equal(p.meta_description, 'Say "hi"'); assert.equal(p.title, 'A & B'); assert.equal(p.body, 'Body text');
  assert.throws(() => parseProduct('---\nslug: a\ntitle: t\nprice_eur: 5\ncolour: red\n---\n'), /unknown field "colour"/);
  assert.throws(() => parseProduct('---\nslug: a\ntitle: t\n---\n'), /price_eur/);
  assert.throws(() => parseProduct('no front matter'), /front-matter/);
});

test('HTML special characters in content are escaped', t => {
  const { dir, cleanup } = tempRepo(); t.after(cleanup);
  build({ base: BASE, out: join(dir, 'docs'), contentDir: join(dir, 'site/content/products') });
  const html = readFileSync(join(dir, 'docs/products/cedar-and-sea-salt/index.html'), 'utf8');
  assert.ok(html.includes('<title>Cedar &amp; Sea Salt Soy Candle</title>'));
});
