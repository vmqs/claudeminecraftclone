import { Block } from '../block/Block';
import { Material } from '../block/Material';
import type { Minecraft } from '../client/Minecraft';
import { MouseFilter } from '../client/MouseFilter';
import { MathHelper } from '../core/MathHelper';
import { MovingObjectPosition } from '../core/MovingObjectPosition';
import { Vec3 } from '../core/Vec3';
import type { Entity } from '../entity/Entity';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import { ActiveRenderInfo } from './ActiveRenderInfo';
import { RenderManager } from './entity/RenderManager';
import { Frustum } from './Frustum';
import { GL } from './gl/GL';
import { OpenGlHelper } from './OpenGlHelper';
import { RenderHelper } from './RenderHelper';
import { ItemRenderer } from './ItemRenderer';
import { withClientSkylight } from './sky/ClientWorldView';
import { RenderRainSnow } from './sky/RenderRainSnow';
import { hasPotion, SkyHooks, SkyPotion } from './sky/SkyHooks';

const f = Math.fround;
const PI_F = f(Math.PI);

/**
 * EntityRenderer: camera (FOV, bobbing, hurt shake, third person), the lightmap, fog,
 * mouse picking and the order of a frame (EntityRenderer.renderWorld).
 */
export class EntityRenderer {
  static anaglyphEnable = false;
  farPlaneDistance = 0;
  readonly itemRenderer: ItemRenderer;
  /** Ticks since the renderer was created (rain animation, rain particle seed). */
  rendererUpdateCount = 0;
  private pointedEntity: Entity | null = null;
  private thirdPersonDistance = 4;
  private thirdPersonDistanceTemp = 4;
  private camRoll = 0;
  private prevCamRoll = 0;
  private readonly mouseFilterXAxis = new MouseFilter();
  private readonly mouseFilterYAxis = new MouseFilter();
  private smoothCamYaw = 0;
  private smoothCamPitch = 0;
  private smoothCamFilterX = 0;
  private smoothCamFilterY = 0;
  private smoothCamPartialTicks = 0;
  lightmapTexture: WebGLTexture;
  private readonly lightmapColors = new Uint8Array(256 * 4);
  private fovModifierHand = 0;
  private fovModifierHandPrev = 0;
  private fovMultiplierTemp = 0;
  private cloudFog = false;
  lightmapUpdateNeeded = false;
  torchFlickerX = 0;
  torchFlickerDX = 0;
  torchFlickerY = 0;
  torchFlickerDY = 0;
  fogColorRed = 0;
  fogColorGreen = 0;
  fogColorBlue = 0;
  private fogColor2 = 0;
  private fogColor1 = 0;
  debugViewDirection = 0;
  private prevFrameTime = performance.now();
  readonly frustum = new Frustum();
  private readonly rainSnow: RenderRainSnow;
  /** Boss darkening (field_82831_U and its previous value), faded in while SkyHooks.hasColorModifier is set. */
  private bossColorModifier = 0;
  private bossColorModifierPrev = 0;

  constructor(private readonly mc: Minecraft) {
    this.itemRenderer = new ItemRenderer(mc);
    this.rainSnow = new RenderRainSnow(mc);
    RenderManager.instance.itemRenderer = this.itemRenderer;
    this.lightmapTexture = mc.renderEngine.allocateTexture(16, 16, true);
  }

  updateRenderer(): void {
    this.updateFovModifierHand();
    this.updateTorchFlicker();
    this.fogColor2 = this.fogColor1;
    this.thirdPersonDistanceTemp = this.thirdPersonDistance;
    this.prevCamRoll = this.camRoll;
    if (this.mc.gameSettings.smoothCamera) {
      const s = f(f(this.mc.gameSettings.mouseSensitivity * f(0.6)) + f(0.2));
      const k = f(f(f(s * s) * s) * 8);
      this.smoothCamFilterX = this.mouseFilterXAxis.smooth(this.smoothCamYaw, f(f(0.05) * k));
      this.smoothCamFilterY = this.mouseFilterYAxis.smooth(this.smoothCamPitch, f(f(0.05) * k));
      this.smoothCamPartialTicks = 0;
      this.smoothCamYaw = 0;
      this.smoothCamPitch = 0;
    }
    this.fogColor1 = f(this.fogColor1 + f(f(this.fogBrightnessTarget() - this.fogColor1) * f(0.1)));
    this.rendererUpdateCount++;
    this.itemRenderer.updateEquippedItem();
    this.rainSnow.addRainParticles(this.rendererUpdateCount);
    this.bossColorModifierPrev = this.bossColorModifier;
    if (SkyHooks.hasColorModifier) {
      this.bossColorModifier = f(this.bossColorModifier + f(0.05));
      if (this.bossColorModifier > 1) this.bossColorModifier = 1;
      SkyHooks.hasColorModifier = false;
    } else if (this.bossColorModifier > 0) {
      this.bossColorModifier = f(this.bossColorModifier - f(0.0125));
    }
  }

