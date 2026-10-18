/**
 * Small, dependency-free YAML emitter for JSON-like data.
 * - Strings always double-quoted (JSON escapes are valid YAML) → no date/number surprises
 * - Arrays of scalars as flow sequences:  [1, 2, 3]
 * - Objects and arrays of objects as block structures
 */
const SAFE_KEY = /^[A-Za-z_][A-Za-z0-9_]*$|^\d+$/;
const isScalar = (v) => v === null || typeof v !== 'object';

function scalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean') return String(v);
  return JSON.stringify(String(v));
}

function emitValue(v, indent) {
  const pad = '  '.repeat(indent);
  if (Array.isArray(v)) {
    if (!v.length) return ' []';
    if (v.every(isScalar)) return ' [' + v.map(scalar).join(', ') + ']';
    return '\n' + v.map((item) => {
      if (isScalar(item)) return `${pad}- ${scalar(item)}`;
      if (Array.isArray(item)) return `${pad}-${emitValue(item, indent + 1)}`;
      const body = emitMap(item, indent + 1);
      if (!body) return `${pad}- {}`;
      return `${pad}- ` + body.slice(pad.length + 2);
    }).join('\n');
  }
  if (v && typeof v === 'object') {
    const body = emitMap(v, indent);
    return body ? '\n' + body : ' {}';
  }
  return ' ' + scalar(v);
}

function emitMap(obj, indent) {
  const pad = '  '.repeat(indent);
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${pad}${SAFE_KEY.test(k) ? k : JSON.stringify(k)}:${emitValue(v, indent + 1)}`)
    .join('\n');
}

export function toYaml(obj) {
  return emitMap(obj, 0) + '\n';
}
