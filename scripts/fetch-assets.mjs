#!/usr/bin/env node
// Builds public/assets/ from two layers:
//   vanilla/      original Minecraft 1.5.2 resources, downloaded from Mojang's servers
//                 (client jar + legacy sound/music index). Never committed to git.
//   packs/<id>/   texture packs bundled in resourcepacks/*.zip (Classic Faithful 32x).
// It also writes public/assets/manifest.json, which the game reads at startup.
//
// Downloads are cached in .cache/mojang and verified by SHA-1, so re-runs are fast.
// Usage: node scripts/fetch-assets.mjs [--force] [--no-sound]

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const VERSION = '1.5.2';
const VERSION_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const RESOURCES_BASE = 'https://resources.download.minecraft.net';
// Folders of the legacy (pre-1.6) asset index that 1.5.2 actually loads.
const SOUND_PREFIXES = ['sound3/', 'music/', 'newmusic/', 'streaming/'];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = path.join(root, '.cache', 'mojang');
const outDir = path.join(root, 'public', 'assets');
const packsDir = path.join(root, 'resourcepacks');

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const withSound = !args.has('--no-sound');

const sha1 = (buf) => createHash('sha1').update(buf).digest('hex');

async function fetchWithRetry(url, attempts = 5) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastErr;
}

/** Downloads url into the cache (verified by sha1 when given) and returns its bytes. */
async function cached(url, name, expectedSha1) {
  const file = path.join(cacheDir, name);
  if (existsSync(file)) {
    const buf = await fs.readFile(file);
    if (!expectedSha1 || sha1(buf) === expectedSha1) return buf;
  }
  const buf = await fetchWithRetry(url);
  if (expectedSha1 && sha1(buf) !== expectedSha1) {
    throw new Error(`SHA-1 mismatch for ${url}: got ${sha1(buf)}, want ${expectedSha1}`);
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, buf);
  return buf;
}

async function writeFile(rel, data) {
  const file = path.join(outDir, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
}

/** Runs fn over items with bounded concurrency. */
async function pool(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const scriptHash = sha1(await fs.readFile(fileURLToPath(import.meta.url)));
  const packZips = existsSync(packsDir)
    ? (await fs.readdir(packsDir)).filter((f) => f.toLowerCase().endsWith('.zip')).sort()
    : [];
  const packHashes = await Promise.all(packZips.map(async (f) => sha1(await fs.readFile(path.join(packsDir, f)))));
  const stamp = JSON.stringify({ VERSION, scriptHash, packHashes, withSound });
  const stampFile = path.join(outDir, '.stamp');
  if (!force && existsSync(stampFile) && (await fs.readFile(stampFile, 'utf8')) === stamp) {
    console.log('[assets] up to date');
    return;
  }

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  // 1. Version metadata and client jar.
  console.log(`[assets] resolving Minecraft ${VERSION}`);
  const versions = JSON.parse((await fetchWithRetry(VERSION_MANIFEST)).toString('utf8'));
  const entry = versions.versions.find((v) => v.id === VERSION);
  if (!entry) throw new Error(`version ${VERSION} not found in manifest`);
  const versionJson = JSON.parse((await cached(entry.url, `${VERSION}.json`, entry.sha1)).toString('utf8'));
  const client = versionJson.downloads.client;
  console.log(`[assets] client jar (${(client.size / 1e6).toFixed(1)} MB)`);
  const jar = unzipSync(new Uint8Array(await cached(client.url, `${VERSION}-client.jar`, client.sha1)));

  const vanillaFiles = [];
  for (const [name, data] of Object.entries(jar)) {
    if (name.endsWith('/') || name.endsWith('.class') || name.startsWith('META-INF/')) continue;
    await writeFile(`vanilla/${name}`, data);
    vanillaFiles.push(name);
  }
  console.log(`[assets] extracted ${vanillaFiles.length} resources from the client jar`);

  // 2. Sounds and music from the legacy asset index.
  const soundFiles = [];
  if (withSound) {
    const idx = versionJson.assetIndex;
    const index = JSON.parse((await cached(idx.url, `index-${idx.id}.json`, idx.sha1)).toString('utf8'));
    // Records other than 13 and cat only exist as streaming/*.mus (Ogg XORed with a key
    // stream, decoded by src/audio/MusCodec.ts); take the 1.5.2 records with no .ogg twin
    // ("where are we now.mus" is a leftover copy of "wait", not a record).
    const RECORDS = new Set(['11', '13', 'blocks', 'cat', 'chirp', 'far', 'mall', 'mellohi', 'stal', 'strad', 'wait', 'ward']);
    const isRecordMus = (key) =>
      key.startsWith('streaming/') && key.endsWith('.mus') && RECORDS.has(key.slice(10, -4)) && !index.objects[key.slice(0, -4) + '.ogg'];
    const wanted = Object.entries(index.objects).filter(
      ([key]) => (key.endsWith('.ogg') || isRecordMus(key)) && SOUND_PREFIXES.some((p) => key.startsWith(p)),
    );
    console.log(`[assets] ${wanted.length} sound files`);
    await pool(wanted, 16, async ([key, obj]) => {
      const url = `${RESOURCES_BASE}/${obj.hash.slice(0, 2)}/${obj.hash}`;
      const data = await cached(url, `objects/${obj.hash.slice(0, 2)}/${obj.hash}`, obj.hash);
      await writeFile(`vanilla/${key}`, data);
    });
    soundFiles.push(...wanted.map(([key]) => key));
  }

  // 3. Bundled texture packs.
  const packs = [];
  for (const zipName of packZips) {
    const id = zipName.replace(/\.zip$/i, '').replace(/[^A-Za-z0-9]+/g, '_').toLowerCase().replace(/^_|_$/g, '');
    const files = unzipSync(new Uint8Array(await fs.readFile(path.join(packsDir, zipName))));
    const list = [];
    for (const [name, data] of Object.entries(files)) {
      if (name.endsWith('/')) continue;
      await writeFile(`packs/${id}/${name}`, data);
      list.push(name);
    }
    const description = files['pack.txt'] ? Buffer.from(files['pack.txt']).toString('utf8').trim() : '';
    packs.push({ id, name: zipName.replace(/\.zip$/i, ''), description, files: list.sort() });
    console.log(`[assets] pack ${id}: ${list.length} files`);
  }

  const manifest = {
    version: VERSION,
    vanilla: vanillaFiles.sort(),
    sounds: soundFiles.sort(),
    packs,
    // The pack selected on first launch (the user's uploaded pack).
    defaultPack: packs.find((p) => p.id.includes('faithful'))?.id ?? null,
  };
  await writeFile('manifest.json', JSON.stringify(manifest));
  await fs.writeFile(stampFile, stamp);
  console.log('[assets] done');
}

main().catch((err) => {
  console.error('[assets] failed:', err);
  process.exit(1);
});
