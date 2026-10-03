import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import type { Entity } from '../entity/Entity';
import type { World } from '../world/World';
import { GL } from './gl/GL';
import { Tessellator } from './gl/Tessellator';
import { RenderBlocks } from './RenderBlocks';
import type { Icon, IconRegister } from './texture/Icon';
import type { TextureManager } from './texture/TextureManager';

/** One block being mined (DestroyBlockProgress): who mines it, where, and the crack stage 0..9. */
export class DestroyBlockProgress {
  partialBlockProgress = 0;
  createdAtCloudUpdateTick = 0;

  constructor(
    readonly miningPlayerEntId: number,
    readonly partialBlockX: number,
    readonly partialBlockY: number,
    readonly partialBlockZ: number,
  ) {}

  setPartialBlockDamage(stage: number): void {
    this.partialBlockProgress = stage > 10 ? 10 : stage;
  }
}

/**
 * The crack overlay of blocks being mined (RenderGlobal.damagedBlocks, destroyBlockPartially,
 * drawBlockDamageTexture): each miner's block is redrawn with textures/blocks/destroy_N over
 * every face, multiplied onto the terrain (DST_COLOR, SRC_COLOR at half alpha) with a polygon
 * offset. Entries far from the viewer (32 blocks) or older than 400 cloud ticks are dropped.
 */
export class BlockDamageOverlay {
  static readonly destroyBlockIcons: (Icon | null)[] = new Array(10).fill(null);
  readonly damagedBlocks = new Map<number, DestroyBlockProgress>();
  private renderBlocks: RenderBlocks | null = null;
  private renderWorld: World | null = null;

  /** registerDestroyBlockIcons: called with the block atlas. */
  static registerIcons(reg: IconRegister): void {
    for (let i = 0; i < 10; i++) BlockDamageOverlay.destroyBlockIcons[i] = reg.registerIcon('destroy_' + i);
  }

  /** A stage of 0..9 shows cracks; anything else clears the miner's entry. */
  destroyBlockPartially(entityId: number, x: number, y: number, z: number, stage: number, cloudTickCounter: number): void {
    if (stage < 0 || stage >= 10) {
      this.damagedBlocks.delete(entityId);
      return;
    }
    let p = this.damagedBlocks.get(entityId);
    if (!p || p.partialBlockX !== x || p.partialBlockY !== y || p.partialBlockZ !== z) {
      p = new DestroyBlockProgress(entityId, x, y, z);
      this.damagedBlocks.set(entityId, p);
    }
    p.setPartialBlockDamage(stage);
    p.createdAtCloudUpdateTick = cloudTickCounter;
  }

  /** updateClouds: every 20 ticks, forget cracks nobody refreshed for 400 ticks. */
  onCloudTick(cloudTickCounter: number): void {
    if (cloudTickCounter % 20 !== 0) return;
    for (const [id, p] of this.damagedBlocks) if (cloudTickCounter - p.createdAtCloudUpdateTick > 400) this.damagedBlocks.delete(id);
  }

  clear(): void {
    this.damagedBlocks.clear();
  }

  /** drawBlockDamageTexture: the caller has enabled blending (EntityRenderer.renderWorld). */
  draw(world: World | null, viewer: Entity, pt: number, textures: TextureManager): void {
    if (!world || this.damagedBlocks.size === 0) return;
    if (this.renderWorld !== world || !this.renderBlocks) {
      this.renderBlocks = new RenderBlocks(world);
      this.renderWorld = world;
    }
    const vx = viewer.lastTickPosX + (viewer.posX - viewer.lastTickPosX) * pt;
    const vy = viewer.lastTickPosY + (viewer.posY - viewer.lastTickPosY) * pt;
    const vz = viewer.lastTickPosZ + (viewer.posZ - viewer.lastTickPosZ) * pt;
    GL.blendFunc(GL.DST_COLOR, GL.SRC_COLOR);
    textures.bindTexture('/terrain.png');
    GL.color(1, 1, 1, 0.5);
    GL.pushMatrix();
    GL.disable(GL.ALPHA_TEST);
    GL.polygonOffset(-3, -3);
    GL.enable(GL.POLYGON_OFFSET_FILL);
    GL.enable(GL.ALPHA_TEST);
    const t = Tessellator.instance;
    t.startDrawingQuads();
    t.setTranslation(-vx, -vy, -vz);
    t.disableColor();
    for (const [id, p] of this.damagedBlocks) {
      const dx = p.partialBlockX - vx;
      const dy = p.partialBlockY - vy;
      const dz = p.partialBlockZ - vz;
      if (dx * dx + dy * dy + dz * dz > 1024) {
        this.damagedBlocks.delete(id);
        continue;
      }
      const blockId = world.getBlockId(p.partialBlockX, p.partialBlockY, p.partialBlockZ);
      const block = (blockId > 0 ? Block.blocksList[blockId] : null) ?? Block.blocksList[BlockIds.stone];
      const icon = BlockDamageOverlay.destroyBlockIcons[Math.min(p.partialBlockProgress, 9)];
      if (block && icon) this.renderBlocks.renderBlockUsingTexture(block, p.partialBlockX, p.partialBlockY, p.partialBlockZ, icon);
    }
    t.draw();
    t.setTranslation(0, 0, 0);
    GL.disable(GL.ALPHA_TEST);
    GL.polygonOffset(0, 0);
    GL.disable(GL.POLYGON_OFFSET_FILL);
    GL.enable(GL.ALPHA_TEST);
    GL.depthMask(true);
    GL.popMatrix();
  }
}