  /**
   * The fog brightness updateRenderer eases towards: the light at the viewer as the client sees
   * it (always daylight, see withClientSkylight), raised towards 1 for shorter render distances.
   */
  private fogBrightnessTarget(): number {
    const view = this.mc.renderViewEntity!;
    const w = this.mc.theWorld!;
    const light = withClientSkylight(w, () => w.getLightBrightness(MathHelper.floor_double(view.posX), MathHelper.floor_double(view.posY), MathHelper.floor_double(view.posZ)));
    const dist = f((3 - this.mc.gameSettings.renderDistance) / 3);
    return f(f(light * f(1 - dist)) + dist);
  }

  /** Jumps the eased fog brightness to its target (for captures, as the reference harness does). */
  settleFogBrightness(): void {
    if (!this.mc.renderViewEntity || !this.mc.theWorld) return;
    this.fogColor1 = this.fogColor2 = this.fogBrightnessTarget();
  }

  /** Picks the block (reach) or entity (3 blocks, 6 in creative) under the crosshair. */
  getMouseOver(pt: number): void {
    const view = this.mc.renderViewEntity;
    const w = this.mc.theWorld;
    if (!view || !w) return;
    RenderManager.instance.pointedEntity = null;
    let reach = this.mc.playerController.getBlockReachDistance();
    this.mc.objectMouseOver = view.rayTrace(reach, pt);
    let hitDist = reach;
    const eye = view.getPosition(pt);
    if (this.mc.playerController.extendedReach()) {
      reach = 6;
      hitDist = 6;
    } else {
      if (reach > 3) hitDist = 3;
      reach = hitDist;
    }
    if (this.mc.objectMouseOver) hitDist = this.mc.objectMouseOver.hitVec.distanceTo(eye);
    const look = view.getLook(pt);
    const end = eye.addVector(look.xCoord * reach, look.yCoord * reach, look.zCoord * reach);
    this.pointedEntity = null;
    const list = w.getEntitiesWithinAABBExcludingEntity(view, view.boundingBox.addCoord(look.xCoord * reach, look.yCoord * reach, look.zCoord * reach).expand(1, 1, 1));
    let best = hitDist;
    for (const e of list) {
      if (!e.canBeCollidedWith()) continue;
      const border = e.getCollisionBorderSize();
      const box = e.boundingBox.expand(border, border, border);
      const hit = box.calculateIntercept(eye, end);
      if (box.isVecInside(eye)) {
        if (0 < best || best === 0) {
          this.pointedEntity = e;
          best = 0;
        }
      } else if (hit) {
        const d = eye.distanceTo(hit.hitVec);
        if (d < best || best === 0) {
          this.pointedEntity = e;
          best = d;
        }
      }
    }
    if (this.pointedEntity && (best < hitDist || !this.mc.objectMouseOver)) {
      this.mc.objectMouseOver = MovingObjectPosition.forEntity(this.pointedEntity);
      if (this.pointedEntity.isLivingEntity) RenderManager.instance.pointedEntity = this.pointedEntity;
    }
  }

  private updateFovModifierHand(): void {
    const p = this.mc.thePlayer!;
    this.fovMultiplierTemp = p.getFOVMultiplier();
    this.fovModifierHandPrev = this.fovModifierHand;
    this.fovModifierHand = f(this.fovModifierHand + (this.fovMultiplierTemp - this.fovModifierHand) * f(0.5));
    if (this.fovModifierHand > 1.5) this.fovModifierHand = 1.5;
    if (this.fovModifierHand < 0.1) this.fovModifierHand = f(0.1);
  }

  private getFOVModifier(pt: number, useSetting: boolean): number {
    if (this.debugViewDirection > 0) return 90;
    const p = this.mc.renderViewEntity as EntityPlayer;
    let fov = 70;
    if (useSetting) {
      fov = f(fov + f(this.mc.gameSettings.fovSetting * 40));
      fov = f(fov * f(this.fovModifierHandPrev + (this.fovModifierHand - this.fovModifierHandPrev) * pt));
    }
    if (p.getHealth() <= 0) {
      const t = f(p.deathTime + pt);
      fov = f(fov / f(f(f(1 - f(500 / f(t + 500))) * 2) + 1));
    }
    const id = ActiveRenderInfo.getBlockIdAtEntityViewpoint(this.mc.theWorld!, p, pt);
    if (id !== 0 && Block.blocksList[id]?.blockMaterial === Material.water) fov = f(f(fov * 60) / 70);
    return fov;
  }

  private hurtCameraEffect(pt: number): void {
    const e = this.mc.renderViewEntity!;
    let t = f(e.hurtTime - pt);
    if (e.getHealth() <= 0) {
      const d = f(e.deathTime + pt);
      GL.rotate(f(40 - f(8000 / f(d + 200))), 0, 0, 1);
    }
    if (t < 0) return;
    t = f(t / e.maxHurtTime);
    t = MathHelper.sin(f(f(t * t * t * t) * PI_F));
    const yaw = e.attackedAtYaw;
    GL.rotate(-yaw, 0, 1, 0);
    GL.rotate(f(-t * 14), 0, 0, 1);
    GL.rotate(yaw, 0, 1, 0);
  }

