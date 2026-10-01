import type { FontRenderer } from '../../gui/FontRenderer';
import type { GameSettings } from '../../client/GameSettings';
import type { Entity } from '../../entity/Entity';
import type { EntityLiving } from '../../entity/EntityLiving';
import type { World } from '../../world/World';
import { GL } from '../gl/GL';
import { OpenGlHelper } from '../OpenGlHelper';
import type { TextureManager } from '../texture/TextureManager';
import type { Render } from './Render';

type EntityClass = abstract new (...args: never[]) => Entity;

/**
 * Maps entity classes to renderers and draws entities relative to the camera
 * (RenderManager). Entity renderers register with `register(EntityClass, render)`.
 */
export class RenderManager {
  static readonly instance = new RenderManager();
  static renderPosX = 0;
  static renderPosY = 0;
  static renderPosZ = 0;
  private readonly entityRenderMap = new Map<EntityClass, Render>();
  worldObj: World | null = null;
  renderEngine: TextureManager | null = null;
  fontRenderer: FontRenderer | null = null;
  livingPlayer: EntityLiving | null = null;
  options: GameSettings | null = null;
  playerViewY = 0;
  playerViewX = 0;
  viewerPosX = 0;
  viewerPosY = 0;
  viewerPosZ = 0;

  register(cls: EntityClass, r: Render): void {
    r.setRenderManager(this);
    this.entityRenderMap.set(cls, r);
  }

  /** Renderer for an entity, walking up its class chain. */
  getEntityRenderObject(e: Entity): Render | null {
    let proto = Object.getPrototypeOf(e) as { constructor: EntityClass } | null;
    while (proto && proto.constructor) {
      const r = this.entityRenderMap.get(proto.constructor);
      if (r) return r;
      proto = Object.getPrototypeOf(proto);
    }
    return null;
  }

  cacheActiveRenderInfo(w: World, engine: TextureManager, font: FontRenderer | null, viewer: EntityLiving, options: GameSettings, pt: number): void {
    this.worldObj = w;
    this.renderEngine = engine;
    this.fontRenderer = font;
    this.livingPlayer = viewer;
    this.options = options;
    this.playerViewY = viewer.prevRotationYaw + (viewer.rotationYaw - viewer.prevRotationYaw) * pt;
    this.playerViewX = viewer.prevRotationPitch + (viewer.rotationPitch - viewer.prevRotationPitch) * pt;
    if (options.thirdPersonView === 2) this.playerViewY += 180;
    this.viewerPosX = viewer.lastTickPosX + (viewer.posX - viewer.lastTickPosX) * pt;
    this.viewerPosY = viewer.lastTickPosY + (viewer.posY - viewer.lastTickPosY) * pt;
    this.viewerPosZ = viewer.lastTickPosZ + (viewer.posZ - viewer.lastTickPosZ) * pt;
  }

  renderEntity(e: Entity, pt: number): void {
    const x = e.lastTickPosX + (e.posX - e.lastTickPosX) * pt;
    const y = e.lastTickPosY + (e.posY - e.lastTickPosY) * pt;
    const z = e.lastTickPosZ + (e.posZ - e.lastTickPosZ) * pt;
    const yaw = e.prevRotationYaw + (e.rotationYaw - e.prevRotationYaw) * pt;
    const b = e.getBrightnessForRender(pt);
    OpenGlHelper.setLightmapTextureCoords(OpenGlHelper.lightmapTexUnit, b % 65536, Math.trunc(b / 65536));
    GL.color(1, 1, 1, 1);
    this.renderEntityWithPosYaw(e, x - RenderManager.renderPosX, y - RenderManager.renderPosY, z - RenderManager.renderPosZ, yaw, pt);
  }

  renderEntityWithPosYaw(e: Entity, x: number, y: number, z: number, yaw: number, pt: number): void {
    const r = this.getEntityRenderObject(e);
    if (!r || !this.renderEngine) return;
    r.doRender(e, x, y, z, yaw, pt);
    r.doRenderShadowAndFire(e, x, y, z, yaw, pt);
  }

  getDistanceToCamera(x: number, y: number, z: number): number {
    const dx = x - this.viewerPosX;
    const dy = y - this.viewerPosY;
    const dz = z - this.viewerPosZ;
    return dx * dx + dy * dy + dz * dz;
  }
}
