#!/usr/bin/env node
// Atlas governance checker — fails when a governance file is incomplete, unfinished or too long.
// Zero dependencies. Node 18+.
// Usage:  node check-governance.mjs <governance-dir>              check your filled-in pack
//         node check-governance.mjs <templates-dir> --templates   check the course templates themselves
// Exit code 0 = all files OK, 1 = something needs work, 2 = usage error.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RULES = {
  'PRINCIPLES.md': { budget: 600, headings: [], minRules: 5, maxRules: 15 },
  'AUTHORITY.md': { budget: 700, headings: [], mustMatch: [/autonomous/i, /approval/i, /\bnever\b/i] },
  'BUSINESS-MODEL.md': { budget: 700, headings: ['In one sentence', 'Revenue streams', 'Costs that matter', 'Where customers come from', 'What "good" means', 'Constraints', 'Unknowns'] },
  'STRATEGY.md': { budget: 900, headings: ['Goals', 'Bets per goal', 'Review triggers', 'Open questions', 'Review log'], mustContain: ['Next review'] },
  'CURRENT.md': { budget: 400, headings: [], mustContain: ['Last regenerated'] },
  'DECISIONS.md': { budget: null, headings: [], entry: { re: /^### D-\d{3} · \d{4}-\d{2}-\d{2} · .+/m, fields: ['Decided by', 'Decision', 'Why', 'Status'] } },
  'LESSONS.md': { budget: 900, headings: [], entry: { re: /^### L-\d{2} · \d{4}-\d{2}-\d{2} · .+/m, fields: ['What happened', 'Rule', 'Enforced by'], max: 40 } },
};

const words = s => (s.match(/[A-Za-z0-9€£$%][^\s|]*/g) || []).length;
const stripComments = s => s.replace(/<!--[\s\S]*?-->/g, '');
const h3s = s => [...s.matchAll(/^###\s+(.+)$/gm)].map(m => m[1]);
const INSTRUCTIONS = /HOW TO USE|\*\*Instructions \(delete when done\)\.\*\*/;

// Check one filled-in file. Returns a list of problems (empty = ok).
export function checkFilled(name, text) {
  const r = RULES[name]; const p = [];
  if (INSTRUCTIONS.test(text)) p.push('the Instructions block is still there — delete it when done');
  if (/^## (Template|Example)\b/m.test(text)) p.push('template/example sections are still there — keep only your own version');
  const body = stripComments(text);
  const ph = body.match(/<[a-z][^>\n]{0,60}>/gi);
  if (ph) p.push(`unfilled placeholders: ${[...new Set(ph)].slice(0, 5).join(', ')}`);
  const hs = h3s(body).join('\n');
  for (const h of r.headings) if (!hs.includes(h)) p.push(`missing heading: ${h}`);
  for (const m of r.mustContain || []) if (!body.includes(m)) p.push(`missing line: ${m}`);
  for (const m of r.mustMatch || []) if (!m.test(body)) p.push(`missing level: ${m.source.replace(/\\b/g, '')}`);
  if (r.budget && words(body) > r.budget) p.push(`too long: ${words(body)} words (budget ${r.budget})`);
  if (r.minRules) {
    const n = (body.match(/^\d+\.\s+\S/gm) || []).length;
    if (n < r.minRules || n > r.maxRules) p.push(`${n} numbered principles (want ${r.minRules}–${r.maxRules})`);
  }
  if (r.entry) {
    const parts = body.split(/^(?=### )/m).filter(x => x.startsWith('### '));
    const entries = parts.filter(x => r.entry.re.test(x));
    if (!entries.length) p.push('no entries in the required format');
    for (const e of entries) for (const f of r.entry.fields)
      if (!new RegExp(`\\*\\*${f.replace(/"/g, '\\"')}:\\*\\*`).test(e)) p.push(`${e.split('\n')[0].slice(4, 14)} missing field: ${f}`);
    if (r.entry.max && entries.length > r.entry.max) p.push(`${entries.length} entries (max ${r.entry.max}) — archive old ones`);
  }
  return p;
}

// Check one course template: needs an Instructions block and an Example part that passes checkFilled.
// A "## Template" part (empty headings) is optional; when present it must carry the required headings.
export function checkTemplate(name, text) {
  const p = [];
  if (!INSTRUCTIONS.test(text)) p.push('no Instructions block');
  const t = text.indexOf('\n## Template'), e = text.indexOf('\n## Example');
  if (e < 0) { p.push('no "## Example" section'); return p; }
  const example = exampleOf(text);
  const tpl = t >= 0 ? stripComments(text.slice(t, e)) : '';
  for (const h of RULES[name].headings) if (!h3s(tpl).join('\n').includes(h)) p.push(`template part missing heading: ${h}`);
  for (const q of checkFilled(name, example)) p.push(`example: ${q}`);
  return p;
}

// The example part of a template, as if it were a filled-in file: title line + everything under "## Example".
export function exampleOf(text) {
  const e = text.indexOf('\n## Example');
  return `${text.split('\n')[0]}\n\n${text.slice(e + 1).split('\n').slice(1).join('\n')}`;
}

export function checkDir(dir, { templates = false } = {}) {
  const out = {};
  for (const name of Object.keys(RULES)) {
    const f = join(dir, name);
    out[name] = existsSync(f) ? (templates ? checkTemplate : checkFilled)(name, readFileSync(f, 'utf8')) : ['file missing'];
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const dir = process.argv[2];
  if (!dir) { console.error('usage: node check-governance.mjs <dir> [--templates]'); process.exit(2); }
  const res = checkDir(dir, { templates: process.argv.includes('--templates') });
  let bad = 0;
  for (const [name, probs] of Object.entries(res)) {
    if (probs.length) { bad++; console.log(`✗ ${name}`); probs.forEach(x => console.log(`    - ${x}`)); }
    else console.log(`✓ ${name}`);
  }
  console.log(bad ? `\n${bad} file(s) need work.` : '\nGovernance pack OK.');
  process.exit(bad ? 1 : 0);
}
