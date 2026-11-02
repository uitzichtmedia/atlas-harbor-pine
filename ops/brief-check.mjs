#!/usr/bin/env node
// Checks a daily briefing: the four fixed headings, in order, and at most 200 words.
// Usage: node ops/brief-check.mjs briefings/YYYY-MM-DD.md   → exit 0 = OK, 1 = fix it, 2 = usage error.
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const HEADINGS = ['Done & verified', 'Waiting for measurement', 'Needs your decision', 'Problems'];
export const MAX_WORDS = 200;

export function checkBrief(text) {
  const p = [];
  const hs = [...text.matchAll(/^## (.+)$/gm)].map(m => m[1].trim());
  if (JSON.stringify(hs) !== JSON.stringify(HEADINGS)) p.push(`headings must be exactly, in order: ${HEADINGS.map(h => `"## ${h}"`).join(', ')} (found: ${hs.join(' | ') || 'none'})`);
  if (!/^# Atlas briefing — \d{4}-\d{2}-\d{2}\s*$/m.test(text)) p.push('first line must be "# Atlas briefing — YYYY-MM-DD"');
  const words = text.replace(/^#.*$/gm, '').split(/\s+/).filter(w => /[A-Za-z0-9€]/.test(w)).length;
  if (words > MAX_WORDS) p.push(`${words} words (max ${MAX_WORDS}, headings not counted)`);
  for (const h of HEADINGS) {
    const sec = text.split(`## ${h}`)[1]?.split(/^## /m)[0] ?? '';
    if (!sec.trim()) p.push(`section "${h}" is empty — write "None." if there is nothing`);
  }
  return { ok: !p.length, problems: p, words };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const f = process.argv[2];
  if (!f || !existsSync(f)) { console.error('usage: node ops/brief-check.mjs briefings/YYYY-MM-DD.md'); process.exit(2); }
  const r = checkBrief(readFileSync(f, 'utf8'));
  console.log(r.ok ? `brief OK (${r.words} words)` : `brief needs work:\n${r.problems.map(x => '  - ' + x).join('\n')}`);
  process.exit(r.ok ? 0 : 1);
}