  private setupViewBobbing(pt: number): void {
    const p = this.mc.renderViewEntity as EntityPlayer;
    if (!p.isPlayerEntity) return;
    const dw = f(p.distanceWalkedModified - p.prevDistanceWalkedModified);
    const walked = f(-f(p.distanceWalkedModified + f(dw * pt)));
    const bob = f(p.prevCameraYaw + f(f(p.cameraYaw - p.prevCameraYaw) * pt));
    const pitch = f(p.prevCameraPitch + f(f(p.cameraPitch - p.prevCameraPitch) * pt));
    GL.translate(f(f(MathHelper.sin(f(walked * PI_F)) * bob) * 0.5), -Math.abs(f(MathHelper.cos(f(walked * PI_F)) * bob)), 0);
    GL.rotate(f(f(MathHelper.sin(f(walked * PI_F)) * bob) * 3), 0, 0, 1);
    GL.rotate(f(Math.abs(f(MathHelper.cos(f(f(walked * PI_F) - f(0.2))) * bob)) * 5), 1, 0, 0);
    GL.rotate(pitch, 1, 0, 0);
  }

  private orientCamera(pt: number): void {
    const e = this.mc.renderViewEntity!;
    const yOff = f(e.yOffset - f(1.62));
    const x = e.prevPosX + (e.posX - e.prevPosX) * pt;
    const y = e.prevPosY + (e.posY - e.prevPosY) * pt - yOff;
    const z = e.prevPosZ + (e.posZ - e.prevPosZ) * pt;
    GL.rotate(f(this.prevCamRoll + (this.camRoll - this.prevCamRoll) * pt), 0, 0, 1);
    if (this.mc.gameSettings.thirdPersonView > 0) {
      let dist = f(this.thirdPersonDistanceTemp + (this.thirdPersonDistance - this.thirdPersonDistanceTemp) * pt);
      const yaw = e.rotationYaw;
      let pitch = e.rotationPitch;
      if (this.mc.gameSettings.thirdPersonView === 2) pitch = f(pitch + 180);
      const dx = -MathHelper.sin(f(f(yaw / 180) * PI_F)) * MathHelper.cos(f(f(pitch / 180) * PI_F)) * dist;
      const dz = MathHelper.cos(f(f(yaw / 180) * PI_F)) * MathHelper.cos(f(f(pitch / 180) * PI_F)) * dist;
      const dy = -MathHelper.sin(f(f(pitch / 180) * PI_F)) * dist;
      for (let i = 0; i < 8; i++) {
        const ox = f(((i & 1) * 2 - 1) * f(0.1));
        const oy = f((((i >> 1) & 1) * 2 - 1) * f(0.1));
        const oz = f((((i >> 2) & 1) * 2 - 1) * f(0.1));
        const hit = this.mc.theWorld!.rayTraceBlocks(new Vec3(x + ox, y + oy, z + oz), new Vec3(x - dx + ox + oz, y - dy + oy, z - dz + oz));
        if (hit) {
          const d = hit.hitVec.distanceTo(new Vec3(x, y, z));
          if (d < dist) dist = d;
        }
      }
      if (this.mc.gameSettings.thirdPersonView === 2) GL.rotate(180, 0, 1, 0);
      GL.rotate(f(e.rotationPitch - pitch), 1, 0, 0);
      GL.rotate(f(e.rotationYaw - yaw), 0, 1, 0);
      GL.translate(0, 0, f(-dist));
      GL.rotate(f(yaw - e.rotationYaw), 0, 1, 0);
      GL.rotate(f(pitch - e.rotationPitch), 1, 0, 0);
    } else {
      GL.translate(0, 0, f(-0.1));
    }
    GL.rotate(f(e.prevRotationPitch + (e.rotationPitch - e.prevRotationPitch) * pt), 1, 0, 0);
    GL.rotate(f(f(e.prevRotationYaw + (e.rotationYaw - e.prevRotationYaw) * pt) + 180), 0, 1, 0);
    GL.translate(0, yOff, 0);
    this.cloudFog = this.mc.renderGlobal.hasCloudFog();
  }

