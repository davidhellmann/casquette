// @ts-nocheck – typed in phase B of docs/adr/0004
// Minimal static file server for the e2e build (dist-e2e/): directory URLs serve index.html.
// Used instead of `astro preview`, which detaches into the background when not run in a terminal.
// SERVE_ROOT (repo-relative) serves another folder – the website test serves website/.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', process.env.SERVE_ROOT || 'dist-e2e');
const PORT = Number(process.env.PORT || 4391);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(ROOT, url);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404).end('Not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`e2e server on http://localhost:${PORT}`));
