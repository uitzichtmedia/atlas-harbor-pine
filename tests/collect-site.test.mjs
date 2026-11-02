import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { build } from '../site/build.mjs';
import { collect, analyse, rebase } from '../ops/collect-site.mjs';
import { serve } from '../ops/serve.mjs';
import { tempRepo, run, runAsync } from './helpers.mjs';

const SITE = 'https://example.github.io/atlas-starter/';
const SEO = { title_max: 60, meta_min: 70, meta_max: 160 };

// The seeded demo defects every learner should see on day one.
function assertSeededDefects(ev, site = SITE) {
  const by = Object.fromEntries(ev.pages.map(p => [p.path, p.issues]));
  assert.equal(ev.pages.length, 9);
  assert.deepEqual(by['/products/wild-fig-wax-melts/'], ['META_MISSING']);
  assert.deepEqual(by['/products/orange-and-clove/'], ['META_MISSING']);
  assert.deepEqual(by['/products/amber-evening/'], ['META_TOO_SHORT']);
  assert.deepEqual(by['/products/lavender-hearth/'], ['META_TOO_SHORT']);
  assert.deepEqual(by['/products/linen-morning/'], ['IMG_ALT_MISSING']);
  assert.deepEqual(by['/products/pine-forest-large/'], ['TITLE_DUPLICATE']);
  assert.deepEqual(by['/products/pine-forest-travel-tin/'], ['TITLE_DUPLICATE']);
  assert.deepEqual(by['/products/cedar-and-sea-salt/'], []);
  assert.deepEqual(ev.duplicate_titles.map(d => d.title), ['Pine Forest Soy Candle']);
  const amber = ev.pages.find(p => p.path === '/products/amber-evening/');
  assert.equal(amber.meta_description_length, 18);
  assert.equal(amber.source, 'site/content/products/amber-evening.md');
  assert.equal(amber.url, `${site}products/amber-evening/`);
  assert.deepEqual(ev.errors, []);
}

test('--local mode finds exactly the seeded defects', async t => {
  const { dir, cleanup } = tempRepo(); t.after(cleanup);
  build({ base: SITE, out: join(dir, 'docs'), contentDir: join(dir, 'site/content/products') });
  const ev = await collect({ base: SITE, local: join(dir, 'docs'), siteBase: SITE, seo: SEO });
  assert.equal(ev.mode, 'local');
  assertSeededDefects(ev);
});

test('live mode over HTTP (local server) finds the same defects and records HTTP status', async t => {
  const { dir, cleanup } = tempRepo(); t.after(cleanup);
  build({ base: SITE, out: join(dir, 'docs'), contentDir: join(dir, 'site/content/products') });
  const srv = await serve(join(dir, 'docs')); t.after(srv.close);
  const ev = await collect({ base: srv.url, siteBase: SITE, seo: SEO });
  assert.equal(ev.mode, 'live');
  assert.ok(ev.pages.every(p => p.status === 200));
  assertSeededDefects(ev);
});

test('a deleted page shows as HTTP_ERROR and as a broken link on the home page', async t => {
  const { dir, cleanup } = tempRepo(); t.after(cleanup);
  build({ base: SITE, out: join(dir, 'docs'), contentDir: join(dir, 'site/content/products') });
  rmSync(join(dir, 'docs/products/amber-evening'), { recursive: true });
  const srv = await serve(join(dir, 'docs')); t.after(srv.close);
  const ev = await collect({ base: srv.url, siteBase: SITE, seo: SEO });
  const amber = ev.pages.find(p => p.path === '/products/amber-evening/');
  assert.equal(amber.status, 404); assert.deepEqual(amber.issues, ['HTTP_ERROR']);
  const home = ev.pages.find(p => p.path === '/');
  assert.ok(home.issues.includes('BROKEN_LINK'));
  assert.equal(home.broken_links[0].href, 'products/amber-evening/');
});

test('unreachable site → error recorded, CLI exits 1; placeholder base → exit 2', async t => {
  const ev = await collect({ base: 'http://127.0.0.1:9/', siteBase: SITE, seo: SEO });
  assert.equal(ev.errors.length, 1);
  const { dir, cleanup } = tempRepo(); t.after(cleanup);
  const r = run(dir, 'ops/collect-site.mjs'); // config still has the placeholder base_url
  assert.equal(r.code, 2); assert.match(r.out, /base_url/);
  const r2 = run(dir, 'ops/collect-site.mjs', ['--base=http://127.0.0.1:9/', '--date=2026-01-01']);
  assert.equal(r2.code, 1);
});

test('CLI writes evidence/site-DATE.json (local and --base against a server)', async t => {
  const { dir, cleanup } = tempRepo(); t.after(cleanup);
  assert.equal(run(dir, 'site/build.mjs').code, 0);
  const r = run(dir, 'ops/collect-site.mjs', ['--local=docs', '--date=2026-11-02']);
  assert.equal(r.code, 0, r.out);
  const cfgBase = JSON.parse(readFileSync(join(dir, 'atlas.config.json'), 'utf8')).base_url;
  assertSeededDefects(JSON.parse(readFileSync(join(dir, 'evidence/site-2026-11-02.json'), 'utf8')), cfgBase);
  const srv = await serve(join(dir, 'docs')); t.after(srv.close);
  const r2 = await runAsync(dir, 'ops/collect-site.mjs', [`--base=${srv.url}`, '--date=2026-11-03']);
  assert.equal(r2.code, 0, r2.out);
  const ev = JSON.parse(readFileSync(join(dir, 'evidence/site-2026-11-03.json'), 'utf8'));
  assert.equal(ev.mode, 'live'); assert.equal(ev.summary.pages_ok, 9);
});

test('analyse and rebase helpers', () => {
  const a = analyse('<title> A &amp; B </title><meta content="Hi there" name="description"><img src="x.svg"><img src="y.svg" alt="">');
  assert.equal(a.title, 'A & B'); assert.equal(a.meta_description, 'Hi there'); assert.deepEqual(a.images_without_alt, ['x.svg']);
  assert.deepEqual(rebase(`${SITE}products/a/`, SITE, 'http://127.0.0.1:1234/'), { rel: 'products/a/', url: 'http://127.0.0.1:1234/products/a/' });
});

test('site built for an old base URL is still crawled correctly, with a warning', async t => {
  const { dir, cleanup } = tempRepo(); t.after(cleanup);
  build({ base: 'https://YOUR-GITHUB-USERNAME.github.io/atlas-starter/', out: join(dir, 'docs'), contentDir: join(dir, 'site/content/products') });
  const srv = await serve(join(dir, 'docs')); t.after(srv.close);
  const ev = await collect({ base: srv.url, siteBase: 'https://sam.github.io/candles/', seo: SEO });
  assert.equal(ev.summary.pages_ok, 9);
  assert.match(ev.warnings[0], /run node site\/build.mjs/);
});
