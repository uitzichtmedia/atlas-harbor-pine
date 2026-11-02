#!/usr/bin/env node
// Builds the Harbor & Pine Candles demo catalogue from site/content/products/*.md into docs/.
// GitHub Pages serves docs/. Zero dependencies, Node 18+, deterministic: same input → byte-identical output.
// Usage: node site/build.mjs [--base=https://you.github.io/atlas-harbor-pine/] [--out=docs]
import { readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, args, config, withSlash, escapeHtml as esc, ensureDir } from '../ops/lib.mjs';

const FIELDS = ['slug', 'title', 'meta_description', 'price_eur', 'image_alt'];

// Front-matter: lines "key: value" between two "---" lines. Values may be in double quotes. The text below is the body.
export function parseProduct(text, file = 'product.md') {
  const m = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: no front-matter block (--- ... ---) at the top`);
  const p = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!kv) throw new Error(`${file}: cannot read front-matter line "${line}"`);
    let v = kv[2].trim();
    if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) v = v.slice(1, -1).replace(/\\"/g, '"');
    p[kv[1]] = v;
  }
  for (const k of Object.keys(p)) if (!FIELDS.includes(k)) throw new Error(`${file}: unknown field "${k}" (allowed: ${FIELDS.join(', ')})`);
  if (!p.slug || !/^[a-z0-9-]+$/.test(p.slug)) throw new Error(`${file}: slug missing or not lowercase-with-dashes`);
  if (!p.title) throw new Error(`${file}: title missing`);
  if (p.price_eur === undefined || Number.isNaN(Number(p.price_eur))) throw new Error(`${file}: price_eur missing or not a number`);
  p.body = m[2].trim();
  return p;
}

export function loadProducts(dir) {
  const files = readdirSync(dir).filter(f => f.endsWith('.md')).sort();
  const products = files.map(f => {
    const p = parseProduct(readFileSync(join(dir, f), 'utf8'), f);
    if (`${p.slug}.md` !== f) throw new Error(`${f}: slug "${p.slug}" must match the file name`);
    return { ...p, source: `site/content/products/${f}` };
  });
  return products;
}

const paragraphs = body => body.split(/\n\s*\n/).map(x => `<p>${esc(x.replace(/\s*\n\s*/g, ' '))}</p>`).join('\n      ');
const price = p => `€${Number(p.price_eur).toFixed(2)}`;

// Deterministic placeholder artwork: a jar in a colour derived from the slug.
export function svgFor(p) {
  let h = 0; for (const c of p.slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const tones = ['#006154', '#003C49', '#8A5A44', '#5B6B3A', '#7A4E7A', '#B0703C'];
  const tone = tones[h % tones.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img">
  <rect width="400" height="400" fill="#FFF0E6"/>
  <rect x="120" y="120" width="160" height="200" rx="18" fill="${tone}"/>
  <rect x="112" y="100" width="176" height="34" rx="10" fill="#003C49"/>
  <rect x="150" y="190" width="100" height="60" rx="6" fill="#FFF0E6" opacity="0.9"/>
  <path d="M200 70 C214 86 210 98 200 104 C190 98 186 86 200 70 Z" fill="#E8A33D"/>
</svg>
`;
}

