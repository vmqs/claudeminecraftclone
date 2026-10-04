#!/usr/bin/env node
// Writes the cross-check fixture for the Forge mod's Java .mcpm decoder:
// mods/forge-1.8.9/src/test/resources/mcpm-reference.json, made by the game's own decoder
// (src/client/model/PlayerModelFormat.ts, bundled for Node with rolldown): exact hashes of every
// decoded array of the built-in models, and damaged files with the error the game reports.
//
//   node scripts/mcpm-reference.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'mc-mcpmref-'));
try {
  const bundle = join(dir, 'ref.mjs');
  execFileSync('npx', ['rolldown', join(root, 'scripts/mcpm-reference-main.ts'), '--format', 'esm', '--platform', 'node', '-o', bundle], { stdio: ['ignore', 'ignore', 'inherit'], cwd: root });
  execFileSync('node', [bundle, join(root, 'mods/forge-1.8.9/src/test/resources/mcpm-reference.json')], { stdio: 'inherit', cwd: root });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
