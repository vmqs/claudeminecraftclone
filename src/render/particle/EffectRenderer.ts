import { Block } from '../../block/Block';
import { JavaRandom } from '../../core/JavaRandom';
import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import type { World } from '../../world/World';
import { ActiveRenderInfo } from '../ActiveRenderInfo';
import { GL } from '../gl/GL';
import { Tessellator } from '../gl/Tessellator';
import type { TextureManager } from '../texture/TextureManager';
import { EntityDiggingFX } from './EntityDiggingFX';
import { EntityFX } from './EntityFX';

const f = Math.fround;

/** Owns and draws particles in four layers (EffectRenderer). */
export class EffectRenderer {
  private readonly fxLayers: EntityFX[][] = [[], [], [], []];
  private readonly rand = new JavaRandom();

  constructor(
    protected worldObj: World | null,
    private readonly renderer: TextureManager,
  ) {}

  addEffect(fx: EntityFX): void {
    const layer = this.fxLayers[fx.getFXLayer()];
    if (layer.length >= 4000) layer.shift();
    layer.push(fx);
  }

  updateEffects(): void {
    for (const layer of this.fxLayers) {
      for (let i = 0; i < layer.length; i++) {
        const fx = layer[i];
        fx.onUpdate();
        if (fx.isDead) layer.splice(i--, 1);
      }
    }
  }

  renderParticles(e: Entity, pt: number): void {
    const rx = ActiveRenderInfo.rotationX;
    const rz = ActiveRenderInfo.rotationZ;
    const ryz = ActiveRenderInfo.rotationYZ;
    const rxy = ActiveRenderInfo.rotationXY;
    const rxz = ActiveRenderInfo.rotationXZ;
    EntityFX.interpPosX = e.lastTickPosX + (e.posX - e.lastTickPosX) * pt;
    EntityFX.interpPosY = e.lastTickPosY + (e.posY - e.lastTickPosY) * pt;
    EntityFX.interpPosZ = e.lastTickPosZ + (e.posZ - e.lastTickPosZ) * pt;
    for (let l = 0; l < 3; l++) {
      const layer = this.fxLayers[l];
      if (layer.length === 0) continue;
      this.renderer.bindTexture(l === 1 ? '/terrain.png' : l === 2 ? '/gui/items.png' : '/particles.png');
      const t = Tessellator.instance;
      GL.color(1, 1, 1, 1);
      GL.depthMask(false);
      GL.enable(GL.BLEND);
      GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
      GL.alphaFunc(GL.GREATER, f(0.003921569));
      t.startDrawingQuads();
      for (const fx of layer) {
        t.setBrightness(fx.getBrightnessForRender(pt));
        fx.renderParticle(t, pt, rx, rxz, rz, ryz, rxy);
      }
      t.draw();
      GL.disable(GL.BLEND);
      GL.depthMask(true);
      GL.alphaFunc(GL.GREATER, 0.1);
    }
  }

  renderLitParticles(e: Entity, pt: number): void {
    const deg = f(Math.PI / 180);
    const c = MathHelper.cos(f(e.rotationYaw * deg));
    const s = MathHelper.sin(f(e.rotationYaw * deg));
    const a = f(-s * MathHelper.sin(f(e.rotationPitch * deg)));
    const b = f(c * MathHelper.sin(f(e.rotationPitch * deg)));
    const cp = MathHelper.cos(f(e.rotationPitch * deg));
    const layer = this.fxLayers[3];
    if (layer.length === 0) return;
    const t = Tessellator.instance;
    for (const fx of layer) {
      t.setBrightness(fx.getBrightnessForRender(pt));
      fx.renderParticle(t, pt, c, cp, s, a, b);
    }
  }

  clearEffects(w: World | null): void {
    this.worldObj = w;
    for (const l of this.fxLayers) l.length = 0;
  }

  /** The 4x4x4 burst of fragments when a block breaks (playAuxSFX 2001). */
  addBlockDestroyEffects(x: number, y: number, z: number, id: number, meta: number): void {
    if (id === 0 || !this.worldObj) return;
    const block = Block.blocksList[id];
    if (!block) return;
    const n = 4;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        for (let k = 0; k < n; k++) {
          const px = x + (i + 0.5) / n;
          const py = y + (j + 0.5) / n;
          const pz = z + (k + 0.5) / n;
          const side = this.rand.nextInt(6);
          this.addEffect(new EntityDiggingFX(this.worldObj, px, py, pz, px - x - 0.5, py - y - 0.5, pz - z - 0.5, block, side, meta).applyColourMultiplier(x, y, z));
        }
  }

  /** Small fragments while mining a face. */
  addBlockHitEffects(x: number, y: number, z: number, side: number): void {
    const w = this.worldObj;
    if (!w) return;
    const id = w.getBlockId(x, y, z);
    const block = Block.blocksList[id];
    if (id === 0 || !block) return;
    const m = f(0.1);
    let px = x + this.rand.nextDouble() * (block.getBlockBoundsMaxX() - block.getBlockBoundsMinX() - m * 2) + m + block.getBlockBoundsMinX();
    let py = y + this.rand.nextDouble() * (block.getBlockBoundsMaxY() - block.getBlockBoundsMinY() - m * 2) + m + block.getBlockBoundsMinY();
    let pz = z + this.rand.nextDouble() * (block.getBlockBoundsMaxZ() - block.getBlockBoundsMinZ() - m * 2) + m + block.getBlockBoundsMinZ();
    if (side === 0) py = y + block.getBlockBoundsMinY() - m;
    if (side === 1) py = y + block.getBlockBoundsMaxY() + m;
    if (side === 2) pz = z + block.getBlockBoundsMinZ() - m;
    if (side === 3) pz = z + block.getBlockBoundsMaxZ() + m;
    if (side === 4) px = x + block.getBlockBoundsMinX() - m;
    if (side === 5) px = x + block.getBlockBoundsMaxX() + m;
    this.addEffect(
      new EntityDiggingFX(w, px, py, pz, 0, 0, 0, block, side, w.getBlockMetadata(x, y, z)).applyColourMultiplier(x, y, z).multiplyVelocity(f(0.2)).multipleParticleScaleBy(f(0.6)),
    );
  }

  getStatistics(): string {
    return '' + (this.fxLayers[0].length + this.fxLayers[1].length + this.fxLayers[2].length);
  }
}
