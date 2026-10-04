/** Body of scripts/export-glb.mjs (bundled with rolldown): .mcpm -> .glb. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { exportGlb } from '../src/client/model/GlbExport';
import { decodePlayerModel } from '../src/client/model/PlayerModelFormat';

const [out, ...files] = process.argv.slice(2);
const inputs: { id: string; path: string }[] = files.length
  ? files.map((f) => ({ id: basename(f).replace(/\.mcpm$/i, '') === 'model' ? basename(join(f, '..')) : basename(f).replace(/\.mcpm$/i, ''), path: f }))
  : (JSON.parse(readFileSync('public/models/index.json', 'utf8')) as { models: { id: string; file: string }[] }).models.map((m) => ({ id: m.id, path: join('public/models', m.file) }));
mkdirSync(out, { recursive: true });
for (const { id, path } of inputs) {
  const model = decodePlayerModel(new Uint8Array(readFileSync(path)));
  const glb = exportGlb(model);
  const target = join(out, `${id}.glb`);
  writeFileSync(target, glb);
  console.log(`${target}: ${model.name}, ${model.indices.length / 3} triangles, ${(glb.length / 1024).toFixed(0)} KB`);
}
