import type { ModelFiles } from './ModelFiles';
import { baseName, IMPORT_LIMITS, ModelImportError, type SourceMaterial, type SourceMesh, type SourceScene } from './SourceScene';

interface MtlEntry {
  color: [number, number, number, number];
  map: string | null;
  alphaMap: boolean;
}

/** Reads the materials of an .mtl file (diffuse colour, dissolve, diffuse map). */
function parseMtl(text: string): Map<string, MtlEntry> {
  const out = new Map<string, MtlEntry>();
  let cur: MtlEntry | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const sp = line.search(/\s/);
    const key = (sp < 0 ? line : line.slice(0, sp)).toLowerCase();
    const rest = sp < 0 ? '' : line.slice(sp + 1).trim();
    if (key === 'newmtl') {
      cur = { color: [1, 1, 1, 1], map: null, alphaMap: false };
      out.set(rest, cur);
    } else if (!cur) {
      continue;
    } else if (key === 'kd') {
      const v = rest.split(/\s+/).map(Number);
      if (v.length >= 3 && v.every(Number.isFinite)) cur.color = [v[0], v[1], v[2], cur.color[3]];
    } else if (key === 'd') {
      const d = Number(rest.split(/\s+/).pop());
      if (Number.isFinite(d)) cur.color[3] = d;
    } else if (key === 'tr') {
      const t = Number(rest.split(/\s+/).pop());
      if (Number.isFinite(t) && t > 0 && t <= 1) cur.color[3] = 1 - t;
    } else if (key === 'map_kd' || (key === 'map_ka' && !cur.map)) {
      cur.map = mapFileName(rest);
    } else if (key === 'map_d') {
      cur.alphaMap = true;
    }
  }
  return out;
}

/** The file of a map statement, after its options (-s 1 1 1, -bm 0.5, ...). */
function mapFileName(rest: string): string {
  const parts = rest.split(/\s+/);
  let i = 0;
  const argCount: Record<string, number> = { '-blendu': 1, '-blendv': 1, '-bm': 1, '-boost': 1, '-cc': 1, '-clamp': 1, '-imfchan': 1, '-mm': 2, '-o': 3, '-s': 3, '-t': 3, '-texres': 1, '-type': 1 };
  while (i < parts.length && parts[i].startsWith('-')) {
    const n = argCount[parts[i].toLowerCase()] ?? 1;
    i += 1;
    // -o / -s / -t take up to three numbers.
    let k = 0;
    while (k < n && i < parts.length && /^[-+]?[\d.]/.test(parts[i])) {
      i++;
      k++;
    }
    if (k === 0 && n > 0 && i < parts.length - 1) i++;
  }
  return parts.slice(i).join(' ');
}

/**
 * Reads a Wavefront OBJ (with its .mtl and textures from the same import) into a SourceScene.
 * Groups and objects become meshes (their names help to find body parts), faces are
 * triangulated as fans.
 */
