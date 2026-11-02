// Small shared helpers for the Atlas ops scripts. Zero dependencies. Node 18+.
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');

// --key=value and --flag arguments. Repeated keys become arrays.
export function args(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (const a of argv) {
    const m = a.match(/^--([a-z][a-z0-9-]*)(?:=(.*))?$/s);
    if (!m) { out._.push(a); continue; }
    const [k, v] = [m[1], m[2] ?? true];
    if (k in out) out[k] = [].concat(out[k], v); else out[k] = v;
  }
  return out;
}
export const list = v => (v === undefined ? [] : [].concat(v)).filter(x => x !== true);

export function config(root = ROOT) {
  const f = join(root, 'atlas.config.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
}
export const withSlash = u => (u.endsWith('/') ? u : u + '/');
export const isPlaceholderBase = u => !u || /YOUR-GITHUB-USERNAME/.test(u);

export const today = (d = new Date()) => d.toISOString().slice(0, 10);
export function ensureDir(d) { mkdirSync(d, { recursive: true }); return d; }

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decode(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e.toLowerCase()] ?? m));
}
export const escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Attributes of an HTML tag string, e.g. '<meta name="x" content="y">' → { name: 'x', content: 'y' }.
export function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    if (m.index === 0) continue; // the tag name itself
    out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

export async function fetchText(url, { timeoutMs = 20000, headers = {} } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'user-agent': 'atlas-starter/1.0', ...headers } });
    return { status: r.status, ok: r.ok, url: r.url, text: await r.text() };
  } catch (e) {
    return { status: 0, ok: false, url, text: '', error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally { clearTimeout(t); }
}
