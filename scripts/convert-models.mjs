#!/usr/bin/env node
// Converts the built-in player models into public/models/<id>/model.mcpm and
// public/models/index.json (run by hand; the outputs are committed, the raw downloads are not).
//
//   node scripts/convert-models.mjs <downloads dir> [out dir = public/models]
//
// <downloads dir> holds the three unpacked downloads (7a77fe5e-john-marston/,
// 0f0bbec7-trevor-gta-5/, d0c42fa9-roblox-noob/, each with source/ and textures/). Trevor's
// source is a RAR archive: install node-unrar-js first (npm i --no-save node-unrar-js) or set
// NODE_UNRAR_JS to its path. The conversion is the game's own import pipeline
// (src/client/model/), bundled for Node with rolldown.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [src, out = join(root, 'public/models')] = process.argv.slice(2);
if (!src) {
  console.error('usage: node scripts/convert-models.mjs <downloads dir> [out dir]');
  process.exit(2);
}
const dir = mkdtempSync(join(tmpdir(), 'mc-models-'));
try {
  const bundle = join(dir, 'convert.mjs');
  execFileSync('npx', ['rolldown', join(root, 'scripts/convert-models-main.ts'), '--format', 'esm', '--platform', 'node', '-o', bundle], { stdio: ['ignore', 'ignore', 'inherit'], cwd: root });
  execFileSync('node', [bundle, resolve(src), resolve(out)], { stdio: 'inherit' });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
