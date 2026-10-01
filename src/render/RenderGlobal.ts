import { Block } from '../block/Block';
import type { Minecraft } from '../client/Minecraft';
import { AxisAlignedBB } from '../core/AxisAlignedBB';
import { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import { EnumMovingObjectType, type MovingObjectPosition } from '../core/MovingObjectPosition';
import type { Entity } from '../entity/Entity';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { ItemStack } from '../item/ItemStack';
import type { MesherRequest, MesherResponse, MeshResult } from '../workers/mesherProtocol';
import { allocSnapshot, SNAPSHOT_PAD, SNAPSHOT_SIZE, type SectionSnapshot } from '../world/ChunkCache';
import { ColorizerFoliage, ColorizerGrass } from '../world/biome/Colorizer';
import type { IWorldAccess } from '../world/IWorldAccess';
import type { World } from '../world/World';
import type { Frustum } from './Frustum';
import { type DisplayList, GL, type TerrainMesh } from './gl/GL';
import { Tessellator } from './gl/Tessellator';
import { EntityDiggingFX } from './particle/EntityDiggingFX';
import type { EntityFX } from './particle/EntityFX';
import { RenderHelper } from './RenderHelper';
import { RenderManager } from './entity/RenderManager';

const f = Math.fround;
const S = SNAPSHOT_SIZE;

/** One 16^3 render section (WorldRenderer): two passes of uploaded geometry. */
export class WorldRenderer {
  static chunksUpdated = 0;
  readonly meshes: [TerrainMesh | null, TerrainMesh | null] = [null, null];
  needsUpdate = true;
  inFlight = false;
  /** Marked dirty again while a mesh was being built. */
  stale = false;
  isInFrustum = true;
  hasGeometry = false;
  readonly posX: number;
  readonly posY: number;
  readonly posZ: number;

  constructor(
    readonly sx: number,
    readonly sy: number,
    readonly sz: number,
  ) {
    this.posX = sx * 16;
    this.posY = sy * 16;
    this.posZ = sz * 16;
  }

  skipRenderPass(pass: number): boolean {
    return !this.meshes[pass] || this.meshes[pass]!.vertexCount === 0;
  }

  distanceToEntitySquared(e: Entity): number {
    const dx = e.posX - (this.posX + 8);
    const dy = e.posY - (this.posY + 8);
    const dz = e.posZ - (this.posZ + 8);
    return dx * dx + dy * dy + dz * dz;
  }

  updateInFrustum(fr: Frustum): void {
    this.isInFrustum = fr.isBoxInFrustum(this.posX - 6, this.posY - 6, this.posZ - 6, this.posX + 22, this.posY + 22, this.posZ + 22);
  }
}

interface MesherWorker {
  worker: Worker;
  busy: number;
}

/**
 * RenderGlobal: owns the section renderers, schedules meshing on the worker pool, draws
 * terrain passes, the sky, clouds and the block selection box, and turns world events
 * into sounds and particles.
 */
export class RenderGlobal implements IWorldAccess {
  theWorld: World | null = null;
  private readonly sections = new Map<number, WorldRenderer>();
  private readonly workers: MesherWorker[] = [];
  private readonly snapshots: SectionSnapshot[] = [];
  private readonly jobs = new Map<number, WorldRenderer>();
  private readonly results: MeshResult[] = [];
  private nextJobId = 1;
  private mesherReady = false;
  private renderDistance = -1;
  /** Section radius drawn around the player (renderChunksWide / 2). */
  renderRadius = 8;
  cloudTickCounter = 0;
  private starList: DisplayList | null = null;
  private skyList: DisplayList | null = null;
  private skyList2: DisplayList | null = null;
  renderersLoaded = 0;
  renderersBeingClipped = 0;
  renderersBeingRendered = 0;
  renderersSkippingRenderPass = 0;
  countEntitiesTotal = 0;
  countEntitiesRendered = 0;
  countEntitiesHidden = 0;
  /** Upload budget per frame (milliseconds of bufferData work). */
  uploadBudgetMs = 4;

  constructor(private readonly mc: Minecraft) {
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 2));
    for (let i = 0; i < n; i++) {
      const worker = new Worker(new URL('../workers/mesher.worker.ts', import.meta.url), { type: 'module' });
      const w: MesherWorker = { worker, busy: 0 };
      worker.onmessage = (e: MessageEvent<MesherResponse>) => this.onWorkerMessage(w, e.data);
      worker.onerror = (e) => console.error('[mesher]', e.message);
      this.workers.push(w);
    }
    this.buildSkyLists();
  }

  // ------------------------------------------------------------------ mesher pool

  /** Sends the atlas layout, colormaps and settings to the meshers (after stitching). */
  initMeshers(): void {
    const settings = { aoLevel: this.mc.gameSettings.ambientOcclusion, fancyGraphics: this.mc.gameSettings.fancyGraphics };
    const icons = this.mc.renderEngine.textureMapBlocks.getIconTable();
    for (const w of this.workers) {
      const msg: MesherRequest = { type: 'init', icons, grass: ColorizerGrass.buffer.slice(), foliage: ColorizerFoliage.buffer.slice(), settings };
      w.worker.postMessage(msg);
    }
    this.mesherReady = true;
  }

  /** New atlas layout after a texture pack switch. */
  onTexturesReloaded(): void {
    const icons = this.mc.renderEngine.textureMapBlocks.getIconTable();
    for (const w of this.workers) w.worker.postMessage({ type: 'icons', icons } satisfies MesherRequest);
    this.markAllDirty();
  }

  private onWorkerMessage(w: MesherWorker, m: MesherResponse): void {
    if (m.type !== 'mesh') return;
    w.busy--;
    this.snapshots.push(m.snap);
    this.results.push(m);
    this.dispatch();
  }

  // ------------------------------------------------------------------ world binding

  setWorldAndLoadRenderers(world: World | null): void {
    if (this.theWorld) this.theWorld.removeWorldAccess(this);
    for (const s of this.sections.values()) this.disposeSection(s);
    this.sections.clear();
    this.jobs.clear();
    this.results.length = 0;
    this.queue = [];
    this.theWorld = world;
    if (world) {
      world.addWorldAccess(this);
      for (const c of world.getLoadedChunks()) this.onChunkLoaded(c.xPosition, c.zPosition);
      this.loadRenderers();
    }
  }

  /** Applies render distance / graphics / AO changes: everything is re-meshed. */
  loadRenderers(): void {
    const gs = this.mc.gameSettings;
    this.renderDistance = gs.renderDistance;
    let width = 64 << (3 - gs.renderDistance);
    if (width > 400) width = 400;
    const wide = Math.trunc(width / 16) + 1;
    this.renderRadius = Math.trunc((wide - 1) / 2);
    const settings = { aoLevel: gs.ambientOcclusion, fancyGraphics: gs.fancyGraphics };
    for (const w of this.workers) w.worker.postMessage({ type: 'settings', settings } satisfies MesherRequest);
    this.markAllDirty();
  }

  private markAllDirty(): void {
    for (const s of this.sections.values()) {
      if (s.inFlight) s.stale = true;
      s.needsUpdate = true;
    }
  }

  static sectionKey(sx: number, sy: number, sz: number): number {
    return ((sx + 0x200000) * 0x400000 + (sz + 0x200000)) * 16 + sy;
  }

  onChunkLoaded(cx: number, cz: number): void {
    for (let sy = 0; sy < 16; sy++) {
      const k = RenderGlobal.sectionKey(cx, sy, cz);
      if (!this.sections.has(k)) this.sections.set(k, new WorldRenderer(cx, sy, cz));
    }
  }

  onChunkUnloaded(cx: number, cz: number): void {
    for (let sy = 0; sy < 16; sy++) {
      const k = RenderGlobal.sectionKey(cx, sy, cz);
      const s = this.sections.get(k);
      if (s) {
        this.disposeSection(s);
        this.sections.delete(k);
      }
    }
  }

  private disposeSection(s: WorldRenderer): void {
    for (let p = 0; p < 2; p++) {
      const m = s.meshes[p];
      if (m) GL.deleteTerrain(m);
      s.meshes[p] = null;
    }
  }

  markBlocksForUpdate(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const sx0 = MathHelper.bucketInt(x0, 16);
    const sy0 = Math.max(0, MathHelper.bucketInt(y0, 16));
    const sz0 = MathHelper.bucketInt(z0, 16);
    const sx1 = MathHelper.bucketInt(x1, 16);
    const sy1 = Math.min(15, MathHelper.bucketInt(y1, 16));
    const sz1 = MathHelper.bucketInt(z1, 16);
    for (let sx = sx0; sx <= sx1; sx++)
      for (let sz = sz0; sz <= sz1; sz++)
        for (let sy = sy0; sy <= sy1; sy++) {
          const s = this.sections.get(RenderGlobal.sectionKey(sx, sy, sz));
          if (!s) continue;
          if (s.inFlight) s.stale = true;
          s.needsUpdate = true;
        }
  }

  markBlockForUpdate(x: number, y: number, z: number): void {
    this.markBlocksForUpdate(x - 1, y - 1, z - 1, x + 1, y + 1, z + 1);
  }

  markBlockForRenderUpdate(x: number, y: number, z: number): void {
    this.markBlocksForUpdate(x - 1, y - 1, z - 1, x + 1, y + 1, z + 1);
  }

  markBlockRangeForRenderUpdate(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    this.markBlocksForUpdate(x0 - 1, y0 - 1, z0 - 1, x1 + 1, y1 + 1, z1 + 1);
  }

  // ------------------------------------------------------------------ meshing

  private neighboursLoaded(sx: number, sz: number): boolean {
    const w = this.theWorld!;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (!w.chunkExists(sx + dx, sz + dz)) return false;
    return true;
  }

  private fillSnapshot(snap: SectionSnapshot, s: WorldRenderer): void {
    const w = this.theWorld!;
    const x0 = s.posX - SNAPSHOT_PAD;
    const y0 = s.posY - SNAPSHOT_PAD;
    const z0 = s.posZ - SNAPSHOT_PAD;
    snap.x0 = x0;
    snap.y0 = y0;
    snap.z0 = z0;
    const center = w.getChunkFromChunkCoords(s.sx, s.sz).sections[s.sy];
    snap.empty = !center || center.isEmpty();
    if (snap.empty) return;
    for (let lz = 0; lz < S; lz++) {
      const wz = z0 + lz;
      for (let lx = 0; lx < S; lx++) {
        const wx = x0 + lx;
        const chunk = w.getChunkFromChunkCoords(wx >> 4, wz >> 4);
        snap.biomes[lz * S + lx] = chunk.biomes[((wz & 15) << 4) | (wx & 15)];
        const bx = wx & 15;
        const bz = wz & 15;
        for (let ly = 0; ly < S; ly++) {
          const wy = y0 + ly;
          const i = (ly * S + lz) * S + lx;
          if (wy < 0 || wy >= 256) {
            snap.ids[i] = 0;
            snap.meta[i] = 0;
            snap.sky[i] = 15;
            snap.blk[i] = 0;
            continue;
          }
          const sec = chunk.sections[wy >> 4];
          if (sec) {
            const j = ((wy & 15) << 8) | (bz << 4) | bx;
            snap.ids[i] = sec.blocks[j];
            snap.meta[i] = sec.meta[j];
            snap.sky[i] = sec.skyLight[j];
            snap.blk[i] = sec.blockLight[j];
          } else {
            snap.ids[i] = 0;
            snap.meta[i] = 0;
            snap.sky[i] = chunk.getSavedLightValue(0, bx, wy, bz);
            snap.blk[i] = 0;
          }
        }
      }
    }
  }

  /** Sorted dirty sections waiting for a mesher (rebuilt every frame, drained as workers free up). */
  private queue: WorldRenderer[] = [];

  /** Collects dirty sections near the player (in frustum first, then nearest) and dispatches them. */
  updateRenderers(viewer: EntityLiving): void {
    if (!this.theWorld || !this.mesherReady) return;
    const cx = MathHelper.floor_double(viewer.posX) >> 4;
    const cz = MathHelper.floor_double(viewer.posZ) >> 4;
    const r = this.renderRadius;
    const candidates: WorldRenderer[] = [];
    for (const s of this.sections.values()) {
      if (!s.needsUpdate || s.inFlight) continue;
      if (Math.abs(s.sx - cx) > r || Math.abs(s.sz - cz) > r) continue;
      if (!this.neighboursLoaded(s.sx, s.sz)) continue;
      candidates.push(s);
    }
    const d = (s: WorldRenderer) => s.distanceToEntitySquared(viewer);
    candidates.sort((a, b) => (a.isInFrustum !== b.isInFrustum ? (a.isInFrustum ? -1 : 1) : d(a) - d(b)));
    this.queue = candidates.reverse();
    this.dispatch();
    this.uploadResults();
  }

  private dispatch(): void {
    const w = this.theWorld;
    if (!w) return;
    while (this.queue.length > 0) {
      const worker = this.workers.reduce((a, b) => (b.busy < a.busy ? b : a));
      if (worker.busy >= RenderGlobal.JOBS_PER_WORKER) return;
      const s = this.queue.pop()!;
      if (!s.needsUpdate || s.inFlight || this.sections.get(RenderGlobal.sectionKey(s.sx, s.sy, s.sz)) !== s) continue;
      const center = w.getChunkFromChunkCoords(s.sx, s.sz).sections[s.sy];
      if (!center || center.isEmpty()) {
        this.disposeSection(s);
        s.needsUpdate = false;
        s.hasGeometry = false;
        continue;
      }
      const snap = this.snapshots.pop() ?? allocSnapshot();
      this.fillSnapshot(snap, s);
      const id = this.nextJobId++;
      this.jobs.set(id, s);
      s.inFlight = true;
      s.stale = false;
      s.needsUpdate = false;
      worker.busy++;
      const msg: MesherRequest = { type: 'mesh', id, snap };
      worker.worker.postMessage(msg, [snap.ids.buffer, snap.meta.buffer, snap.sky.buffer, snap.blk.buffer, snap.biomes.buffer]);
    }
  }

  static readonly JOBS_PER_WORKER = 3;

  private uploadResults(): void {
    const t0 = performance.now();
    while (this.results.length > 0) {
      const res = this.results.shift()!;
      const s = this.jobs.get(res.id);
      this.jobs.delete(res.id);
      if (!s || this.sections.get(RenderGlobal.sectionKey(s.sx, s.sy, s.sz)) !== s) continue;
      s.inFlight = false;
      if (s.stale) s.needsUpdate = true;
      for (let p = 0; p < 2; p++) {
        const data = res.passes[p];
        if (data) s.meshes[p] = GL.uploadTerrain(s.meshes[p], data, res.vertexCounts[p]);
        else if (s.meshes[p]) {
          GL.deleteTerrain(s.meshes[p]!);
          s.meshes[p] = null;
        }
      }
      s.hasGeometry = !!(s.meshes[0] || s.meshes[1]);
      WorldRenderer.chunksUpdated++;
      if (performance.now() - t0 > this.uploadBudgetMs) break;
    }
  }

  /** Number of sections still waiting to be meshed near the player (loading screen). */
  pendingNear(viewer: Entity, radius: number): number {
    const cx = MathHelper.floor_double(viewer.posX) >> 4;
    const cz = MathHelper.floor_double(viewer.posZ) >> 4;
    let n = 0;
    for (const s of this.sections.values()) {
      if (Math.abs(s.sx - cx) > radius || Math.abs(s.sz - cz) > radius) continue;
      if (s.needsUpdate || s.inFlight) n++;
    }
    return n + this.results.length;
  }

  clipRenderersByFrustum(fr: Frustum): void {
    for (const s of this.sections.values()) s.updateInFrustum(fr);
  }

  /** Draws one terrain pass; pass 0 front to back, pass 1 back to front. */
  sortAndRender(viewer: EntityLiving, pass: number, pt: number): number {
    if (this.mc.gameSettings.renderDistance !== this.renderDistance) this.loadRenderers();
    const camX = viewer.lastTickPosX + (viewer.posX - viewer.lastTickPosX) * pt;
    const camY = viewer.lastTickPosY + (viewer.posY - viewer.lastTickPosY) * pt;
    const camZ = viewer.lastTickPosZ + (viewer.posZ - viewer.lastTickPosZ) * pt;
    const cx = MathHelper.floor_double(viewer.posX) >> 4;
    const cz = MathHelper.floor_double(viewer.posZ) >> 4;
    const r = this.renderRadius;
    if (pass === 0) {
      this.renderersLoaded = 0;
      this.renderersBeingClipped = 0;
      this.renderersBeingRendered = 0;
      this.renderersSkippingRenderPass = 0;
    }
    const list: WorldRenderer[] = [];
    for (const s of this.sections.values()) {
      if (Math.abs(s.sx - cx) > r || Math.abs(s.sz - cz) > r) continue;
      if (pass === 0) {
        this.renderersLoaded++;
        if (s.skipRenderPass(0)) this.renderersSkippingRenderPass++;
        else if (!s.isInFrustum) this.renderersBeingClipped++;
        else this.renderersBeingRendered++;
      }
      if (s.skipRenderPass(pass) || !s.isInFrustum) continue;
      list.push(s);
    }
    const d = (s: WorldRenderer) => {
      const dx = s.posX + 8 - camX;
      const dy = s.posY + 8 - camY;
      const dz = s.posZ + 8 - camZ;
      return dx * dx + dy * dy + dz * dz;
    };
    list.sort(pass === 0 ? (a, b) => d(a) - d(b) : (a, b) => d(b) - d(a));
    this.mc.entityRenderer.enableLightmap(pt);
    for (const s of list) {
      GL.pushMatrix();
      GL.translate(f(s.posX - camX), f(s.posY - camY), f(s.posZ - camZ));
      GL.drawTerrain(s.meshes[pass]!);
      GL.popMatrix();
    }
    this.mc.entityRenderer.disableLightmap(pt);
    return list.length;
  }

  getDebugInfoRenders(): string {
    return `C: ${this.renderersBeingRendered}/${this.renderersLoaded}. F: ${this.renderersBeingClipped}, O: 0, E: ${this.renderersSkippingRenderPass}`;
  }

  getDebugInfoEntities(): string {
    return `E: ${this.countEntitiesRendered}/${this.countEntitiesTotal}. B: ${this.countEntitiesHidden}, I: ${this.countEntitiesTotal - this.countEntitiesHidden - this.countEntitiesRendered}`;
  }

  // ------------------------------------------------------------------ entities

  renderEntities(camera: { xCoord: number; yCoord: number; zCoord: number }, frustum: Frustum, pt: number): void {
    const w = this.theWorld;
    if (!w) return;
    const viewer = this.mc.renderViewEntity!;
    RenderManager.instance.cacheActiveRenderInfo(w, this.mc.renderEngine, this.mc.fontRenderer, viewer, this.mc.gameSettings, pt);
    this.countEntitiesTotal = 0;
    this.countEntitiesRendered = 0;
    this.countEntitiesHidden = 0;
    RenderManager.renderPosX = viewer.lastTickPosX + (viewer.posX - viewer.lastTickPosX) * pt;
    RenderManager.renderPosY = viewer.lastTickPosY + (viewer.posY - viewer.lastTickPosY) * pt;
    RenderManager.renderPosZ = viewer.lastTickPosZ + (viewer.posZ - viewer.lastTickPosZ) * pt;
    this.mc.entityRenderer.enableLightmap(pt);
    for (const e of w.loadedEntityList) {
      this.countEntitiesTotal++;
      const visible =
        e.isInRangeToRenderVec3D(camera as never) && (e.ignoreFrustumCheck || frustum.isBoundingBoxInFrustum(e.boundingBox));
      const self = e === this.mc.renderViewEntity && this.mc.gameSettings.thirdPersonView === 0;
      if (visible && !self) {
        this.countEntitiesRendered++;
        RenderManager.instance.renderEntity(e, pt);
      }
    }
    this.mc.entityRenderer.disableLightmap(pt);
  }

  // ------------------------------------------------------------------ sky

  private buildSkyLists(): void {
    const t = Tessellator.instance;
    this.starList = GL.genList();
    GL.newList(this.starList);
    this.renderStars();
    GL.endList();
    this.skyList = GL.genList();
    GL.newList(this.skyList);
    const step = 64;
    const n = Math.trunc(256 / step) + 2;
    let h = 16;
    for (let x = -step * n; x <= step * n; x += step) {
      for (let z = -step * n; z <= step * n; z += step) {
        t.startDrawingQuads();
        t.addVertex(x, h, z);
        t.addVertex(x + step, h, z);
        t.addVertex(x + step, h, z + step);
        t.addVertex(x, h, z + step);
        t.draw();
      }
    }
    GL.endList();
    this.skyList2 = GL.genList();
    GL.newList(this.skyList2);
    h = -16;
    t.startDrawingQuads();
    for (let x = -step * n; x <= step * n; x += step) {
      for (let z = -step * n; z <= step * n; z += step) {
        t.addVertex(x + step, h, z);
        t.addVertex(x, h, z);
        t.addVertex(x, h, z + step);
        t.addVertex(x + step, h, z + step);
      }
    }
    t.draw();
    GL.endList();
  }

  private renderStars(): void {
    const rand = new JavaRandom(10842n);
    const t = Tessellator.instance;
    t.startDrawingQuads();
    for (let i = 0; i < 1500; i++) {
      let x = f(rand.nextFloat() * 2 - 1);
      let y = f(rand.nextFloat() * 2 - 1);
      let z = f(rand.nextFloat() * 2 - 1);
      const size = f(f(0.15) + f(rand.nextFloat() * f(0.1)));
      let d = x * x + y * y + z * z;
      if (d < 1 && d > 0.01) {
        d = 1 / Math.sqrt(d);
        x *= d;
        y *= d;
        z *= d;
        const px = x * 100;
        const py = y * 100;
        const pz = z * 100;
        const yaw = Math.atan2(x, z);
        const ys = Math.sin(yaw);
        const yc = Math.cos(yaw);
        const pitch = Math.atan2(Math.sqrt(x * x + z * z), y);
        const ps = Math.sin(pitch);
        const pc = Math.cos(pitch);
        const roll = rand.nextDouble() * Math.PI * 2;
        const rs = Math.sin(roll);
        const rc = Math.cos(roll);
        for (let c = 0; c < 4; c++) {
          const a = ((c & 2) - 1) * size;
          const b = (((c + 1) & 2) - 1) * size;
          const u = a * rc - b * rs;
          const v = b * rc + a * rs;
          const vy = u * ps + 0 * pc;
          const w = 0 * ps - u * pc;
          const vx = w * ys - v * yc;
          const vz = v * ys + w * yc;
          t.addVertex(px + vx, py + vy, pz + vz);
        }
      }
    }
    t.draw();
  }

  renderSky(pt: number): void {
    const w = this.theWorld!;
    const viewer = this.mc.renderViewEntity!;
    GL.disable(GL.TEXTURE_2D);
    const sky = w.getSkyColor(viewer, pt);
    const r = f(sky.xCoord);
    const g = f(sky.yCoord);
    const b = f(sky.zCoord);
    const t = Tessellator.instance;
    GL.depthMask(false);
    GL.enable(GL.FOG);
    GL.color(r, g, b);
    GL.callList(this.skyList!);
    GL.disable(GL.FOG);
    GL.disable(GL.ALPHA_TEST);
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    RenderHelper.disableStandardItemLighting();
    const sunrise = w.provider.calcSunriseSunsetColors(w.getCelestialAngle(pt), pt);
    if (sunrise) {
      GL.disable(GL.TEXTURE_2D);
      GL.pushMatrix();
      GL.rotate(90, 1, 0, 0);
      GL.rotate(MathHelper.sin(w.getCelestialAngleRadians(pt)) < 0 ? 180 : 0, 0, 0, 1);
      GL.rotate(90, 0, 0, 1);
      t.startDrawing(GL.TRIANGLE_FAN);
      t.setColorRGBA_F(sunrise[0], sunrise[1], sunrise[2], sunrise[3]);
      t.addVertex(0, 100, 0);
      const segs = 16;
      t.setColorRGBA_F(sunrise[0], sunrise[1], sunrise[2], 0);
      for (let i = 0; i <= segs; i++) {
        const a = f(f(f(i * f(Math.PI)) * 2) / segs);
        const s = MathHelper.sin(a);
        const c = MathHelper.cos(a);
        t.addVertex(f(s * 120), f(c * 120), f(f(-c * 40) * sunrise[3]));
      }
      t.draw();
      GL.popMatrix();
    }
    GL.enable(GL.TEXTURE_2D);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE);
    GL.pushMatrix();
    const rainFade = f(1 - w.getRainStrength(pt));
    GL.color(1, 1, 1, rainFade);
    GL.rotate(-90, 0, 1, 0);
    GL.rotate(f(w.getCelestialAngle(pt) * 360), 1, 0, 0);
    let size = 30;
    this.mc.renderEngine.bindTexture('/environment/sun.png');
    t.startDrawingQuads();
    t.addVertexWithUV(-size, 100, -size, 0, 0);
    t.addVertexWithUV(size, 100, -size, 1, 0);
    t.addVertexWithUV(size, 100, size, 1, 1);
    t.addVertexWithUV(-size, 100, size, 0, 1);
    t.draw();
    size = 20;
    this.mc.renderEngine.bindTexture('/environment/moon_phases.png');
    const phase = w.getMoonPhase();
    const px = phase % 4;
    const py = Math.trunc(phase / 4) % 2;
    const u0 = (px + 0) / 4;
    const v0 = (py + 0) / 2;
    const u1 = (px + 1) / 4;
    const v1 = (py + 1) / 2;
    t.startDrawingQuads();
    t.addVertexWithUV(-size, -100, size, u1, v1);
    t.addVertexWithUV(size, -100, size, u0, v1);
    t.addVertexWithUV(size, -100, -size, u0, v0);
    t.addVertexWithUV(-size, -100, -size, u1, v0);
    t.draw();
    GL.disable(GL.TEXTURE_2D);
    const stars = f(w.getStarBrightness(pt) * rainFade);
    if (stars > 0) {
      GL.color(stars, stars, stars, stars);
      GL.callList(this.starList!);
    }
    GL.color(1, 1, 1, 1);
    GL.disable(GL.BLEND);
    GL.enable(GL.ALPHA_TEST);
    GL.enable(GL.FOG);
    GL.popMatrix();
    GL.disable(GL.TEXTURE_2D);
    GL.color(0, 0, 0);
    const eyeY = viewer.prevPosY + (viewer.posY - viewer.prevPosY) * pt;
    const horizon = eyeY - (w.provider.terrainType === 'flat' ? 0 : 63);
    if (horizon < 0) {
      GL.pushMatrix();
      GL.translate(0, 12, 0);
      GL.callList(this.skyList2!);
      GL.popMatrix();
      const s = 1;
      const top = -f(horizon + 65);
      const bot = -s;
      t.startDrawingQuads();
      t.setColorRGBA_I(0, 255);
      t.addVertex(-s, top, s);
      t.addVertex(s, top, s);
      t.addVertex(s, bot, s);
      t.addVertex(-s, bot, s);
      t.addVertex(-s, bot, -s);
      t.addVertex(s, bot, -s);
      t.addVertex(s, top, -s);
      t.addVertex(-s, top, -s);
      t.addVertex(s, bot, -s);
      t.addVertex(s, bot, s);
      t.addVertex(s, top, s);
      t.addVertex(s, top, -s);
      t.addVertex(-s, top, -s);
      t.addVertex(-s, top, s);
      t.addVertex(-s, bot, s);
      t.addVertex(-s, bot, -s);
      t.addVertex(-s, bot, -s);
      t.addVertex(-s, bot, s);
      t.addVertex(s, bot, s);
      t.addVertex(s, bot, -s);
      t.draw();
    }
    if (w.provider.isSkyColored()) GL.color(f(f(r * f(0.2)) + f(0.04)), f(f(g * f(0.2)) + f(0.04)), f(f(b * f(0.6)) + f(0.1)));
    else GL.color(r, g, b);
    GL.pushMatrix();
    GL.translate(0, -f(horizon - 16), 0);
    GL.callList(this.skyList2!);
    GL.popMatrix();
    GL.enable(GL.TEXTURE_2D);
    GL.depthMask(true);
  }

  /** Flat cloud layer (the fast-graphics clouds; fancy 3D clouds are not ported yet). */
  renderClouds(pt: number): void {
    const w = this.theWorld!;
    const viewer = this.mc.renderViewEntity!;
    GL.disable(GL.CULL_FACE);
    const eyeY = f(viewer.lastTickPosY + (viewer.posY - viewer.lastTickPosY) * pt);
    const cell = 32;
    const n = Math.trunc(256 / cell);
    const t = Tessellator.instance;
    this.mc.renderEngine.bindTexture('/environment/clouds.png');
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    const c = w.getCloudColour(pt);
    const scale = f(4.8828125e-4);
    const ticks = this.cloudTickCounter + pt;
    let x = viewer.prevPosX + (viewer.posX - viewer.prevPosX) * pt + ticks * f(0.03);
    let z = viewer.prevPosZ + (viewer.posZ - viewer.prevPosZ) * pt;
    x -= MathHelper.floor_double(x / 2048) * 2048;
    z -= MathHelper.floor_double(z / 2048) * 2048;
    const h = f(f(w.provider.getCloudHeight() - eyeY) + f(0.33));
    const ou = f(x * scale);
    const ov = f(z * scale);
    t.startDrawingQuads();
    t.setColorRGBA_F(f(c.xCoord), f(c.yCoord), f(c.zCoord), f(0.8));
    for (let i = -cell * n; i < cell * n; i += cell) {
      for (let k = -cell * n; k < cell * n; k += cell) {
        t.addVertexWithUV(i + 0, h, k + cell, f(i * scale) + ou, f((k + cell) * scale) + ov);
        t.addVertexWithUV(i + cell, h, k + cell, f((i + cell) * scale) + ou, f((k + cell) * scale) + ov);
        t.addVertexWithUV(i + cell, h, k + 0, f((i + cell) * scale) + ou, f(k * scale) + ov);
        t.addVertexWithUV(i + 0, h, k + 0, f(i * scale) + ou, f(k * scale) + ov);
      }
    }
    t.draw();
    GL.color(1, 1, 1, 1);
    GL.disable(GL.BLEND);
    GL.enable(GL.CULL_FACE);
  }

  hasCloudFog(): boolean {
    return false;
  }

  updateClouds(): void {
    this.cloudTickCounter++;
  }

  // ------------------------------------------------------------------ selection

  drawSelectionBox(player: EntityPlayer, mop: MovingObjectPosition, pass: number, _held: ItemStack | null, pt: number): void {
    if (pass !== 0 || mop.typeOfHit !== EnumMovingObjectType.TILE) return;
    const w = this.theWorld!;
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    GL.color(0, 0, 0, f(0.4));
    GL.lineWidth(2);
    GL.disable(GL.TEXTURE_2D);
    GL.depthMask(false);
    const grow = f(0.002);
    const id = w.getBlockId(mop.blockX, mop.blockY, mop.blockZ);
    const block = id > 0 ? Block.blocksList[id] : null;
    if (block) {
      block.setBlockBoundsBasedOnState(w, mop.blockX, mop.blockY, mop.blockZ);
      const x = player.lastTickPosX + (player.posX - player.lastTickPosX) * pt;
      const y = player.lastTickPosY + (player.posY - player.lastTickPosY) * pt;
      const z = player.lastTickPosZ + (player.posZ - player.lastTickPosZ) * pt;
      this.drawOutlinedBoundingBox(block.getSelectedBoundingBoxFromPool(w, mop.blockX, mop.blockY, mop.blockZ).expand(grow, grow, grow).getOffsetBoundingBox(-x, -y, -z));
    }
    GL.depthMask(true);
    GL.enable(GL.TEXTURE_2D);
    GL.disable(GL.BLEND);
  }

  private drawOutlinedBoundingBox(bb: AxisAlignedBB): void {
    const t = Tessellator.instance;
    t.startDrawing(GL.LINE_STRIP);
    t.addVertex(bb.minX, bb.minY, bb.minZ);
    t.addVertex(bb.maxX, bb.minY, bb.minZ);
    t.addVertex(bb.maxX, bb.minY, bb.maxZ);
    t.addVertex(bb.minX, bb.minY, bb.maxZ);
    t.addVertex(bb.minX, bb.minY, bb.minZ);
    t.draw();
    t.startDrawing(GL.LINE_STRIP);
    t.addVertex(bb.minX, bb.maxY, bb.minZ);
    t.addVertex(bb.maxX, bb.maxY, bb.minZ);
    t.addVertex(bb.maxX, bb.maxY, bb.maxZ);
    t.addVertex(bb.minX, bb.maxY, bb.maxZ);
    t.addVertex(bb.minX, bb.maxY, bb.minZ);
    t.draw();
    t.startDrawing(GL.LINES);
    t.addVertex(bb.minX, bb.minY, bb.minZ);
    t.addVertex(bb.minX, bb.maxY, bb.minZ);
    t.addVertex(bb.maxX, bb.minY, bb.minZ);
    t.addVertex(bb.maxX, bb.maxY, bb.minZ);
    t.addVertex(bb.maxX, bb.minY, bb.maxZ);
    t.addVertex(bb.maxX, bb.maxY, bb.maxZ);
    t.addVertex(bb.minX, bb.minY, bb.maxZ);
    t.addVertex(bb.minX, bb.maxY, bb.maxZ);
    t.draw();
  }

  drawBlockBreaking(): void {}

  drawBlockDamageTexture(): void {}

  // ------------------------------------------------------------------ IWorldAccess

  playSound(name: string, x: number, y: number, z: number, volume: number, pitch: number): void {
    const viewer = this.mc.renderViewEntity;
    if (!viewer) return;
    let range = 16;
    if (volume > 1) range *= volume;
    if (viewer.getDistanceSq(x, y, z) < range * range) this.mc.sndManager.playSound(name, x, y, z, volume, pitch);
  }

  spawnParticle(name: string, x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    this.doSpawnParticle(name, x, y, z, vx, vy, vz);
  }

  /** Particle factory by name; types without a port are ignored for now. */
  static readonly particleFactories = new Map<string, (w: World, x: number, y: number, z: number, vx: number, vy: number, vz: number) => EntityFX | null>();

  doSpawnParticle(name: string, x: number, y: number, z: number, vx: number, vy: number, vz: number): EntityFX | null {
    const viewer = this.mc.renderViewEntity;
    const w = this.theWorld;
    if (!viewer || !w) return null;
    let setting = this.mc.gameSettings.particleSetting;
    if (setting === 1 && w.rand.nextInt(3) === 0) setting = 2;
    const dx = viewer.posX - x;
    const dy = viewer.posY - y;
    const dz = viewer.posZ - z;
    if (dx * dx + dy * dy + dz * dz > 16 * 16) return null;
    if (setting > 1) return null;
    let fx: EntityFX | null = null;
    if (name.startsWith('tilecrack_')) {
      const parts = name.split('_');
      const id = parseInt(parts[1], 10);
      const meta = parseInt(parts[2], 10);
      const block = Block.blocksList[id];
      if (block) fx = new EntityDiggingFX(w, x, y, z, vx, vy, vz, block, 0, meta).applyRenderColor(meta);
    } else {
      fx = RenderGlobal.particleFactories.get(name)?.(w, x, y, z, vx, vy, vz) ?? null;
    }
    if (fx) this.mc.effectRenderer.addEffect(fx);
    return fx;
  }

  onEntityCreate(_e: Entity): void {}
  onEntityDestroy(_e: Entity): void {}

  playAuxSFX(_player: EntityPlayer | null, type: number, x: number, y: number, z: number, data: number): void {
    const w = this.theWorld!;
    const rand = w.rand;
    switch (type) {
      case 1000:
        w.playSound(x, y, z, 'random.click', 1, 1, false);
        break;
      case 1001:
        w.playSound(x, y, z, 'random.click', 1, 1.2, false);
        break;
      case 1002:
        w.playSound(x, y, z, 'random.bow', 1, 1.2, false);
        break;
      case 1003:
        w.playSound(x + 0.5, y + 0.5, z + 0.5, Math.random() < 0.5 ? 'random.door_open' : 'random.door_close', 1, rand.nextFloat() * 0.1 + 0.9, false);
        break;
      case 1004:
        w.playSound(x + 0.5, y + 0.5, z + 0.5, 'random.fizz', 0.5, 2.6 + (rand.nextFloat() - rand.nextFloat()) * 0.8, false);
        break;
      case 2000: {
        const dx = (data % 3) - 1;
        const dz = Math.trunc(data / 3) % 3 - 1;
        const cx = x + dx * 0.6 + 0.5;
        const cy = y + 0.5;
        const cz = z + dz * 0.6 + 0.5;
        for (let i = 0; i < 10; i++) {
          const v = rand.nextDouble() * 0.2 + 0.01;
          this.spawnParticle(
            'smoke',
            cx + dx * 0.01 + (rand.nextDouble() - 0.5) * dz * 0.5,
            cy + (rand.nextDouble() - 0.5) * 0.5,
            cz + dz * 0.01 + (rand.nextDouble() - 0.5) * dx * 0.5,
            dx * v + rand.nextGaussian() * 0.01,
            -0.03 + rand.nextGaussian() * 0.01,
            dz * v + rand.nextGaussian() * 0.01,
          );
        }
        break;
      }
      case 2001: {
        const id = data & 4095;
        const block = id > 0 ? Block.blocksList[id] : null;
        if (block) {
          const s = block.stepSound;
          this.mc.sndManager.playSound(s.getBreakSound(), f(x + 0.5), f(y + 0.5), f(z + 0.5), f((s.getVolume() + 1) / 2), f(s.getPitch() * f(0.8)));
        }
        this.mc.effectRenderer.addBlockDestroyEffects(x, y, z, data & 4095, (data >> 12) & 255);
        break;
      }
      case 2004:
        for (let i = 0; i < 20; i++) {
          const px = x + 0.5 + (rand.nextFloat() - 0.5) * 2;
          const py = y + 0.5 + (rand.nextFloat() - 0.5) * 2;
          const pz = z + 0.5 + (rand.nextFloat() - 0.5) * 2;
          w.spawnParticle('smoke', px, py, pz, 0, 0, 0);
          w.spawnParticle('flame', px, py, pz, 0, 0, 0);
        }
        break;
      default:
        break;
    }
  }

  destroyBlockPartially(): void {}
}
