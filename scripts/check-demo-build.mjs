// `npm run demo:check -- <build dir> [--base /demo/]` – the deploy's guard for the public demo (#54):
// fails unless the build contains only the synthetic demo dataset (demo/) and every root-relative
// link and asset lies inside the base path and has a file behind it. Checks: lib/demo-build-check.mjs.
import path from 'node:path';
import { parseArgs } from 'node:util';
import { checkDemoBuild, normaliseBase } from './lib/demo-build-check.mjs';
import { ROOT } from './lib/env.mjs';
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { base: { type: 'string', default: '/' } },
});

const build = positionals[0] ?? 'dist';
const problems = checkDemoBuild({ build: path.resolve(build), root: ROOT, base: values.base });
if (problems.length) {
  console.error(`\n✗ Demo check: ${problems.length} problem${problems.length === 1 ? '' : 's'} in ${build}\n`);
  for (const line of problems.slice(0, 50)) console.error(`  ${line}`);
  if (problems.length > 50) console.error(`  … and ${problems.length - 50} more`);
  console.error('');
  process.exit(1);
}
console.log(`✓ Demo check: ${build} contains only demo data and works under ${normaliseBase(values.base)}`);