  private setupCameraTransform(pt: number): void {
    this.farPlaneDistance = 256 >> this.mc.gameSettings.renderDistance;
    GL.matrixMode(GL.PROJECTION);
    GL.loadIdentity();
    GL.perspective(this.getFOVModifier(pt, true), this.mc.displayWidth / this.mc.displayHeight, f(0.05), this.farPlaneDistance * 2);
    GL.matrixMode(GL.MODELVIEW);
    GL.loadIdentity();
    this.hurtCameraEffect(pt);
    if (this.mc.gameSettings.viewBobbing) this.setupViewBobbing(pt);
    const portal = f(this.mc.thePlayer!.prevTimeInPortal + (this.mc.thePlayer!.timeInPortal - this.mc.thePlayer!.prevTimeInPortal) * pt);
    if (portal > 0) {
      const speed = 20;
      let s = f(f(5 / f(f(portal * portal) + 5)) - f(portal * f(0.04)));
      s = f(s * s);
      GL.rotate(f((this.rendererUpdateCount + pt) * speed), 0, 1, 1);
      GL.scale(1 / s, 1, 1);
      GL.rotate(f(-(this.rendererUpdateCount + pt) * speed), 0, 1, 1);
    }
    this.orientCamera(pt);
  }

  private renderHand(pt: number): void {
    if (this.debugViewDirection > 0) return;
    GL.matrixMode(GL.PROJECTION);
    GL.loadIdentity();
    GL.perspective(this.getFOVModifier(pt, false), this.mc.displayWidth / this.mc.displayHeight, f(0.05), this.farPlaneDistance * 2);
    GL.matrixMode(GL.MODELVIEW);
    GL.loadIdentity();
    GL.pushMatrix();
    this.hurtCameraEffect(pt);
    if (this.mc.gameSettings.viewBobbing) this.setupViewBobbing(pt);
    const gs = this.mc.gameSettings;
    if (gs.thirdPersonView === 0 && !this.mc.renderViewEntity!.isPlayerSleeping() && !gs.hideGUI) {
      this.enableLightmap(pt);
      this.itemRenderer.renderItemInFirstPerson(pt);
      this.disableLightmap(pt);
    }
    GL.popMatrix();
    if (gs.thirdPersonView === 0 && !this.mc.renderViewEntity!.isPlayerSleeping()) {
      this.itemRenderer.renderOverlays(pt);
      this.hurtCameraEffect(pt);
    }
    if (gs.viewBobbing) this.setupViewBobbing(pt);
  }

  disableLightmap(_pt: number): void {
    OpenGlHelper.setActiveTexture(OpenGlHelper.lightmapTexUnit);
    GL.disable(GL.TEXTURE_2D);
    OpenGlHelper.setActiveTexture(OpenGlHelper.defaultTexUnit);
  }

  enableLightmap(_pt: number): void {
    OpenGlHelper.setActiveTexture(OpenGlHelper.lightmapTexUnit);
    GL.bindTexture(this.lightmapTexture);
    GL.color(1, 1, 1, 1);
    GL.enable(GL.TEXTURE_2D);
    this.mc.renderEngine.resetBoundTexture();
    OpenGlHelper.setActiveTexture(OpenGlHelper.defaultTexUnit);
  }

  private updateTorchFlicker(): void {
    this.torchFlickerDX = f(this.torchFlickerDX + (Math.random() - Math.random()) * Math.random() * Math.random());
    this.torchFlickerDY = f(this.torchFlickerDY + (Math.random() - Math.random()) * Math.random() * Math.random());
    this.torchFlickerDX = f(this.torchFlickerDX * 0.9);
    this.torchFlickerDY = f(this.torchFlickerDY * 0.9);
    this.torchFlickerX = f(this.torchFlickerX + (this.torchFlickerDX - this.torchFlickerX) * 1);
    this.torchFlickerY = f(this.torchFlickerY + (this.torchFlickerDY - this.torchFlickerY) * 1);
    this.lightmapUpdateNeeded = true;
  }

  /** Night vision brightness: full while more than 10 s remain, then flickering out. */
  private getNightVisionBrightness(e: Entity, pt: number): number {
    const d = SkyHooks.potionDuration(e, SkyPotion.nightVision);
    return d > 200 ? 1 : f(f(0.7) + f(MathHelper.sin(f(f(f(d - pt) * PI_F) * f(0.2))) * f(0.3)));
  }

  /** Boss darkening at partial tick `pt` (0 without a darkening boss). */
  private getBossColorModifier(pt: number): number {
    return f(this.bossColorModifierPrev + f(f(this.bossColorModifier - this.bossColorModifierPrev) * pt));
  }

