#!/usr/bin/env node
// Writes player models as binary glTF (.glb), the same file the Account Manager's "Export .glb"
// button downloads (src/client/model/GlbExport.ts, bundled for Node with rolldown).
//
//   node scripts/export-glb.mjs <out dir> [model.mcpm ...]
//
// Without .mcpm files it exports the built-in models (public/models/index.json) as <id>.glb.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [out, ...files] = process.argv.slice(2);
if (!out) {
  console.error('usage: node scripts/export-glb.mjs <out dir> [model.mcpm ...]');
  process.exit(2);
}
const dir = mkdtempSync(join(tmpdir(), 'mc-glb-'));
try {
  const bundle = join(dir, 'export.mjs');
  execFileSync('npx', ['rolldown', join(root, 'scripts/export-glb-main.ts'), '--format', 'esm', '--platform', 'node', '-o', bundle], { stdio: ['ignore', 'ignore', 'inherit'], cwd: root });
  execFileSync('node', [bundle, resolve(out), ...files.map((f) => resolve(f))], { stdio: 'inherit', cwd: root });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
