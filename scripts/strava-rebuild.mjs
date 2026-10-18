#!/usr/bin/env node
import { rebuild } from './lib/rebuild.mjs';

try {
  console.log(`✅ ${rebuild()} Markdown files rewritten offline.`);
} catch (error) {
  console.error('❌', error.message);
  process.exitCode = 1;
}
