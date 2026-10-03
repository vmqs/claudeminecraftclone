import { Block } from '../block/Block';
import type { BlockLeaves } from '../block/BlockLeaves';
import { Blocks } from '../block/Blocks';
import { FrameBudget } from '../client/FrameBudget';
import type { Minecraft } from '../client/Minecraft';
import { AxisAlignedBB } from '../core/AxisAlignedBB';
import { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import { EnumMovingObjectType, type MovingObjectPosition } from '../core/MovingObjectPosition';
import type { Entity } from '../entity/Entity';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { ItemIds } from '../block/BlockIds';
import { Item } from '../item/Item';
import type { ItemStack } from '../item/ItemStack';
import type { MesherRequest, MesherResponse, MeshResult } from '../workers/mesherProtocol';
import { allocSnapshot, type SectionSnapshot } from '../world/ChunkCache';
import { ColorizerFoliage, ColorizerGrass } from '../world/biome/Colorizer';
import type { IWorldAccess } from '../world/IWorldAccess';
import type { World } from '../world/World';
import type { Frustum } from './Frustum';
import { type DisplayList, GL, type TerrainMesh } from './gl/GL';
import { Tessellator } from './gl/Tessellator';
import type { EntityFX } from './particle/EntityFX';
import { createParticle, type ParticleFactory, particleFactories, unculledParticleFactories } from './particle/ParticleFactories';
import { RenderHelper } from './RenderHelper';
import { fillSectionSnapshot } from './SectionSnapshotFill';
import { BlockDamageOverlay } from './BlockDamageOverlay';
import { RenderManager } from './entity/RenderManager';
import { TileEntityRenderer } from './tileentity/TileEntityRenderer';

const f = Math.fround;

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

/** playAuxSFX sounds at the block centre with pitch 1 +- 0.2: type -> [sound, volume]. */
const AUX_SOUNDS: Record<number, [string, number]> = {
  1007: ['mob.ghast.charge', 10.0],
  1008: ['mob.ghast.fireball', 10.0],
  1009: ['mob.ghast.fireball', 2.0],
  1010: ['mob.zombie.wood', 2.0],
  1011: ['mob.zombie.metal', 2.0],
  1012: ['mob.zombie.woodbreak', 2.0],
  1014: ['mob.wither.shoot', 2.0],
  1015: ['mob.bat.takeoff', 0.05],
  1016: ['mob.zombie.infect', 2.0],
  1017: ['mob.zombie.unfect', 2.0],
};

/** Anvil sounds (pitch 0.9-1.0): type -> [sound, volume]. */
const AUX_ANVIL_SOUNDS: Record<number, [string, number]> = {
  1020: ['random.anvil_break', 1.0],
  1021: ['random.anvil_use', 1.0],
  1022: ['random.anvil_land', 0.3],
};

/** What ItemPotion adds that the splash effect needs. */
interface PotionColours {
  getColorFromDamage(damage: number): number;
  isEffectInstant(damage: number): boolean;
}

/**
 * RenderGlobal: owns the section renderers, schedules meshing on the worker pool, draws
 * terrain passes, the sky, clouds and the block selection box, and turns world events
 * into sounds and particles.
 */
export class RenderGlobal implements IWorldAccess {
  theWorld: World | null = null;
  private readonly sections = new Map<number, WorldRenderer>();
  /** Sections with needsUpdate set (in flight or waiting for a mesher). */
  private readonly dirty = new Set<WorldRenderer>();
  /** Sections with uploaded geometry in either pass. */
  private readonly withGeometry = new Set<WorldRenderer>();
  private viewerX = 0;
  private viewerY = 0;
  private viewerZ = 0;
  private readonly workers: MesherWorker[] = [];
  private readonly snapshots: SectionSnapshot[] = [];
  private readonly jobs = new Map<number, WorldRenderer>();
  private readonly results: MeshResult[] = [];
  private nextJobId = 1;
  private mesherReady = false;
  private renderDistance = -1;
  /** Section radius drawn around the player (renderChunksWide / 2). */
  renderRadius = 8;
  /** Width of the original's render grid (the F3 "C:" total is wide * wide * 16). */
  renderChunksWide = 17;
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
    const settings = { aoLevel: this.mc.gameSettings.ambientOcclusion, fancyGraphics: this.mc.gameSettings.fancyGraphics, anaglyph: this.mc.gameSettings.anaglyph };
    (Blocks.leaves as BlockLeaves).setGraphicsLevel(settings.fancyGraphics);
    const icons = this.mc.renderEngine.textureMapBlocks.getIconTable();
    for (const w of this.workers) {
      const msg: MesherRequest = { type: 'init', icons, grass: ColorizerGrass.buffer.slice(), foliage: ColorizerFoliage.buffer.slice(), settings };
      w.worker.postMessage(msg);
    }
    this.mesherReady = true;
  }

  /** New atlas layout and colormaps after a texture pack switch. */
  onTexturesReloaded(): void {
    const icons = this.mc.renderEngine.textureMapBlocks.getIconTable();
    for (const w of this.workers) {
      w.worker.postMessage({ type: 'icons', icons } satisfies MesherRequest);
      w.worker.postMessage({ type: 'colormaps', grass: ColorizerGrass.buffer.slice(), foliage: ColorizerFoliage.buffer.slice() } satisfies MesherRequest);
    }
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
    this.dirty.clear();
    this.jobs.clear();
    this.results.length = 0;
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
    this.renderChunksWide = wide;
    this.renderRadius = Math.trunc((wide - 1) / 2);
    const settings = { aoLevel: gs.ambientOcclusion, fancyGraphics: gs.fancyGraphics, anaglyph: gs.anaglyph };
    (Blocks.leaves as BlockLeaves).setGraphicsLevel(gs.fancyGraphics);
    for (const w of this.workers) w.worker.postMessage({ type: 'settings', settings } satisfies MesherRequest);
    this.markAllDirty();
  }

  private markAllDirty(): void {
    for (const s of this.sections.values()) this.markDirty(s);
  }

  private markDirty(s: WorldRenderer): void {
    if (s.inFlight) s.stale = true;
    s.needsUpdate = true;
    this.dirty.add(s);
  }

  static sectionKey(sx: number, sy: number, sz: number): number {
    return ((sx + 0x200000) * 0x400000 + (sz + 0x200000)) * 16 + sy;
  }

  onChunkLoaded(cx: number, cz: number): void {
    for (let sy = 0; sy < 16; sy++) {
      const k = RenderGlobal.sectionKey(cx, sy, cz);
      if (this.sections.has(k)) continue;
      const s = new WorldRenderer(cx, sy, cz);
      this.sections.set(k, s);
      this.dirty.add(s);
    }
  }

  onChunkUnloaded(cx: number, cz: number): void {
    for (let sy = 0; sy < 16; sy++) {
      const k = RenderGlobal.sectionKey(cx, sy, cz);
      const s = this.sections.get(k);
      if (s) {
        this.disposeSection(s);
        this.dirty.delete(s);
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
    s.hasGeometry = false;
    this.withGeometry.delete(s);
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
          if (s) this.markDirty(s);
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
    fillSectionSnapshot(this.theWorld!, snap, s.sx, s.sy, s.sz);
  }

  /** Records the viewer position and hands the most urgent dirty sections to the meshers. */
  updateRenderers(viewer: EntityLiving): void {
    if (!this.theWorld || !this.mesherReady) return;
    this.viewerX = viewer.posX;
    this.viewerY = viewer.posY;
    this.viewerZ = viewer.posZ;
    this.dispatch();
    this.uploadResults();
  }

  private sectionDistSq(s: WorldRenderer): number {
    const dx = this.viewerX - (s.posX + 8);
    const dy = this.viewerY - (s.posY + 8);
    const dz = this.viewerZ - (s.posZ + 8);
    return dx * dx + dy * dy + dz * dz;
  }

  /**
   * Fills the free worker slots with the best dirty sections: in the frustum first, then the
   * nearest. A partial selection over the dirty set, so nothing is sorted per frame.
   */
  private dispatch(): void {
    const w = this.theWorld;
    if (!w || !this.mesherReady) return;
    let free = 0;
    for (const wk of this.workers) free += Math.max(0, RenderGlobal.JOBS_PER_WORKER - wk.busy);
    if (free === 0 || this.dirty.size === 0) return;
    const cx = MathHelper.floor_double(this.viewerX) >> 4;
    const cz = MathHelper.floor_double(this.viewerZ) >> 4;
    const r = this.renderRadius;
    const best = this.dispatchBest;
    const keys = this.dispatchKeys;
    best.length = 0;
    keys.length = 0;
    const neighbours = this.dispatchNeighbours;
    neighbours.clear();
    for (const s of this.dirty) {
      if (s.inFlight || Math.abs(s.sx - cx) > r || Math.abs(s.sz - cz) > r) continue;
      // An empty section has nothing to draw whatever its neighbours hold: settle it here
      // instead of spending a mesher slot (most sections of a new chunk are empty).
      const sec = w.getChunkFromChunkCoords(s.sx, s.sz).sections[s.sy];
      if (!sec || sec.isEmpty()) {
        this.dirty.delete(s);
        this.disposeSection(s);
        s.needsUpdate = false;
        continue;
      }
      const key = (s.isInFrustum ? 0 : 1e12) + this.sectionDistSq(s);
      if (best.length === free && key >= keys[free - 1]) continue;
      const ck = s.sx * 65536 + s.sz;
      let ok = neighbours.get(ck);
      if (ok === undefined) neighbours.set(ck, (ok = this.neighboursLoaded(s.sx, s.sz)));
      if (!ok) continue;
      let i = best.length === free ? free - 1 : best.length;
      while (i > 0 && keys[i - 1] > key) {
        best[i] = best[i - 1];
        keys[i] = keys[i - 1];
        i--;
      }
      best[i] = s;
      keys[i] = key;
    }
    for (const s of best) {
      const worker = this.workers.reduce((a, b) => (b.busy < a.busy ? b : a));
      if (worker.busy >= RenderGlobal.JOBS_PER_WORKER) return;
      this.dirty.delete(s);
      const center = w.getChunkFromChunkCoords(s.sx, s.sz).sections[s.sy];
      if (!center || center.isEmpty()) {
        this.disposeSection(s);
        s.needsUpdate = false;
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
  private readonly dispatchBest: WorldRenderer[] = [];
  private readonly dispatchKeys: number[] = [];
  private readonly dispatchNeighbours = new Map<number, boolean>();

  private uploadResults(): void {
    const t0 = performance.now();
    const budget = FrameBudget.ms(this.uploadBudgetMs);
    while (this.results.length > 0) {
      const res = this.results.shift()!;
      const s = this.jobs.get(res.id);
      this.jobs.delete(res.id);
      if (!s || this.sections.get(RenderGlobal.sectionKey(s.sx, s.sy, s.sz)) !== s) continue;
      s.inFlight = false;
      if (s.stale) this.markDirty(s);
      for (let p = 0; p < 2; p++) {
        const data = res.passes[p];
        if (data) s.meshes[p] = GL.uploadTerrain(s.meshes[p], data, res.vertexCounts[p]);
        else if (s.meshes[p]) {
          GL.deleteTerrain(s.meshes[p]!);
          s.meshes[p] = null;
        }
      }
      s.hasGeometry = !!(s.meshes[0] || s.meshes[1]);
      if (s.hasGeometry) this.withGeometry.add(s);
      else this.withGeometry.delete(s);
      WorldRenderer.chunksUpdated++;
      if (performance.now() - t0 > budget) break;
    }
  }

  /** Number of sections still waiting to be meshed near the player (loading screen). */
  pendingNear(viewer: Entity, radius: number): number {
    const cx = MathHelper.floor_double(viewer.posX) >> 4;
    const cz = MathHelper.floor_double(viewer.posZ) >> 4;
    let n = 0;
    const near = (s: WorldRenderer) => Math.abs(s.sx - cx) <= radius && Math.abs(s.sz - cz) <= radius;
    for (const s of this.dirty) if (near(s)) n++;
    // In flight (sent, or the result is waiting for upload) and not dirty again.
    for (const s of this.jobs.values()) if (!s.needsUpdate && near(s)) n++;
    return n;
  }

  clipRenderersByFrustum(fr: Frustum): void {
    for (const s of this.withGeometry) s.updateInFrustum(fr);
    for (const s of this.dirty) s.updateInFrustum(fr);
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
      // The original counts its whole renderChunksWide^2 x 16 grid; sections that are not
      // loaded or have no pass-0 geometry count as skipped ("E").
      this.renderersLoaded = this.renderChunksWide * this.renderChunksWide * 16;
      this.renderersBeingClipped = 0;
      this.renderersBeingRendered = 0;
    }
    const list: WorldRenderer[] = [];
    for (const s of this.withGeometry) {
      if (Math.abs(s.sx - cx) > r || Math.abs(s.sz - cz) > r) continue;
      if (pass === 0 && !s.skipRenderPass(0)) {
        if (!s.isInFrustum) this.renderersBeingClipped++;
        else this.renderersBeingRendered++;
      }
      if (s.skipRenderPass(pass) || !s.isInFrustum) continue;
      list.push(s);
    }
    if (pass === 0) this.renderersSkippingRenderPass = this.renderersLoaded - this.renderersBeingClipped - this.renderersBeingRendered;
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

  /** Entities whose renderer threw (logged once each). */
  private readonly renderFailures = new WeakSet<Entity>();

  /**
   * One entity's renderer; if it throws (an entity from a LAN game in a state its renderer does
   * not expect), the frame goes on with the matrix stack put back, and the error is logged once.
   */
  private renderEntitySafely(e: Entity, pt: number): void {
    const depth = GL.modelview.stackDepth;
    try {
      RenderManager.instance.renderEntity(e, pt);
    } catch (err) {
      GL.modelview.restoreDepth(depth);
      GL.color(1, 1, 1, 1);
      if (!this.renderFailures.has(e)) {
        this.renderFailures.add(e);
        console.error('Rendering entity', e, err);
      }
    }
  }

  renderEntities(camera: { xCoord: number; yCoord: number; zCoord: number }, frustum: Frustum, pt: number): void {
    const w = this.theWorld;
    if (!w) return;
    const viewer = this.mc.renderViewEntity!;
    RenderManager.instance.cacheActiveRenderInfo(w, this.mc.renderEngine, this.mc.fontRenderer, viewer, this.mc.gameSettings, pt);
    this.countEntitiesTotal = 0;
    this.countEntitiesRendered = 0;
    this.countEntitiesHidden = 0;
    TileEntityRenderer.instance.cacheActiveRenderInfo(w, this.mc.renderEngine, this.mc.fontRenderer, viewer, pt);
    RenderManager.renderPosX = viewer.lastTickPosX + (viewer.posX - viewer.lastTickPosX) * pt;
    RenderManager.renderPosY = viewer.lastTickPosY + (viewer.posY - viewer.lastTickPosY) * pt;
    RenderManager.renderPosZ = viewer.lastTickPosZ + (viewer.posZ - viewer.lastTickPosZ) * pt;
    TileEntityRenderer.staticPlayerX = RenderManager.renderPosX;
    TileEntityRenderer.staticPlayerY = RenderManager.renderPosY;
    TileEntityRenderer.staticPlayerZ = RenderManager.renderPosZ;
    this.mc.entityRenderer.enableLightmap(pt);
    this.countEntitiesTotal = w.loadedEntityList.length;
    for (const e of w.weatherEffects) {
      this.countEntitiesRendered++;
      if (e.isInRangeToRenderVec3D(camera as never)) this.renderEntitySafely(e, pt);
    }
    for (const e of w.loadedEntityList) {
      const visible =
        e.isInRangeToRenderVec3D(camera as never) &&
        (e.ignoreFrustumCheck || frustum.isBoundingBoxInFrustum(e.boundingBox) || e.riddenByEntity === this.mc.thePlayer);
      const self = e === this.mc.renderViewEntity && this.mc.gameSettings.thirdPersonView === 0 && !viewer.isPlayerSleeping();
      if (visible && !self && w.blockExists(MathHelper.floor_double(e.posX), 0, MathHelper.floor_double(e.posZ))) {
        this.countEntitiesRendered++;
        this.renderEntitySafely(e, pt);
      }
    }
    // Tile entities with special renderers (chests, signs, spawners...), visible ones only.
    RenderHelper.enableStandardItemLighting();
    const ter = TileEntityRenderer.instance;
    for (const te of w.loadedTileEntityList) {
      if (te.isInvalid() || !ter.hasSpecialRenderer(te)) continue;
      // 1.5.2 draws every tile entity of the built sections; the box test is only a shortcut
      // for the ones drawn within their block, so far-reaching ones (beacon beams) skip it.
      const farReaching = te.getMaxRenderDistanceSquared() > 4096;
      if (!farReaching && !frustum.isBoxInFrustum(te.xCoord - 1, te.yCoord - 1, te.zCoord - 1, te.xCoord + 2, te.yCoord + 2, te.zCoord + 2)) continue;
      ter.renderTileEntity(te, pt);
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
    const rainFade = f(1 - w.clientWeather.getRainStrength(pt));
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

  /** Clouds: 3D boxes with fancy graphics, otherwise the flat layer. */
  renderClouds(pt: number): void {
    const w = this.theWorld!;
    if (!w.provider.isSurfaceWorld()) return;
    if (this.mc.gameSettings.fancyGraphics) {
      this.renderCloudsFancy(pt);
      return;
    }
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

  /**
   * renderCloudsFancy: each clouds.png texel is a 12x4x12 box. Drawn in 8x8-cell tiles around
   * the viewer, first into depth only, then in colour, so inner faces don't double-blend.
   */
  renderCloudsFancy(pt: number): void {
    const w = this.theWorld!;
    const viewer = this.mc.renderViewEntity!;
    GL.disable(GL.CULL_FACE);
    const eyeY = f(viewer.lastTickPosY + (viewer.posY - viewer.lastTickPosY) * pt);
    const t = Tessellator.instance;
    const scale = 12;
    const height = 4;
    const ticks = this.cloudTickCounter + pt;
    let cx = (viewer.prevPosX + (viewer.posX - viewer.prevPosX) * pt + ticks * f(0.03)) / scale;
    let cz = (viewer.prevPosZ + (viewer.posZ - viewer.prevPosZ) * pt) / scale + f(0.33);
    const y = f(f(w.provider.getCloudHeight() - eyeY) + f(0.33));
    cx -= MathHelper.floor_double(cx / 2048) * 2048;
    cz -= MathHelper.floor_double(cz / 2048) * 2048;
    this.mc.renderEngine.bindTexture('/environment/clouds.png');
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    const col = w.getCloudColour(pt);
    const r = f(col.xCoord);
    const g = f(col.yCoord);
    const b = f(col.zCoord);
    const k = f(0.00390625);
    const u0 = f(MathHelper.floor_double(cx) * k);
    const v0 = f(MathHelper.floor_double(cz) * k);
    const fx = f(cx - MathHelper.floor_double(cx));
    const fz = f(cz - MathHelper.floor_double(cz));
    const tile = 8;
    const range = 4;
    const eps = f(9.765625e-4);
    GL.scale(scale, 1, scale);
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 0) GL.colorMask(false, false, false, false);
      else GL.colorMask(true, true, true, true);
      for (let tx = -range + 1; tx <= range; tx++) {
        for (let tz = -range + 1; tz <= range; tz++) {
          t.startDrawingQuads();
          const ox = f(tx * tile);
          const oz = f(tz * tile);
          const x0 = f(ox - fx);
          const z0 = f(oz - fz);
          const U = (c: number) => f(f(f(ox + c) * k) + u0);
          const V = (c: number) => f(f(f(oz + c) * k) + v0);
          if (y > -height - 1) {
            t.setColorRGBA_F(f(r * f(0.7)), f(g * f(0.7)), f(b * f(0.7)), f(0.8));
            t.setNormal(0, -1, 0);
            t.addVertexWithUV(x0, y, z0 + tile, U(0), V(tile));
            t.addVertexWithUV(x0 + tile, y, z0 + tile, U(tile), V(tile));
            t.addVertexWithUV(x0 + tile, y, z0, U(tile), V(0));
            t.addVertexWithUV(x0, y, z0, U(0), V(0));
          }
          if (y <= height + 1) {
            const top = f(f(y + height) - eps);
            t.setColorRGBA_F(r, g, b, f(0.8));
            t.setNormal(0, 1, 0);
            t.addVertexWithUV(x0, top, z0 + tile, U(0), V(tile));
            t.addVertexWithUV(x0 + tile, top, z0 + tile, U(tile), V(tile));
            t.addVertexWithUV(x0 + tile, top, z0, U(tile), V(0));
            t.addVertexWithUV(x0, top, z0, U(0), V(0));
          }
          t.setColorRGBA_F(f(r * f(0.9)), f(g * f(0.9)), f(b * f(0.9)), f(0.8));
          if (tx > -1) {
            t.setNormal(-1, 0, 0);
            for (let i = 0; i < tile; i++) {
              const xi = f(x0 + i);
              const u = U(i + 0.5);
              t.addVertexWithUV(xi, y, z0 + tile, u, V(tile));
              t.addVertexWithUV(xi, y + height, z0 + tile, u, V(tile));
              t.addVertexWithUV(xi, y + height, z0, u, V(0));
              t.addVertexWithUV(xi, y, z0, u, V(0));
            }
          }
          if (tx <= 1) {
            t.setNormal(1, 0, 0);
            for (let i = 0; i < tile; i++) {
              const xi = f(f(f(x0 + i) + 1) - eps);
              const u = U(i + 0.5);
              t.addVertexWithUV(xi, y, z0 + tile, u, V(tile));
              t.addVertexWithUV(xi, y + height, z0 + tile, u, V(tile));
              t.addVertexWithUV(xi, y + height, z0, u, V(0));
              t.addVertexWithUV(xi, y, z0, u, V(0));
            }
          }
          t.setColorRGBA_F(f(r * f(0.8)), f(g * f(0.8)), f(b * f(0.8)), f(0.8));
          if (tz > -1) {
            t.setNormal(0, 0, -1);
            for (let i = 0; i < tile; i++) {
              const zi = f(z0 + i);
              const v = V(i + 0.5);
              t.addVertexWithUV(x0, y + height, zi, U(0), v);
              t.addVertexWithUV(x0 + tile, y + height, zi, U(tile), v);
              t.addVertexWithUV(x0 + tile, y, zi, U(tile), v);
              t.addVertexWithUV(x0, y, zi, U(0), v);
            }
          }
          if (tz <= 1) {
            t.setNormal(0, 0, 1);
            for (let i = 0; i < tile; i++) {
              const zi = f(f(f(z0 + i) + 1) - eps);
              const v = V(i + 0.5);
              t.addVertexWithUV(x0, y + height, zi, U(0), v);
              t.addVertexWithUV(x0 + tile, y + height, zi, U(tile), v);
              t.addVertexWithUV(x0 + tile, y, zi, U(tile), v);
              t.addVertexWithUV(x0, y, zi, U(0), v);
            }
          }
          t.draw();
        }
      }
    }
    GL.color(1, 1, 1, 1);
    GL.disable(GL.BLEND);
    GL.enable(GL.CULL_FACE);
  }

  hasCloudFog(): boolean {
    return false;
  }

  updateClouds(): void {
    this.cloudTickCounter++;
    this.blockDamage.onCloudTick(this.cloudTickCounter);
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

  /** The crack overlay of blocks being mined (BlockDamageOverlay). */
  readonly blockDamage = new BlockDamageOverlay();

  drawBlockDamageTexture(viewer?: Entity, pt = 0): void {
    if (viewer) this.blockDamage.draw(this.theWorld, viewer, pt, this.mc.renderEngine);
  }

  // ------------------------------------------------------------------ IWorldAccess

  /**
   * A world sound (World.playSoundEffect / playSoundAtEntity), which 1.5.2 sends from the
   * integrated server as Packet62LevelSound: the position travels in 1/8 blocks and the pitch
   * in steps of 1/63 (at most 255/63), and only viewers within 16 * max(1, volume) hear it.
   */
  playSound(name: string, x: number, y: number, z: number, volume: number, pitch: number): void {
    const viewer = this.mc.renderViewEntity;
    if (!viewer) return;
    let range = 16;
    if (volume > 1) range *= volume;
    if (viewer.getDistanceSq(x, y, z) >= range * range) return;
    const step = Math.min(255, Math.max(0, Math.trunc(f(pitch * 63))));
    this.mc.sndManager.playSound(name, f(Math.trunc(x * 8) / 8), f(Math.trunc(y * 8) / 8), f(Math.trunc(z * 8) / 8), volume, f(step / 63));
  }

  playSoundWithDistanceDelay(name: string, x: number, y: number, z: number, volume: number, pitch: number, distanceDelay: boolean): void {
    const viewer = this.mc.renderViewEntity;
    if (!viewer) return;
    const range = volume > 1 ? 16 * volume : 16;
    const d2 = viewer.getDistanceSq(x, y, z);
    if (d2 >= range * range) return;
    if (distanceDelay && d2 > 100) this.mc.sndManager.playSoundWithDelay(name, x, y, z, volume, pitch, Math.round((Math.sqrt(d2) / 40) * 20));
    else this.mc.sndManager.playSound(name, x, y, z, volume, pitch);
  }

  spawnParticle(name: string, x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    this.doSpawnParticle(name, x, y, z, vx, vy, vz);
  }

  /**
   * Particle constructors by name (src/render/particle/ParticleRegistry.ts registers every
   * 1.5.2 name); other modules may add their own.
   */
  static readonly particleFactories: Map<string, ParticleFactory> = particleFactories;

  /**
   * The original's doSpawnParticle: "hugeexplosion", "largeexplode" and "fireworksSpark" are
   * always created; everything else is skipped more than 16 blocks from the viewer, with the
   * particle setting at Minimal, and for a random third of the calls at Decreased.
   */
  doSpawnParticle(name: string, x: number, y: number, z: number, vx: number, vy: number, vz: number): EntityFX | null {
    const viewer = this.mc.renderViewEntity;
    const w = this.theWorld;
    if (!viewer || !w || !this.mc.effectRenderer) return null;
    let setting = this.mc.gameSettings.particleSetting;
    if (setting === 1 && w.rand.nextInt(3) === 0) setting = 2;
    const dx = viewer.posX - x;
    const dy = viewer.posY - y;
    const dz = viewer.posZ - z;
    const always = unculledParticleFactories.get(name);
    if (always) {
      const fx = always(w, x, y, z, vx, vy, vz);
      if (fx) this.mc.effectRenderer.addEffect(fx);
      return fx;
    }
    if (dx * dx + dy * dy + dz * dz > 16 * 16) return null;
    if (setting > 1) return null;
    const fx = createParticle(name, w, x, y, z, vx, vy, vz);
    if (fx) this.mc.effectRenderer.addEffect(fx);
    return fx;
  }

  onEntityCreate(_e: Entity): void {}
  onEntityDestroy(_e: Entity): void {}

  /** A jukebox record: the "Now playing" line and the positional music. */
  playRecord(name: string | null, x: number, y: number, z: number): void {
    const item = name === null ? null : Item.itemsList.find((i) => i?.getRecordName() === name);
    if (item) this.mc.ingameGUI.setRecordPlayingMessage(item.getRecordTitle());
    this.mc.sndManager.playStreaming(name, x, y, z);
  }

  /** Wither spawn (1013) and dragon death (1018): played 2 blocks from the viewer towards the source. */
  broadcastSound(type: number, x: number, y: number, z: number, _data: number): void {
    const v = this.mc.renderViewEntity;
    if (!v || (type !== 1013 && type !== 1018)) return;
    const dx = x - v.posX;
    const dy = y - v.posY;
    const dz = z - v.posZ;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    let px = v.posX;
    let py = v.posY;
    let pz = v.posZ;
    if (d > 0.0) {
      px += (dx / d) * 2.0;
      py += (dy / d) * 2.0;
      pz += (dz / d) * 2.0;
    }
    if (type === 1013) this.theWorld!.playSound(px, py, pz, 'mob.wither.spawn', 1.0, 1.0, false);
    else this.theWorld!.playSound(px, py, pz, 'mob.enderdragon.end', 5.0, 1.0, false);
  }

  /** 2002: a splash potion breaking, tinted with the potion colour. */
  private spawnPotionSplash(x: number, y: number, z: number, damage: number): void {
    const w = this.theWorld!;
    const rand = w.rand;
    const crack = 'iconcrack_' + ItemIds.potion;
    for (let i = 0; i < 8; i++) this.spawnParticle(crack, x, y, z, rand.nextGaussian() * 0.15, rand.nextDouble() * 0.2, rand.nextGaussian() * 0.15);
    const potion = Item.itemsList[ItemIds.potion] as (Item & Partial<PotionColours>) | null;
    const color = potion?.getColorFromDamage ? potion.getColorFromDamage(damage) : 0x385dc6;
    const r = f(((color >> 16) & 255) / 255);
    const g = f(((color >> 8) & 255) / 255);
    const b = f((color & 255) / 255);
    const kind = potion?.isEffectInstant?.(damage) ? 'instantSpell' : 'spell';
    for (let i = 0; i < 100; i++) {
      const speed = rand.nextDouble() * 4.0;
      const angle = rand.nextDouble() * Math.PI * 2.0;
      const vx = Math.cos(angle) * speed;
      const vy = 0.01 + rand.nextDouble() * 0.5;
      const vz = Math.sin(angle) * speed;
      const fx = this.doSpawnParticle(kind, x + vx * 0.1, y + 0.3, z + vz * 0.1, vx, vy, vz);
      if (fx) {
        const k = f(f(0.75) + f(rand.nextFloat() * f(0.25)));
        fx.setRBGColorF(f(r * k), f(g * k), f(b * k));
        fx.multiplyVelocity(f(speed));
      }
    }
    w.playSound(x + 0.5, y + 0.5, z + 0.5, 'random.glass', 1.0, f(f(w.rand.nextFloat() * f(0.1)) + f(0.9)), false);
  }

  /** 2005 (ItemDye.func_96603_a): green sparkles where bone meal grew something. */
  private spawnBoneMealParticles(x: number, y: number, z: number, count: number): void {
    const w = this.theWorld!;
    const id = w.getBlockId(x, y, z);
    if (count === 0) count = 15;
    const block = id > 0 && id < Block.blocksList.length ? Block.blocksList[id] : null;
    if (!block) return;
    block.setBlockBoundsBasedOnState(w, x, y, z);
    const rand = Item.itemRand;
    for (let i = 0; i < count; i++) {
      const vx = rand.nextGaussian() * 0.02;
      const vy = rand.nextGaussian() * 0.02;
      const vz = rand.nextGaussian() * 0.02;
      w.spawnParticle('happyVillager', f(x + rand.nextFloat()), y + rand.nextFloat() * block.getBlockBoundsMaxY(), f(z + rand.nextFloat()), vx, vy, vz);
    }
  }

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
      case 1005: {
        const record = Item.itemsList[data]?.getRecordName() ?? null;
        w.playRecord(record, x, y, z);
        break;
      }
      case 1020:
      case 1021:
      case 1022: {
        const anvil = AUX_ANVIL_SOUNDS[type];
        w.playSound(f(x + 0.5), f(y + 0.5), f(z + 0.5), anvil[0], anvil[1], f(f(w.rand.nextFloat() * f(0.1)) + f(0.9)), false);
        break;
      }
      case 2002:
        this.spawnPotionSplash(x, y, z, data);
        break;
      case 2003: {
        const cx = x + 0.5;
        const cz = z + 0.5;
        const crack = 'iconcrack_' + ItemIds.eyeOfEnder;
        for (let i = 0; i < 8; i++) this.spawnParticle(crack, cx, y, cz, rand.nextGaussian() * 0.15, rand.nextDouble() * 0.2, rand.nextGaussian() * 0.15);
        for (let a = 0.0; a < Math.PI * 2; a += Math.PI / 20) {
          this.spawnParticle('portal', cx + Math.cos(a) * 5.0, y - 0.4, cz + Math.sin(a) * 5.0, Math.cos(a) * -5.0, 0.0, Math.sin(a) * -5.0);
          this.spawnParticle('portal', cx + Math.cos(a) * 5.0, y - 0.4, cz + Math.sin(a) * 5.0, Math.cos(a) * -7.0, 0.0, Math.sin(a) * -7.0);
        }
        break;
      }
      case 2005:
        this.spawnBoneMealParticles(x, y, z, data);
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
      default: {
        const sound = AUX_SOUNDS[type];
        if (sound) w.playSound(x + 0.5, y + 0.5, z + 0.5, sound[0], sound[1], f(f(f(rand.nextFloat() - rand.nextFloat()) * f(0.2)) + 1), false);
        break;
      }
    }
  }

  destroyBlockPartially(entityId: number, x: number, y: number, z: number, stage: number): void {
    this.blockDamage.destroyBlockPartially(entityId, x, y, z, stage, this.cloudTickCounter);
  }
}
