import type { EntityLiving } from '../../entity/EntityLiving';
import type { FontRenderer } from '../../gui/FontRenderer';
import type { World } from '../../world/World';
import { TileEntity, type TileEntityConstructor } from '../../world/tileentity/TileEntity';
import { GL } from '../gl/GL';
import { OpenGlHelper } from '../OpenGlHelper';
import type { TextureManager } from '../texture/TextureManager';
import type { TileEntitySpecialRenderer } from './TileEntitySpecialRenderer';

type TileEntityClass = abstract new (...args: never[]) => TileEntity;

/**
 * Tile-entity class -> special renderer (TileEntityRenderer). Register with
 * `TileEntityRenderer.instance.register(TileEntityChest, new TileEntityChestRenderer())`
 * (src/render/tileentity/TileEntityRenderers.ts). RenderGlobal.renderEntities draws every
 * loaded tile entity that has one, after the entities.
 */
export class TileEntityRenderer {
  static readonly instance = new TileEntityRenderer();
  /** Camera position the tile entities are drawn relative to (set by RenderGlobal). */
  static staticPlayerX = 0;
  static staticPlayerY = 0;
  static staticPlayerZ = 0;
  private readonly specialRendererMap = new Map<TileEntityClass, TileEntitySpecialRenderer | null>();
  private fontRenderer: FontRenderer | null = null;
  renderEngine: TextureManager | null = null;
  worldObj: World | null = null;
  entityLivingPlayer: EntityLiving | null = null;
  playerYaw = 0;
  playerPitch = 0;
  playerX = 0;
  playerY = 0;
  playerZ = 0;

  register(cls: TileEntityConstructor, r: TileEntitySpecialRenderer): void {
    r.setTileEntityRenderer(this);
    this.specialRendererMap.set(cls, r);
  }

  /** Renderer for a class, inherited from the closest registered superclass (cached). */
  getSpecialRendererForClass(cls: TileEntityClass): TileEntitySpecialRenderer | null {
    if (this.specialRendererMap.has(cls)) return this.specialRendererMap.get(cls) ?? null;
    if (cls === TileEntity) return null;
    const parent = Object.getPrototypeOf(cls) as TileEntityClass;
    const r = this.getSpecialRendererForClass(parent);
    this.specialRendererMap.set(cls, r);
    return r;
  }

  hasSpecialRenderer(te: TileEntity): boolean {
    return this.getSpecialRendererForEntity(te) !== null;
  }

  getSpecialRendererForEntity(te: TileEntity | null): TileEntitySpecialRenderer | null {
    return te ? this.getSpecialRendererForClass(te.constructor as TileEntityClass) : null;
  }

  cacheActiveRenderInfo(w: World, engine: TextureManager, font: FontRenderer | null, viewer: EntityLiving, pt: number): void {
    if (this.worldObj !== w) this.setWorld(w);
    this.renderEngine = engine;
    this.entityLivingPlayer = viewer;
    this.fontRenderer = font;
    this.playerYaw = viewer.prevRotationYaw + (viewer.rotationYaw - viewer.prevRotationYaw) * pt;
    this.playerPitch = viewer.prevRotationPitch + (viewer.rotationPitch - viewer.prevRotationPitch) * pt;
    this.playerX = viewer.lastTickPosX + (viewer.posX - viewer.lastTickPosX) * pt;
    this.playerY = viewer.lastTickPosY + (viewer.posY - viewer.lastTickPosY) * pt;
    this.playerZ = viewer.lastTickPosZ + (viewer.posZ - viewer.lastTickPosZ) * pt;
  }

  /** Lit by the block's own light, within the tile entity's render distance. */
  renderTileEntity(te: TileEntity, pt: number): void {
    if (te.getDistanceFrom(this.playerX, this.playerY, this.playerZ) >= te.getMaxRenderDistanceSquared()) return;
    const b = this.worldObj!.getLightBrightnessForSkyBlocks(te.xCoord, te.yCoord, te.zCoord, 0);
    OpenGlHelper.setLightmapTextureCoords(OpenGlHelper.lightmapTexUnit, b % 65536, Math.trunc(b / 65536));
    GL.color(1, 1, 1, 1);
    this.renderTileEntityAt(te, te.xCoord - TileEntityRenderer.staticPlayerX, te.yCoord - TileEntityRenderer.staticPlayerY, te.zCoord - TileEntityRenderer.staticPlayerZ, pt);
  }

  renderTileEntityAt(te: TileEntity, x: number, y: number, z: number, pt: number): void {
    this.getSpecialRendererForEntity(te)?.renderTileEntityAt(te, x, y, z, pt);
  }

  setWorld(w: World | null): void {
    this.worldObj = w;
    for (const r of this.specialRendererMap.values()) r?.onWorldChange(w);
  }

  getFontRenderer(): FontRenderer | null {
    return this.fontRenderer;
  }
}
