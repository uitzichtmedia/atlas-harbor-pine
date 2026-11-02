#!/usr/bin/env node
// Atlas site collector: reads sitemap.xml, fetches every page and records SEO facts as evidence.
// Zero dependencies, Node 18+. Read-only: it never changes the site.
// Usage:
//   node ops/collect-site.mjs                       crawl the live site at base_url from atlas.config.json
//   node ops/collect-site.mjs --base=https://...     crawl another base URL
//   node ops/collect-site.mjs --local=docs           offline: read the built files in docs/ instead of the web
//   options: --out=evidence  --date=YYYY-MM-DD  --quiet
// Writes evidence/site-YYYY-MM-DD.json. Exit 0 = collected (defects are data, not errors),
// 1 = could not read the sitemap or any page, 2 = usage/config error.
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, args, config, withSlash, isPlaceholderBase, today, ensureDir, decode, attrs, fetchText } from './lib.mjs';

export const ISSUE = {
  HTTP_ERROR: 'page did not return HTTP 200',
  TITLE_MISSING: 'no <title>',
  TITLE_TOO_LONG: 'title longer than seo.title_max characters',
  TITLE_DUPLICATE: 'same title as another page',
  META_MISSING: 'no meta description (or empty)',
  META_TOO_SHORT: 'meta description shorter than seo.meta_min characters',
  META_TOO_LONG: 'meta description longer than seo.meta_max characters',
  IMG_ALT_MISSING: 'an image has no alt attribute',
  BROKEN_LINK: 'an internal link returns an error',
};

// Pure HTML analysis of one page (exported for tests).
export function analyse(html) {
  const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = tm ? decode(tm[1]).replace(/\s+/g, ' ').trim() : null;
  let meta = null, canonical = null, source = null;
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const a = attrs(tag);
    if ((a.name || '').toLowerCase() === 'description') meta = (a.content ?? '').trim();
    if ((a.name || '').toLowerCase() === 'atlas-source') source = a.content || null;
  }
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) { const a = attrs(tag); if ((a.rel || '').toLowerCase() === 'canonical') canonical = a.href || null; }
  const images = (html.match(/<img\b[^>]*>/gi) || []).map(attrs);
  const h1 = (html.match(/<h1\b/gi) || []).length;
  const links = (html.match(/<a\b[^>]*>/gi) || []).map(t => attrs(t).href).filter(Boolean);
  return {
    title, title_length: title ? [...title].length : 0,
    meta_description: meta, meta_description_length: meta ? [...meta].length : 0,
    canonical, source, h1_count: h1,
    images_without_alt: images.filter(a => !('alt' in a)).map(a => a.src || '(no src)'),
    links,
  };
}

