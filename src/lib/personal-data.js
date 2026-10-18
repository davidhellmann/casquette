/**
 * Personal configuration (src/data/<name>.json) is not in the repo. If it is missing,
 * the tracked example file src/data/<name>.example.json applies – except for optional
 * configuration whose example only documents the format (zones.json, readOptionalPersonalJSON).
 */
import fs from 'node:fs';
import path from 'node:path';

const tryJSON = (file) => { try { return { ok: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { return { ok: false }; } };

/** Reads `<dir>/<name>.json`, otherwise `<dir>/<name>.example.json`, otherwise `fallback`. */
export function readPersonalJSON(name, fallback, { dir = path.join(process.cwd(), 'src/data') } = {}) {
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
export function readOptionalPersonalJSON(name, { dir = path.join(process.cwd(), 'src/data') } = {}) {
  const file = path.join(dir, `${name}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) {
    throw new Error(`${name}.json: ${error.message}`);
  }
}