  /** Rebuilds the 16x16 sky/block light colour table (EntityRenderer.updateLightmap). */
  private updateLightmap(pt: number): void {
    const w = this.mc.theWorld;
    const player = this.mc.thePlayer;
    if (!w || !player) return;
    const boss = this.bossColorModifier > 0 ? this.getBossColorModifier(pt) : 0;
    const nightVision = hasPotion(player, SkyPotion.nightVision) ? this.getNightVisionBrightness(player, pt) : -1;
    const table = w.provider.lightBrightnessTable;
    const sun = w.getSunBrightness(1);
    const gamma = this.mc.gameSettings.gammaSetting;
    for (let i = 0; i < 256; i++) {
      const skyFactor = f(f(sun * f(0.95)) + f(0.05));
      let sky = f(table[Math.trunc(i / 16)] * skyFactor);
      const blk = f(table[i % 16] * f(f(this.torchFlickerX * f(0.1)) + f(1.5)));
      if (w.lastLightningBolt > 0) sky = table[Math.trunc(i / 16)];
      const skyR = f(sky * f(f(sun * f(0.65)) + f(0.35)));
      const skyG = f(sky * f(f(sun * f(0.65)) + f(0.35)));
      const blkG = f(blk * f(f(f(f(blk * f(0.6)) + f(0.4)) * f(0.6)) + f(0.4)));
      const blkB = f(blk * f(f(f(blk * blk) * f(0.6)) + f(0.4)));
      let r = f(skyR + blk);
      let g = f(skyG + blkG);
      let b = f(sky + blkB);
      r = f(f(r * f(0.96)) + f(0.03));
      g = f(f(g * f(0.96)) + f(0.03));
      b = f(f(b * f(0.96)) + f(0.03));
      if (boss > 0) {
        r = f(f(r * f(1 - boss)) + f(f(r * f(0.7)) * boss));
        g = f(f(g * f(1 - boss)) + f(f(g * f(0.6)) * boss));
        b = f(f(b * f(1 - boss)) + f(f(b * f(0.6)) * boss));
      }
      if (nightVision >= 0) {
        let k = f(1 / r);
        if (k > f(1 / g)) k = f(1 / g);
        if (k > f(1 / b)) k = f(1 / b);
        r = f(f(r * f(1 - nightVision)) + f(f(r * k) * nightVision));
        g = f(f(g * f(1 - nightVision)) + f(f(g * k) * nightVision));
        b = f(f(b * f(1 - nightVision)) + f(f(b * k) * nightVision));
      }
      if (r > 1) r = 1;
      if (g > 1) g = 1;
      if (b > 1) b = 1;
      let ir = f(1 - r);
      let ig = f(1 - g);
      let ib = f(1 - b);
      ir = f(1 - f(f(f(ir * ir) * ir) * ir));
      ig = f(1 - f(f(f(ig * ig) * ig) * ig));
      ib = f(1 - f(f(f(ib * ib) * ib) * ib));
      r = f(f(r * f(1 - gamma)) + f(ir * gamma));
      g = f(f(g * f(1 - gamma)) + f(ig * gamma));
      b = f(f(b * f(1 - gamma)) + f(ib * gamma));
      r = f(f(r * f(0.96)) + f(0.03));
      g = f(f(g * f(0.96)) + f(0.03));
      b = f(f(b * f(0.96)) + f(0.03));
      r = Math.min(1, Math.max(0, r));
      g = Math.min(1, Math.max(0, g));
      b = Math.min(1, Math.max(0, b));
      this.lightmapColors[i * 4] = Math.trunc(f(r * 255));
      this.lightmapColors[i * 4 + 1] = Math.trunc(f(g * 255));
      this.lightmapColors[i * 4 + 2] = Math.trunc(f(b * 255));
      this.lightmapColors[i * 4 + 3] = 255;
    }
    this.mc.renderEngine.updateTexture(this.lightmapTexture, this.lightmapColors, 16, 16);
    this.lightmapUpdateNeeded = false;
  }

  /** Called every frame: mouse look, then the world and the GUI. */
  updateCameraAndRender(pt: number): void {
    if (this.lightmapUpdateNeeded) this.updateLightmap(pt);
    const active = this.mc.isDisplayActive();
    if (!active && this.mc.gameSettings.pauseOnLostFocus) {
      if (performance.now() - this.prevFrameTime > 500) this.mc.displayInGameMenu();
    } else {
      this.prevFrameTime = performance.now();
    }
    if (this.mc.inGameHasFocus && active) {
      this.mc.mouseHelper.mouseXYChange();
      const s = f(f(this.mc.gameSettings.mouseSensitivity * f(0.6)) + f(0.2));
      const k = f(f(f(s * s) * s) * 8);
      let dx = f(this.mc.mouseHelper.deltaX * k);
      let dy = f(this.mc.mouseHelper.deltaY * k);
      const invert = this.mc.gameSettings.invertMouse ? -1 : 1;
      if (this.mc.gameSettings.smoothCamera) {
        // The movement is collected here and released by the per-tick filter in updateRenderer.
        this.smoothCamYaw = f(this.smoothCamYaw + dx);
        this.smoothCamPitch = f(this.smoothCamPitch + dy);
        const step = f(pt - this.smoothCamPartialTicks);
        this.smoothCamPartialTicks = pt;
        dx = f(this.smoothCamFilterX * step);
        dy = f(this.smoothCamFilterY * step);
      }
      this.mc.thePlayer!.setAngles(dx, dy * invert);
    }
    if (this.mc.skipRenderWorld) return;
    const sr = this.mc.getScaledResolution();
    const sw = sr.getScaledWidth();
    const sh = sr.getScaledHeight();
    const mx = Math.trunc((this.mc.mouseX * sw) / this.mc.displayWidth);
    const my = sh - Math.trunc((this.mc.mouseY * sh) / this.mc.displayHeight) - 1;
    if (this.mc.theWorld) {
      this.renderWorld(pt);
      if (!this.mc.gameSettings.hideGUI || this.mc.currentScreen) this.mc.ingameGUI.renderGameOverlay(pt, this.mc.currentScreen !== null, mx, my);
    } else {
      GL.viewport(0, 0, this.mc.displayWidth, this.mc.displayHeight);
      GL.matrixMode(GL.PROJECTION);
      GL.loadIdentity();
      GL.matrixMode(GL.MODELVIEW);
      GL.loadIdentity();
      this.setupOverlayRendering();
    }
    if (this.mc.currentScreen) {
      GL.clear(GL.DEPTH_BUFFER_BIT);
      this.mc.currentScreen.drawScreen(mx, my, pt);
    }
  }

