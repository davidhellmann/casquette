#!/usr/bin/env node
// @ts-nocheck – typed in phase B of docs/adr/0004
import { rebuild } from './lib/rebuild.ts';

try {
  console.log(`✅ ${rebuild()} Markdown files rewritten offline.`);
} catch (error) {
  console.error('❌', error.message);
  process.exitCode = 1;
}
