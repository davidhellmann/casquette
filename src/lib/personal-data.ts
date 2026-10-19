/**
 * Personal configuration (src/data/<name>.json) is not in the repo. If it is missing,
 * the tracked example file src/data/<name>.example.json applies – except for optional
 * configuration whose example only documents the format (zones.json, readOptionalPersonalJSON).
 */
import fs from 'node:fs';
import path from 'node:path';

/** Parse seam: the files are unchecked JSON, callers narrow or trust the documented shape. */
const tryJSON = (file: string): { ok: true; value: unknown } | { ok: false } => {
  try { return { ok: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { return { ok: false }; }
};

/**
 * Reads `<dir>/<name>.json`, otherwise `<dir>/<name>.example.json`, otherwise `fallback`. The parsed
 * JSON is returned as `unknown` – the file is not validated here.
 */
export function readPersonalJSON(name: string, fallback: unknown, { dir = path.join(process.cwd(), 'src/data') }: { dir?: string } = {}): unknown {
  for (const file of [`${name}.json`, `${name}.example.json`]) {
    const r = tryJSON(path.join(dir, file));
    if (r.ok) return r.value;
  }
  return fallback;
}

/**
 * Reads `<dir>/<name>.json` for optional configuration whose example file only documents the format
 * (zones.json): without the personal file there is nothing (`null`), a broken file throws.
 */
export function readOptionalPersonalJSON(name: string, { dir = path.join(process.cwd(), 'src/data') }: { dir?: string } = {}): unknown {
  const file = path.join(dir, `${name}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) {
    throw new Error(`${name}.json: ${error instanceof Error ? error.message : String(error)}`);
  }
}