  renderWorld(pt: number): void {
    if (this.lightmapUpdateNeeded) this.updateLightmap(pt);
    GL.enable(GL.CULL_FACE);
    GL.enable(GL.DEPTH_TEST);
    if (!this.mc.renderViewEntity) this.mc.renderViewEntity = this.mc.thePlayer;
    this.getMouseOver(pt);
    const view = this.mc.renderViewEntity!;
    const rg = this.mc.renderGlobal;
    const fx = this.mc.effectRenderer;
    const camX = view.lastTickPosX + (view.posX - view.lastTickPosX) * pt;
    const camY = view.lastTickPosY + (view.posY - view.lastTickPosY) * pt;
    const camZ = view.lastTickPosZ + (view.posZ - view.lastTickPosZ) * pt;
    GL.viewport(0, 0, this.mc.displayWidth, this.mc.displayHeight);
    this.updateFogColor(pt);
    GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
    GL.enable(GL.CULL_FACE);
    this.setupCameraTransform(pt);
    ActiveRenderInfo.updateRenderInfo(this.mc.thePlayer!, this.mc.gameSettings.thirdPersonView === 2);
    this.frustum.capture();
    if (this.mc.gameSettings.renderDistance < 2) {
      this.setupFog(-1, pt);
      rg.renderSky(pt);
    }
    GL.enable(GL.FOG);
    this.setupFog(1, pt);
    const frustum = this.frustum;
    frustum.setPosition(camX, camY, camZ);
    rg.clipRenderersByFrustum(frustum);
    rg.updateRenderers(view);
    if (view.posY < 128) this.renderCloudsCheck(pt);
    this.setupFog(0, pt);
    GL.enable(GL.FOG);
    this.mc.renderEngine.bindTexture('/terrain.png');
    RenderHelper.disableStandardItemLighting();
    rg.sortAndRender(view, 0, pt);
    if (this.debugViewDirection === 0) {
      RenderHelper.enableStandardItemLighting();
      rg.renderEntities(view.getPosition(pt), frustum, pt);
      this.enableLightmap(pt);
      fx.renderLitParticles(view, pt);
      RenderHelper.disableStandardItemLighting();
      this.setupFog(0, pt);
      fx.renderParticles(view, pt);
      this.disableLightmap(pt);
      if (this.mc.objectMouseOver && view.isInsideOfMaterial(Material.water) && view.isPlayerEntity && !this.mc.gameSettings.hideGUI) {
        const p = view as unknown as EntityPlayer;
        GL.disable(GL.ALPHA_TEST);
        rg.drawSelectionBox(p, this.mc.objectMouseOver, 0, p.inventory.getCurrentItem(), pt);
        GL.enable(GL.ALPHA_TEST);
      }
    }
    GL.disable(GL.BLEND);
    GL.enable(GL.CULL_FACE);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    GL.depthMask(true);
    this.setupFog(0, pt);
    GL.enable(GL.BLEND);
    GL.disable(GL.CULL_FACE);
    this.mc.renderEngine.bindTexture('/terrain.png');
    if (this.mc.gameSettings.fancyGraphics) {
      // Depth pre-pass, then colour, so overlapping water faces don't double-blend.
      GL.colorMask(false, false, false, false);
      const n = rg.sortAndRender(view, 1, pt);
      GL.colorMask(true, true, true, true);
      if (n > 0) rg.sortAndRender(view, 1, pt);
    } else {
      rg.sortAndRender(view, 1, pt);
    }
    GL.depthMask(true);
    GL.enable(GL.CULL_FACE);
    GL.disable(GL.BLEND);
    if (view.isPlayerEntity && !this.mc.gameSettings.hideGUI && this.mc.objectMouseOver && !view.isInsideOfMaterial(Material.water)) {
      const p = view as unknown as EntityPlayer;
      GL.disable(GL.ALPHA_TEST);
      rg.drawSelectionBox(p, this.mc.objectMouseOver, 0, p.inventory.getCurrentItem(), pt);
      GL.enable(GL.ALPHA_TEST);
    }
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE);
    rg.drawBlockDamageTexture();
    GL.disable(GL.BLEND);
    this.rainSnow.render(pt, this.rendererUpdateCount, () => this.enableLightmap(pt), () => this.disableLightmap(pt));
    GL.disable(GL.FOG);
    if (view.posY >= 128) this.renderCloudsCheck(pt);
    GL.clear(GL.DEPTH_BUFFER_BIT);
    this.renderHand(pt);
  }

  private renderCloudsCheck(pt: number): void {
    if (!this.mc.gameSettings.shouldRenderClouds()) return;
    GL.pushMatrix();
    this.setupFog(0, pt);
    GL.enable(GL.FOG);
    this.mc.renderGlobal.renderClouds(pt);
    GL.disable(GL.FOG);
    this.setupFog(1, pt);
    GL.popMatrix();
  }

  setupOverlayRendering(): void {
    const sr = this.mc.getScaledResolution();
    GL.clear(GL.DEPTH_BUFFER_BIT);
    GL.matrixMode(GL.PROJECTION);
    GL.loadIdentity();
    GL.ortho(0, sr.getScaledWidth_double(), sr.getScaledHeight_double(), 0, 1000, 3000);
    GL.matrixMode(GL.MODELVIEW);
    GL.loadIdentity();
    GL.translate(0, 0, -2000);
  }

  private updateFogColor(pt: number): void {
    const w = this.mc.theWorld!;
    const view = this.mc.renderViewEntity!;
    let distFactor = f(1 / (4 - this.mc.gameSettings.renderDistance));
    distFactor = f(1 - f(Math.pow(distFactor, 0.25)));
    const sky = w.getSkyColor(view, pt);
    const sr = f(sky.xCoord);
    const sg = f(sky.yCoord);
    const sb = f(sky.zCoord);
    const fog = w.getFogColor(pt);
    this.fogColorRed = f(fog.xCoord);
    this.fogColorGreen = f(fog.yCoord);
    this.fogColorBlue = f(fog.zCoord);
    if (this.mc.gameSettings.renderDistance < 2) {
      const dir = MathHelper.sin(w.getCelestialAngleRadians(pt)) > 0 ? new Vec3(-1, 0, 0) : new Vec3(1, 0, 0);
      let d = f(view.getLook(pt).dotProduct(dir));
      if (d < 0) d = 0;
      if (d > 0) {
        const c = w.provider.calcSunriseSunsetColors(w.getCelestialAngle(pt), pt);
        if (c) {
          d = f(d * c[3]);
          this.fogColorRed = f(f(this.fogColorRed * f(1 - d)) + f(c[0] * d));
          this.fogColorGreen = f(f(this.fogColorGreen * f(1 - d)) + f(c[1] * d));
          this.fogColorBlue = f(f(this.fogColorBlue * f(1 - d)) + f(c[2] * d));
        }
      }
    }
    this.fogColorRed = f(this.fogColorRed + f(f(sr - this.fogColorRed) * distFactor));
    this.fogColorGreen = f(this.fogColorGreen + f(f(sg - this.fogColorGreen) * distFactor));
    this.fogColorBlue = f(this.fogColorBlue + f(f(sb - this.fogColorBlue) * distFactor));
    const rain = w.clientWeather.getRainStrength(pt);
    if (rain > 0) {
      const a = f(1 - f(rain * f(0.5)));
      const b = f(1 - f(rain * f(0.4)));
      this.fogColorRed = f(this.fogColorRed * a);
      this.fogColorGreen = f(this.fogColorGreen * a);
      this.fogColorBlue = f(this.fogColorBlue * b);
    }
    const thunder = w.clientWeather.getWeightedThunderStrength(pt);
    if (thunder > 0) {
      const a = f(1 - f(thunder * f(0.5)));
      this.fogColorRed = f(this.fogColorRed * a);
      this.fogColorGreen = f(this.fogColorGreen * a);
      this.fogColorBlue = f(this.fogColorBlue * a);
    }
    const id = ActiveRenderInfo.getBlockIdAtEntityViewpoint(w, view, pt);
    const mat = id !== 0 ? Block.blocksList[id]?.blockMaterial : null;
    if (this.cloudFog) {
      const c = w.getCloudColour(pt);
      this.fogColorRed = f(c.xCoord);
      this.fogColorGreen = f(c.yCoord);
      this.fogColorBlue = f(c.zCoord);
    } else if (mat === Material.water) {
      this.fogColorRed = f(0.02);
      this.fogColorGreen = f(0.02);
      this.fogColorBlue = f(0.2);
    } else if (mat === Material.lava) {
      this.fogColorRed = f(0.6);
      this.fogColorGreen = f(0.1);
      this.fogColorBlue = 0;
    }
    const bright = f(this.fogColor2 + f(f(this.fogColor1 - this.fogColor2) * pt));
    this.fogColorRed = f(this.fogColorRed * bright);
    this.fogColorGreen = f(this.fogColorGreen * bright);
    this.fogColorBlue = f(this.fogColorBlue * bright);
    let voidFog = (view.lastTickPosY + (view.posY - view.lastTickPosY) * pt) * w.provider.getVoidFogYFactor();
    const blind = SkyHooks.potionDuration(view, SkyPotion.blindness);
    if (blind >= 0) voidFog = blind < 20 ? voidFog * f(1 - f(blind / 20)) : 0;
    if (voidFog < 1) {
      if (voidFog < 0) voidFog = 0;
      voidFog *= voidFog;
      this.fogColorRed = f(this.fogColorRed * voidFog);
      this.fogColorGreen = f(this.fogColorGreen * voidFog);
      this.fogColorBlue = f(this.fogColorBlue * voidFog);
    }
    if (this.bossColorModifier > 0) {
      const boss = this.getBossColorModifier(pt);
      this.fogColorRed = f(f(this.fogColorRed * f(1 - boss)) + f(f(this.fogColorRed * f(0.7)) * boss));
      this.fogColorGreen = f(f(this.fogColorGreen * f(1 - boss)) + f(f(this.fogColorGreen * f(0.6)) * boss));
      this.fogColorBlue = f(f(this.fogColorBlue * f(1 - boss)) + f(f(this.fogColorBlue * f(0.6)) * boss));
    }
    if (hasPotion(view, SkyPotion.nightVision)) {
      const nv = this.getNightVisionBrightness(this.mc.thePlayer!, pt);
      let k = f(1 / this.fogColorRed);
      if (k > f(1 / this.fogColorGreen)) k = f(1 / this.fogColorGreen);
      if (k > f(1 / this.fogColorBlue)) k = f(1 / this.fogColorBlue);
      this.fogColorRed = f(f(this.fogColorRed * f(1 - nv)) + f(f(this.fogColorRed * k) * nv));
      this.fogColorGreen = f(f(this.fogColorGreen * f(1 - nv)) + f(f(this.fogColorGreen * k) * nv));
      this.fogColorBlue = f(f(this.fogColorBlue * f(1 - nv)) + f(f(this.fogColorBlue * k) * nv));
    }
    GL.clearColor(this.fogColorRed, this.fogColorGreen, this.fogColorBlue, 0);
  }

  /** Fog for the sky (mode < 0) or the world (mode >= 0), water/lava fog and void fog. */
  setupFog(mode: number, pt: number): void {
    const view = this.mc.renderViewEntity!;
    const creative = view.isPlayerEntity && (view as unknown as EntityPlayer).capabilities.isCreativeMode;
    GL.setFogColor(this.fogColorRed, this.fogColorGreen, this.fogColorBlue);
    GL.normal(0, -1, 0);
    GL.color(1, 1, 1, 1);
    const id = ActiveRenderInfo.getBlockIdAtEntityViewpoint(this.mc.theWorld!, view, pt);
    const mat = id > 0 ? Block.blocksList[id]?.blockMaterial : null;
    const blind = SkyHooks.potionDuration(view, SkyPotion.blindness);
    if (blind >= 0) {
      let d = 5;
      if (blind < 20) d = f(5 + f(f(this.farPlaneDistance - 5) * f(1 - f(blind / 20))));
      GL.fogi(GL.LINEAR);
      if (mode < 0) {
        GL.setFogStart(0);
        GL.setFogEnd(f(d * f(0.8)));
      } else {
        GL.setFogStart(f(d * f(0.25)));
        GL.setFogEnd(d);
      }
    } else if (this.cloudFog) {
      GL.fogi(GL.EXP);
      GL.setFogDensity(f(0.1));
    } else if (mat === Material.water) {
      GL.fogi(GL.EXP);
      GL.setFogDensity(hasPotion(view, SkyPotion.waterBreathing) ? f(0.05) : f(0.1));
    } else if (mat === Material.lava) {
      GL.fogi(GL.EXP);
      GL.setFogDensity(2);
    } else {
      let far = this.farPlaneDistance;
      if (this.mc.theWorld!.provider.getWorldHasVoidParticles() && !creative) {
        let v = ((view.getBrightnessForRender(pt) & 0xf00000) >> 20) / 16 + (view.lastTickPosY + (view.posY - view.lastTickPosY) * pt + 4) / 32;
        if (v < 1) {
          if (v < 0) v = 0;
          v *= v;
          let d = f(100 * v);
          if (d < 5) d = 5;
          if (far > d) far = d;
        }
      }
      GL.fogi(GL.LINEAR);
      if (mode < 0) {
        GL.setFogStart(0);
        GL.setFogEnd(f(far * f(0.8)));
      } else {
        GL.setFogStart(f(far * f(0.25)));
        GL.setFogEnd(far);
      }
    }
  }

  getLivingFromView(): EntityLiving | null {
    return this.mc.renderViewEntity;
  }
}
