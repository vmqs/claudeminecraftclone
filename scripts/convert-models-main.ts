// Converts the built-in player models (run through scripts/convert-models.mjs, which bundles
// this file for Node). Uses the same import pipeline as Import Model... in the game.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseFbx } from '../src/client/model/FbxParser';
import { parseGltf } from '../src/client/model/GltfParser';
import { pngOnlyCodec } from '../src/client/model/ImageCodecs';
import { buildPlayerModel, type BuildOptions } from '../src/client/model/ModelBuilder';
import { ModelFiles } from '../src/client/model/ModelFiles';
import { parseObj } from '../src/client/model/ObjParser';
import { decodePlayerModel, encodePlayerModel, modelHash } from '../src/client/model/PlayerModelFormat';

interface Source {
  id: string;
  name: string;
  credits: string;
  /** Folder of the download (source/ and textures/ inside). */
  dir: string;
  /** Archives inside the folder to unpack into the file set (.zip, .rar). */
  archives?: string[];
  /** The model file inside the file set. */
  main: string;
  options?: Partial<BuildOptions>;
}

const SOURCES: Source[] = [
  {
    id: 'john_marston',
    name: 'John Marston',
    credits: 'John Marston (Red Dead Redemption), Rockstar Games. User-supplied model, included at the repo owner\'s request.',
    dir: '7a77fe5e-john-marston',
    main: 'John Marston.fbx',
    options: { maxTextureSize: 1024 },
  },
  {
    id: 'trevor',
    name: 'Trevor',
    credits: 'Trevor Philips (Grand Theft Auto V), Rockstar Games. User-supplied model, included at the repo owner\'s request.',
    dir: '0f0bbec7-trevor-gta-5',
    archives: ['source/1390323122_trevorp3dm_ru.rar'],
    main: 'trevor/trevor.obj',
    // The upper-body texture came as a separate picture (the archive has it only as a DDS).
    options: { maxTextureSize: 512, textureOverrides: { uppr: 'IMG_3679.png' } },
  },
  {
    id: 'roblox_noob',
    name: 'Roblox Noob',
    credits: 'Roblox Noob (Roblox Corporation), model by vanyabro85 on Sketchfab (CC-BY-4.0). User-supplied model, included at the repo owner\'s request.',
    dir: 'd0c42fa9-roblox-noob',
    archives: ['source/roblox_noob.zip'],
    main: 'scene.gltf',
    // A blocky body has no toes to tell its front from its back: it faces away by default.
    options: { yaw: 180 },
  },
];

async function unrar(bytes: Uint8Array): Promise<{ name: string; bytes: Uint8Array }[]> {
  const spec = process.env.NODE_UNRAR_JS || 'node-unrar-js';
  let mod: { createExtractorFromData(o: { data: ArrayBuffer }): Promise<{ extract(): { files: Iterable<{ fileHeader: { name: string; flags: { directory: boolean } }; extraction?: Uint8Array }> } }> };
  try {
    mod = await import(/* @vite-ignore */ spec);
  } catch {
    throw new Error('RAR archives need node-unrar-js: npm i --no-save node-unrar-js (or set NODE_UNRAR_JS to its path)');
  }
  const ex = await mod.createExtractorFromData({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer });
  const out: { name: string; bytes: Uint8Array }[] = [];
  for (const f of ex.extract().files) {
    if (f.fileHeader.flags.directory || !f.extraction) continue;
    out.push({ name: f.fileHeader.name.replace(/\\/g, '/'), bytes: f.extraction });
  }
  return out;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

async function main(): Promise<void> {
  const [srcRoot, outRoot] = process.argv.slice(2);
  if (!srcRoot || !outRoot) throw new Error('usage: convert-models <sources dir> <public/models dir>');
  const index: { id: string; name: string; credits: string; file: string; bytes: number; hash: string }[] = [];
  for (const s of SOURCES) {
    const dir = join(srcRoot, s.dir);
    if (!existsSync(dir)) throw new Error(`missing ${dir}`);
    const list: { name: string; bytes: Uint8Array }[] = [];
    for (const p of walk(dir)) {
      const rel = relative(dir, p).replace(/\\/g, '/');
      const bytes = new Uint8Array(readFileSync(p));
      if (s.archives?.includes(rel) && rel.endsWith('.rar')) list.push(...(await unrar(bytes)));
      else if (rel.startsWith('source/') && !s.archives?.includes(rel)) list.push({ name: rel.slice('source/'.length), bytes });
      else if (rel.startsWith('textures/')) list.push({ name: rel.slice('textures/'.length), bytes });
      else list.push({ name: rel.split('/').pop()!, bytes });
    }
    const files = await ModelFiles.fromFiles(list);
    const mainBytes = files.get(s.main);
    if (!mainBytes) throw new Error(`${s.id}: ${s.main} not found in ${files.paths.join(', ')}`);
    const lower = s.main.toLowerCase();
    const scene = lower.endsWith('.fbx') ? parseFbx(mainBytes) : lower.endsWith('.obj') ? parseObj(mainBytes, files, s.main) : parseGltf(mainBytes, files, s.main);
    const { model, report } = await buildPlayerModel(scene, files, pngOnlyCodec, { name: s.name, credits: s.credits, ...s.options });
    const bytes = encodePlayerModel(model);
    decodePlayerModel(bytes); // the game's checks must accept it
    const outDir = join(outRoot, s.id);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'model.mcpm'), bytes);
    const hash = modelHash(bytes);
    index.push({ id: s.id, name: s.name, credits: s.credits, file: `${s.id}/model.mcpm`, bytes: bytes.length, hash });
    console.log(`${s.id}: ${(bytes.length / 1024).toFixed(0)} KiB, ${report.vertices} vertices, ${report.triangles} triangles, rig ${report.rig}, up ${report.up}, facing ${report.facing}`);
    console.log(`  parts ${JSON.stringify(report.partVertices)}`);
    console.log(`  textures ${report.textures.join(', ')}`);
    for (const w of report.warnings) console.log(`  warning: ${w}`);
  }
  writeFileSync(join(outRoot, 'index.json'), JSON.stringify({ models: index }, null, 2) + '\n');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
