// @ts-nocheck – typed in phase B of docs/adr/0004
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Minimal .env loader (no dependency needed). Existing environment variables win. */
export function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}

export const log = (...a) => console.log(`[${new Date().toLocaleTimeString('en-GB')}]`, ...a);

export function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

export function writeJSON(file, data, pretty = true) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, pretty ? 2 : 0));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The real clock (wall time and waiting); scripts accept a fake one in tests. */
export const systemClock = { now: () => Date.now(), sleep };
