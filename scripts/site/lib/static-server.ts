// Minimal static file server for a build folder (directory URLs serve index.html), on a free port.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

/** A running static server: its base URL and how to stop it. */
export type StaticServer = { url: string; close: () => Promise<void> };

/** Serves `root` on `port` (0 = any free port). Resolves to `{ url, close }`. */
export function serveStatic(root: string, port = 0): Promise<StaticServer> {
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    let file = path.join(base, url);
    if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') { reject(new Error('static server: no TCP address')); return; }
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}
