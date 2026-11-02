#!/usr/bin/env node
// Tiny static file server for previewing docs/ locally (and for the tests). Zero dependencies.
// Usage: node ops/serve.mjs [--dir=docs] [--port=8080]   then open http://localhost:8080/
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, args } from './lib.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.json': 'application/json' };

export function serve(dir, port = 0, host = '127.0.0.1') {
  const root = resolve(dir);
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let f = normalize(join(root, path));
      if (!f.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
      if ((await stat(f).catch(() => null))?.isDirectory()) f = join(f, 'index.html');
      const body = await readFile(f);
      res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' }).end(body);
    } catch { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); }
  });
  return new Promise(ok => server.listen(port, host, () => {
    const { port: p } = server.address();
    ok({ url: `http://${host}:${p}/`, close: () => new Promise(r => server.close(r)), server });
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = args();
  const s = await serve(a.dir ? resolve(a.dir) : join(ROOT, 'docs'), Number(a.port || 8080), a.host || '127.0.0.1');
  console.log(`serving ${a.dir || 'docs'} at ${s.url}  (Ctrl+C to stop)`);
}