export function parseObj(bytes: Uint8Array, files: ModelFiles, path: string): SourceScene {
  const text = new TextDecoder('utf-8').decode(bytes);
  const pos: number[] = [];
  const nrm: number[] = [];
  const tex: number[] = [];
  const mtls = new Map<string, MtlEntry>();
  const scene: SourceScene = { meshes: [], materials: [], textures: [], bones: [], upAxis: null, frontHint: [0, 0, 1], info: [] };
  const materialIdx = new Map<string, number>();
  const textureIdx = new Map<string, number>();

  interface Building {
    name: string;
    verts: Map<string, number>;
    p: number[];
    n: number[];
    t: number[];
    tris: number[];
    triMat: number[];
    hasNormals: boolean;
    hasUv: boolean;
  }
  const newMesh = (name: string): Building => ({ name, verts: new Map(), p: [], n: [], t: [], tris: [], triMat: [], hasNormals: false, hasUv: false });
  let cur = newMesh('');
  const done: Building[] = [];
  let curMat = 'default';
  let totalTris = 0;

  const material = (name: string): number => {
    const known = materialIdx.get(name);
    if (known !== undefined) return known;
    const e = mtls.get(name);
    let texture = -1;
    if (e?.map) {
      const key = e.map.toLowerCase();
      let t = textureIdx.get(key);
      if (t === undefined) {
        t = scene.textures.push({ name: baseName(e.map), bytes: files.get(e.map, path) }) - 1;
        textureIdx.set(key, t);
      }
      texture = t;
    }
    const mat: SourceMaterial = {
      name,
      color: texture >= 0 ? [1, 1, 1, e?.color[3] ?? 1] : e?.color ?? [0.8, 0.8, 0.8, 1],
      texture,
      alpha: e?.alphaMap ? 'mask' : (e?.color[3] ?? 1) < 0.99 ? 'blend' : 'opaque',
    };
    const idx = scene.materials.push(mat) - 1;
    materialIdx.set(name, idx);
    return idx;
  };
  const finish = (): void => {
    if (cur.tris.length) done.push(cur);
  };
  const vertex = (ref: string): number => {
    let v = cur.verts.get(ref);
    if (v !== undefined) return v;
    const [a, b, c] = ref.split('/');
    const resolve = (s: string | undefined, len: number, size: number): number => {
      if (!s) return -1;
      let i = parseInt(s, 10);
      if (!Number.isFinite(i) || i === 0) return -1;
      i = i < 0 ? len / size + i : i - 1;
      return i >= 0 && i < len / size ? i : -1;
    };
    const pi = resolve(a, pos.length, 3);
    if (pi < 0) throw new ModelImportError('The OBJ file has a face with a bad vertex index.');
    const ti = resolve(b, tex.length, 2);
    const ni = resolve(c, nrm.length, 3);
    v = cur.p.length / 3;
    cur.p.push(pos[pi * 3], pos[pi * 3 + 1], pos[pi * 3 + 2]);
    if (ni >= 0) {
      cur.n.push(nrm[ni * 3], nrm[ni * 3 + 1], nrm[ni * 3 + 2]);
      cur.hasNormals = true;
    } else cur.n.push(0, 0, 0);
    if (ti >= 0) {
      cur.t.push(tex[ti * 2], 1 - tex[ti * 2 + 1]);
      cur.hasUv = true;
    } else cur.t.push(0, 0);
    cur.verts.set(ref, v);
    return v;
  };

  const lines = text.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    let line = lines[li];
    while (line.endsWith('\\') && li + 1 < lines.length) line = line.slice(0, -1) + ' ' + lines[++li];
    line = line.trim();
    if (!line || line.charCodeAt(0) === 35) continue;
    const sp = line.search(/\s/);
    const key = sp < 0 ? line : line.slice(0, sp);
    const rest = sp < 0 ? '' : line.slice(sp + 1).trim();
    switch (key) {
      case 'v': {
        const v = rest.split(/\s+/);
        pos.push(+v[0] || 0, +v[1] || 0, +v[2] || 0);
        if (pos.length > IMPORT_LIMITS.maxVertices * 3) throw new ModelImportError('The model has too many vertices.');
        break;
      }
      case 'vn': {
        const v = rest.split(/\s+/);
        nrm.push(+v[0] || 0, +v[1] || 0, +v[2] || 0);
        break;
      }
      case 'vt': {
        const v = rest.split(/\s+/);
        tex.push(+v[0] || 0, +(v[1] ?? 0) || 0);
        break;
      }
      case 'f': {
        const refs = rest.split(/\s+/);
        if (refs.length < 3) break;
        const mat = material(curMat);
        const v0 = vertex(refs[0]);
        for (let i = 1; i + 1 < refs.length; i++) {
          cur.tris.push(v0, vertex(refs[i]), vertex(refs[i + 1]));
          cur.triMat.push(mat);
          if (++totalTris > IMPORT_LIMITS.maxTriangles * 4) throw new ModelImportError('The model has too many triangles.');
        }
        break;
      }
      case 'g':
      case 'o': {
        finish();
        cur = newMesh(rest);
        break;
      }
      case 'usemtl':
        curMat = rest;
        break;
      case 'mtllib': {
        for (const name of [rest, ...rest.split(/\s+/)]) {
          const m = files.get(name, path);
          if (m) {
            for (const [k, v] of parseMtl(new TextDecoder().decode(m))) mtls.set(k, v);
            break;
          }
        }
        break;
      }
      default:
        break;
    }
  }
  finish();
  for (const b of done) {
    const order = [...b.triMat.keys()].sort((x, y) => b.triMat[x] - b.triMat[y]);
    const indices = new Uint32Array(b.tris.length);
    const groups: SourceMesh['groups'] = [];
    order.forEach((src, t) => {
      indices[t * 3] = b.tris[src * 3];
      indices[t * 3 + 1] = b.tris[src * 3 + 1];
      indices[t * 3 + 2] = b.tris[src * 3 + 2];
      const m = b.triMat[src];
      const last = groups[groups.length - 1];
      if (last && last.material === m) last.count++;
      else groups.push({ start: t, count: 1, material: m });
    });
    scene.meshes.push({
      name: b.name,
      positions: Float32Array.from(b.p),
      normals: b.hasNormals ? Float32Array.from(b.n) : null,
      uvs: b.hasUv ? Float32Array.from(b.t) : null,
      indices,
      groups,
      joints: null,
      weights: null,
    });
  }
  if (scene.meshes.length === 0) throw new ModelImportError('This OBJ file has no faces.');
  return scene;
}
