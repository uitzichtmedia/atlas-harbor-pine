// Shared test helpers: a throw-away copy of the repo in a temp dir, so tests never touch your real files.
// The copy uses the ORIGINAL seeded products and governance from tests/fixtures/, so the tests keep passing
// after Atlas has fixed the real product files.
import { mkdtempSync, cpSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../ops/lib.mjs';

export function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-test-'));
  for (const p of ['ops', 'site/build.mjs', 'governance/check-governance.mjs', 'atlas.config.json']) cpSync(join(ROOT, p), join(dir, p), { recursive: true });
  cpSync(join(ROOT, 'tests/fixtures/products'), join(dir, 'site/content/products'), { recursive: true });
  cpSync(join(ROOT, 'tests/fixtures/governance'), join(dir, 'governance'), { recursive: true });
  writeFileSync(join(dir, 'ledger.json'), '{ "version": 1, "items": [] }\n');
  // a fixed placeholder config, independent of the learner's own atlas.config.json
  writeFileSync(join(dir, 'atlas.config.json'), JSON.stringify({ site_name: 'Harbor & Pine Candles', base_url: 'https://YOUR-GITHUB-USERNAME.github.io/atlas-starter/', seo: { title_max: 60, meta_min: 70, meta_max: 160 }, evidence_max_age_hours: 24, ledger_stale_minutes: 180, verify: { wait_minutes: 10, interval_seconds: 30 }, limits: { max_changes_per_day: 5 } }, null, 2));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
export function run(dir, script, argv = [], env = {}) {
  const r = spawnSync(process.execPath, [join(dir, script), ...argv], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
  return { code: r.status, out: r.stdout + r.stderr };
}
// Run a CLI asynchronously (needed when the same process also runs the HTTP server the CLI talks to).
import { spawn } from 'node:child_process';
export function runAsync(dir, script, argv = [], env = {}) {
  return new Promise(ok => {
    const c = spawn(process.execPath, [join(dir, script), ...argv], { cwd: dir, env: { ...process.env, ...env } });
    let out = ''; c.stdout.on('data', d => (out += d)); c.stderr.on('data', d => (out += d));
    c.on('close', code => ok({ code, out }));
  });
}