// Where to fetch a sitemap <loc> from: map the configured site base onto the base we crawl.
// declaredBase = the base the sitemap was built with (its first <loc>), which may still be an old or placeholder URL.
export function rebase(loc, siteBase, crawlBase, declaredBase) {
  for (const b of [siteBase, declaredBase, crawlBase].filter(Boolean)) if (loc.startsWith(b)) return { rel: loc.slice(b.length), url: crawlBase + loc.slice(b.length) };
  try {
    const u = new URL(loc), cb = new URL(crawlBase);
    const rel = u.pathname.startsWith(cb.pathname) ? u.pathname.slice(cb.pathname.length) : u.pathname.replace(/^\//, '');
    return { rel, url: crawlBase + rel };
  } catch { return { rel: loc, url: loc }; }
}

export function findIssues(pages, seo) {
  const groups = new Map();
  for (const p of pages) if (p.title) groups.set(p.title, [...(groups.get(p.title) || []), p.url]);
  const duplicate_titles = [...groups].filter(([, urls]) => urls.length > 1).map(([title, urls]) => ({ title, urls }));
  const dupSet = new Set(duplicate_titles.flatMap(d => d.urls));
  for (const p of pages) {
    const i = [];
    if (p.status !== 200) i.push('HTTP_ERROR');
    else {
      if (!p.title) i.push('TITLE_MISSING');
      else if (p.title_length > seo.title_max) i.push('TITLE_TOO_LONG');
      if (dupSet.has(p.url)) i.push('TITLE_DUPLICATE');
      if (!p.meta_description) i.push('META_MISSING');
      else if (p.meta_description_length < seo.meta_min) i.push('META_TOO_SHORT');
      else if (p.meta_description_length > seo.meta_max) i.push('META_TOO_LONG');
      if (p.images_without_alt.length) i.push('IMG_ALT_MISSING');
      if (p.broken_links?.length) i.push('BROKEN_LINK');
    }
    p.issues = i;
  }
  const counts = {};
  for (const p of pages) for (const i of p.issues) counts[i] = (counts[i] || 0) + 1;
  return { duplicate_titles, counts };
}

export async function collect({ base, local, siteBase, seo, now = new Date() }) {
  const crawlBase = withSlash(base);
  const localDir = local ? resolve(local) : null;
  const readLocal = rel => {
    let f = join(localDir, decodeURIComponent(rel.split(/[?#]/)[0]));
    if (rel === '' || rel.endsWith('/')) f = join(f, 'index.html');
    else if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    return existsSync(f) ? { status: 200, text: readFileSync(f, 'utf8') } : { status: 404, text: '' };
  };
  const cb = `atlas_cb=${now.getTime()}`;
  const get = async (rel, url) => {
    if (localDir) return readLocal(rel);
    const r = await fetchText(url + (url.includes('?') ? '&' : '?') + cb, { headers: { 'cache-control': 'no-cache' } });
    return { status: r.status, text: r.text, error: r.error };
  };

  const sm = await get('sitemap.xml', crawlBase + 'sitemap.xml');
  const evidence = {
    kind: 'site', collected_at: now.toISOString(), mode: localDir ? 'local' : 'live',
    base: localDir ? `file:${local}` : crawlBase, site_base: siteBase || crawlBase, seo,
    sitemap: { url: crawlBase + 'sitemap.xml', status: sm.status, error: sm.error },
    pages: [], duplicate_titles: [], summary: {}, errors: [],
  };
  if (sm.status !== 200) { evidence.errors.push(`sitemap not readable (HTTP ${sm.status}${sm.error ? ', ' + sm.error : ''})`); return evidence; }
  const locs = [...sm.text.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map(m => decode(m[1]));
  if (!locs.length) evidence.errors.push('sitemap has no <loc> entries');

  const declaredBase = locs.length && locs.every(l => l.startsWith(locs[0])) ? locs[0] : null;
  if (declaredBase && siteBase && declaredBase !== withSlash(siteBase)) evidence.warnings = [`sitemap was built for ${declaredBase}, not base_url ${siteBase} — run node site/build.mjs and push`];
  const linkCache = new Map();
  for (const loc of locs) {
    const { rel, url } = rebase(loc, siteBase && withSlash(siteBase), crawlBase, declaredBase);
    const r = await get(rel, url);
    const page = { url: loc, path: '/' + rel, status: r.status, ...(r.error ? { error: r.error } : {}) };
    if (r.status === 200) {
      const a = analyse(r.text);
      const broken = [];
      for (const href of a.links) {
        if (/^(mailto:|tel:|#|javascript:)/i.test(href)) continue;
        const abs = new URL(href, url).href;
        if (!abs.startsWith(crawlBase)) continue; // external links are out of scope
        const lrel = abs.slice(crawlBase.length).split('#')[0];
        if (!linkCache.has(lrel)) linkCache.set(lrel, (await get(lrel, crawlBase + lrel)).status);
        if (linkCache.get(lrel) !== 200) broken.push({ href, status: linkCache.get(lrel) });
      }
      delete a.links;
      Object.assign(page, a, { broken_links: broken });
    }
    evidence.pages.push(page);
  }
  const { duplicate_titles, counts } = findIssues(evidence.pages, seo);
  evidence.duplicate_titles = duplicate_titles;
  evidence.summary = { pages: evidence.pages.length, pages_ok: evidence.pages.filter(p => p.status === 200).length, pages_with_issues: evidence.pages.filter(p => p.issues.length).length, issues: counts };
  if (locs.length && !evidence.summary.pages_ok) evidence.errors.push('no page returned HTTP 200');
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = args();
  const cfg = config();
  const seo = { title_max: 60, meta_min: 70, meta_max: 160, ...(cfg.seo || {}) };
  const base = a.base || (a.local ? (cfg.base_url || 'http://localhost/') : cfg.base_url);
  if (!a.local && isPlaceholderBase(base)) {
    console.error('collect-site: set "base_url" in atlas.config.json to your GitHub Pages URL first (or use --local=docs or --base=...).');
    process.exit(2);
  }
  const ev = await collect({ base, local: a.local === true ? 'docs' : a.local, siteBase: cfg.base_url, seo });
  const outDir = ensureDir(resolve(a.out || join(ROOT, 'evidence')));
  const file = join(outDir, `site-${a.date || today()}.json`);
  writeFileSync(file, JSON.stringify(ev, null, 2) + '\n');
  if (!a.quiet) {
    console.log(`collect-site (${ev.mode}): ${ev.summary.pages ?? 0} pages, ${ev.summary.pages_with_issues ?? 0} with issues → ${file}`);
    for (const p of ev.pages) if (p.issues?.length) console.log(`  ${p.path.padEnd(34)} ${p.issues.join(', ')}`);
    for (const w of ev.warnings || []) console.log(`  warning: ${w}`);
    for (const e of ev.errors) console.log(`  ERROR: ${e}`);
  }
  process.exit(ev.errors.length ? 1 : 0);
}
