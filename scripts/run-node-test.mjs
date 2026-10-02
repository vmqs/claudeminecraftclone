#!/usr/bin/env node
// Bundles a TypeScript check (tests/*.test.ts) for Node with rolldown and runs it.
// Usage: node scripts/run-node-test.mjs tests/crafting.test.ts [more.test.ts ...]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts/run-node-test.mjs <test.ts> [...]');
  process.exit(2);
}
const dir = mkdtempSync(join(tmpdir(), 'mc-test-'));
let failed = false;
try {
  for (const file of files) {
    const out = join(dir, basename(file).replace(/\.ts$/, '.mjs'));
    execFileSync('npx', ['rolldown', file, '--format', 'esm', '--platform', 'node', '-o', out], { stdio: ['ignore', 'ignore', 'inherit'] });
    console.log(`# ${file}`);
    try {
      execFileSync('node', [out], { stdio: 'inherit' });
    } catch {
      failed = true;
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
