import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Wall time and waiting; scripts take the real one (`systemClock`), tests a fake one. */
export type Clock = { now(): number; sleep(ms: number): Promise<void> };

/** A logger like `console.log`. */
export type Log = (...args: unknown[]) => void;

/** Minimal .env loader (no dependency needed). Existing environment variables win. */
export function loadEnv(): void {
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

export const log: Log = (...a) => console.log(`[${new Date().toLocaleTimeString('en-GB')}]`, ...a);

/** The message of a caught value (an Error's message, anything else as text). */
export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Parsed JSON of `file`, or `fallback` when it is missing or unreadable. The shape is the caller's to check. */
export function readJSON(file: string, fallback: unknown): unknown {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

export function writeJSON(file: string, data: unknown, pretty = true): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, pretty ? 2 : 0));
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The real clock (wall time and waiting); scripts accept a fake one in tests. */
export const systemClock: Clock = { now: () => Date.now(), sleep };
