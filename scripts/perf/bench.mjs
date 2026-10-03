#!/usr/bin/env node
// Runs a Node-side benchmark from scripts/perf/ (bundled with rolldown).
// Usage: node scripts/perf/bench.mjs <worldgen|mesher|...> [args...]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [name, ...rest] = process.argv.slice(2);
if (!name) {
  console.error('usage: node scripts/perf/bench.mjs <worldgen|mesher> [args...]');
  process.exit(2);
}
const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, `${name}-bench.ts`);
const dir = mkdtempSync(join(tmpdir(), 'mc-bench-'));
try {
  const out = join(dir, `${name}.mjs`);
  execFileSync('npx', ['rolldown', src, '--format', 'esm', '--platform', 'node', '-o', out], { stdio: ['ignore', 'ignore', 'inherit'] });
  execFileSync('node', [out, ...rest], { stdio: 'inherit' });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