function page({ title, description, canonical, depth, image, body, siteName, source }) {
  const up = '../'.repeat(depth);
  const meta = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${esc(title)}</title>`,
    description ? `<meta name="description" content="${esc(description)}">` : null,
    `<link rel="canonical" href="${esc(canonical)}">`,
    `<meta property="og:site_name" content="${esc(siteName)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    description ? `<meta property="og:description" content="${esc(description)}">` : null,
    `<meta property="og:type" content="${image ? 'product' : 'website'}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    image ? `<meta property="og:image" content="${esc(image)}">` : null,
    source ? `<meta name="atlas-source" content="${esc(source)}">` : null,
    `<link rel="stylesheet" href="${up}style.css">`,
  ].filter(Boolean).join('\n  ');
  return `<!doctype html>
<html lang="en">
<head>
  ${meta}
</head>
<body>
  <div class="demo">Demo catalogue for a course. Not a real shop: nothing here is for sale.</div>
  <header class="top"><a class="brand" href="${up || './'}">${esc(siteName)}</a></header>
  <main>
    ${body}
  </main>
  <footer>Harbor &amp; Pine Candles is a fictional brand used in the Uitzicht Academy course.</footer>
</body>
</html>
`;
}

export const CSS = `:root{--ink:#003C49;--green:#006154;--cream:#FFF0E6;--paper:#F7FAFC}
*{box-sizing:border-box}
body{margin:0;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--paper);line-height:1.6}
a{color:var(--green)}
.demo{background:var(--ink);color:var(--cream);font-size:.85rem;text-align:center;padding:.4rem 1rem}
.top{padding:1.25rem 1rem;max-width:960px;margin:0 auto}
.brand{font-weight:700;font-size:1.25rem;text-decoration:none;color:var(--ink)}
main{max-width:960px;margin:0 auto;padding:0 1rem 3rem}
h1{font-size:2rem;line-height:1.2;margin:.5rem 0 1rem}
.lead{max-width:40rem}
.grid{list-style:none;padding:0;display:grid;gap:1.25rem;grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}
.card{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,60,73,.12)}
.card a{display:block;text-decoration:none;color:inherit;padding-bottom:.75rem}
.card span{display:block;padding:0 .9rem}
.card .name{font-weight:600;margin-top:.6rem}
img{display:block;width:100%;height:auto;background:var(--cream)}
.product{display:grid;gap:2rem;grid-template-columns:1fr}
@media (min-width:720px){.product{grid-template-columns:1fr 1fr}}
.price{font-size:1.25rem;font-weight:600;color:var(--green)}
.back{display:inline-block;margin-top:1.5rem}
footer{border-top:1px solid #dde5ea;padding:1.5rem 1rem;text-align:center;font-size:.85rem;color:#4a6670}
`;

export function build({ base, out = join(ROOT, 'docs'), contentDir = join(ROOT, 'site/content/products'), siteName = 'Harbor & Pine Candles' } = {}) {
  base = withSlash(base);
  const products = loadProducts(contentDir);
  const files = new Map();
  files.set('style.css', CSS);
  files.set('.nojekyll', '');
  const cards = products.map(p => `<li class="card"><a href="products/${p.slug}/">
        <img src="images/${p.slug}.svg" width="400" height="400"${p.image_alt ? ` alt="${esc(p.image_alt)}"` : ''}>
        <span class="name">${esc(p.title)}</span><span>${price(p)}</span></a></li>`).join('\n      ');
  files.set('index.html', page({
    title: `${siteName} — Hand-poured soy candles`,
    description: 'Hand-poured soy candles and wax melts with calm, natural scents. A fictional demo catalogue used to teach AI operators.',
    canonical: base, depth: 0, siteName,
    body: `<h1>Hand-poured soy candles</h1>
    <p class="lead">Small-batch candles and wax melts with calm, natural scents. This is a demo catalogue: an AI operator keeps its product pages in good shape.</p>
    <ul class="grid">
      ${cards}
    </ul>`,
  }));
  for (const p of products) {
    files.set(`images/${p.slug}.svg`, svgFor(p));
    files.set(`products/${p.slug}/index.html`, page({
      title: p.title, description: p.meta_description, canonical: `${base}products/${p.slug}/`, depth: 2, siteName,
      image: `${base}images/${p.slug}.svg`, source: p.source,
      body: `<article class="product">
      <img src="../../images/${p.slug}.svg" width="400" height="400"${p.image_alt ? ` alt="${esc(p.image_alt)}"` : ''}>
      <div>
        <h1>${esc(p.title)}</h1>
        <p class="price">${price(p)}</p>
      ${paragraphs(p.body)}
        <a class="back" href="../../">All candles</a>
      </div>
    </article>`,
    }));
  }
  const urls = [base, ...products.map(p => `${base}products/${p.slug}/`)];
  files.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}
</urlset>
`);
  files.set('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${base}sitemap.xml\n`);

  if (existsSync(out)) rmSync(out, { recursive: true, force: true }); // docs/ is generated: rebuild from scratch
  for (const [rel, content] of files) { const f = join(out, rel); ensureDir(dirname(f)); writeFileSync(f, content); }
  const warnings = [];
  for (const p of products) {
    if (!p.meta_description) warnings.push(`${p.slug}: no meta_description`);
    if (!p.image_alt) warnings.push(`${p.slug}: no image_alt`);
  }
  return { products: products.length, files: files.size, out, base, warnings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = args();
  const cfg = config();
  const base = a.base || process.env.ATLAS_BASE_URL || cfg.base_url || 'http://localhost:8080/';
  try {
    const r = build({ base, out: a.out ? join(process.cwd(), a.out) : undefined, siteName: cfg.site_name || undefined });
    console.log(`built ${r.products} products, ${r.files} files → ${r.out} (base ${r.base})`);
    for (const w of r.warnings) console.log(`  note: ${w} (the collector will report this)`);
  } catch (e) { console.error(`build failed: ${e.message}`); process.exit(1); }
}
