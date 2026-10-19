#!/usr/bin/env node
import { errorMessage } from '../shared/env.ts';
import { rebuild } from './lib/rebuild.ts';

try {
  console.log(`✅ ${rebuild()} Markdown files rewritten offline.`);
} catch (error) {
  console.error('❌', errorMessage(error));
  process.exitCode = 1;
}
