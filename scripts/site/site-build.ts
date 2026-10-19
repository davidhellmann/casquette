// `npm run site:build [-- --out <dir>] [-- --demo <dir>]` – the website for the deploy (#55, #54):
// website/ → dist-site/ with the legal placeholders filled from SITE_LEGAL_* and Cabin injected
// when SITE_CABIN_HOST is set. --demo copies a demo build into <out>/demo/ and injects Cabin there.
// Variables and an example: website/README.md. Reads only the process environment, never .env.
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, errorMessage } from '../shared/env.ts';
import { buildSite } from './lib/site-build.ts';

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: 'dist-site' },
    demo: { type: 'string' },
  },
});

try {
  buildSite({
    src: path.join(ROOT, 'website'),
    out: path.resolve(values.out),
    demo: values.demo ? path.resolve(values.demo) : null,
    log: (line) => console.log(line),
  });
} catch (error) {
  console.error(`\n✗ ${errorMessage(error)}\n`);
  process.exit(1);
}
