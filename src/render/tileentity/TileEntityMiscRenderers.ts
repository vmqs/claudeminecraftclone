import { Block } from '../../block/Block';
import { BlockIds } from '../../block/BlockIds';
import type { BlockPistonBase } from '../../block/BlockPistonBase';
import type { BlockPistonExtension } from '../../block/BlockPistonExtension';
import { JavaRandom } from '../../core/JavaRandom';
import { MathHelper } from '../../core/MathHelper';
import type { World } from '../../world/World';
import type { TileEntity } from '../../world/tileentity/TileEntity';
import type { TileEntityBeacon } from '../../world/tileentity/TileEntityBeacon';
import type { TileEntityEnchantmentTable } from '../../world/tileentity/TileEntityEnchantmentTable';
import type { MobSpawnerBaseLogic, TileEntityMobSpawner } from '../../world/tileentity/TileEntityMobSpawner';
import type { TileEntityPiston } from '../../world/tileentity/TileEntityPiston';
import type { TileEntitySkull } from '../../world/tileentity/TileEntitySkull';
import { ActiveRenderInfo } from '../ActiveRenderInfo';
import { RenderManager } from '../entity/RenderManager';
import { ModelSkeletonHead } from '../entity/ModelSkeletonHead';
import { GL } from '../gl/GL';
import { MatrixStack } from '../gl/MatrixStack';
import { Tessellator } from '../gl/Tessellator';
import { RenderBlocks } from '../RenderBlocks';
import { RenderHelper } from '../RenderHelper';
import { ModelBook } from './TileEntityModels';
import { TileEntitySpecialRenderer } from './TileEntitySpecialRenderer';

const f = Math.fround;
const PI_F = f(Math.PI);

// ------------------------------------------------------------------ mob spawner

/**
 * TileEntityMobSpawnerRenderer: the spawner's mob, shrunk to 7/16, tilted and spinning in
 * the cage. The entity is positioned at the camera-relative coordinates like the original.
 */
export class TileEntityMobSpawnerRenderer extends TileEntitySpecialRenderer {
  renderTileEntityAt(te: TileEntity, x: number, y: number, z: number, pt: number): void {
    GL.pushMatrix();
    GL.translate(f(f(x) + 0.5), f(y), f(f(z) + 0.5));
    TileEntityMobSpawnerRenderer.renderSpawnerMob((te as TileEntityMobSpawner).getSpawnerLogic(), x, y, z, pt);
    GL.popMatrix();
  }

  /** func_98144_a: shared with the spawner minecart. */
  static renderSpawnerMob(logic: MobSpawnerBaseLogic, x: number, y: number, z: number, pt: number): void {
    const world = logic.getSpawnerWorld() as World | null;
    if (!world) return;
    const mob = logic.getEntityForRenderer(world);
    if (!mob) return;
    mob.setWorld(world);
    const s = f(0.4375);
    GL.translate(0, f(0.4), 0);
    GL.rotate(f(f(logic.prevSpin + (logic.spin - logic.prevSpin) * pt) * 10), 0, 1, 0);
    GL.rotate(-30, 1, 0, 0);
    GL.translate(0, f(-0.4), 0);
    GL.scale(s, s, s);
    mob.setLocationAndAngles(x, y, z, 0, 0);
    RenderManager.instance.renderEntityWithPosYaw(mob, 0, 0, 0, 0, pt);
  }
}

// ------------------------------------------------------------------ skulls

/** Texture and model per skull type: skeleton, wither skeleton, zombie, player (Steve), creeper. */
const SKULL_TEXTURES = ['/mob/skeleton.png', '/mob/skeleton_wither.png', '/mob/zombie.png', '/mob/char.png', '/mob/creeper.png'];

/**
 * TileEntitySkullRenderer: an 8x8x8 head on the floor (turned in 16ths) or on a wall. Also
 * draws skulls worn as helmets. Player heads use the default skin: there is no skin server.
 */
export class TileEntitySkullRenderer extends TileEntitySpecialRenderer {
  static skullRenderer: TileEntitySkullRenderer | null = null;
  private readonly model32 = new ModelSkeletonHead(0, 0, 64, 32);
  private readonly model64 = new ModelSkeletonHead(0, 0, 64, 64);

  override setTileEntityRenderer(r: Parameters<TileEntitySpecialRenderer['setTileEntityRenderer']>[0]): void {
    super.setTileEntityRenderer(r);
    TileEntitySkullRenderer.skullRenderer = this;
  }

  renderTileEntityAt(te: TileEntity, x: number, y: number, z: number, _pt: number): void {
    const skull = te as TileEntitySkull;
    this.renderSkull(f(x), f(y), f(z), skull.getBlockMetadata() & 7, f((skull.getSkullRotation() * 360) / 16), skull.getSkullType(), skull.getExtraType());
  }

  /** func_82393_a: `placement` 1 is the floor, 2-5 the wall the skull hangs on. */
  renderSkull(x: number, y: number, z: number, placement: number, rotation: number, type: number, _owner: string): void {
    const model = type === 2 ? this.model64 : this.model32;
    this.bindTextureByName(SKULL_TEXTURES[type] ?? SKULL_TEXTURES[0]);
    GL.pushMatrix();
    GL.disable(GL.CULL_FACE);
    if (placement !== 1) {
      switch (placement) {
        case 2:
          GL.translate(f(x + 0.5), f(y + 0.25), f(x === x ? z + f(0.74) : z));
          break;
        case 3:
          GL.translate(f(x + 0.5), f(y + 0.25), f(z + f(0.26)));
          rotation = 180;
          break;
        case 4:
          GL.translate(f(x + f(0.74)), f(y + 0.25), f(z + 0.5));
          rotation = 270;
          break;
        default:
          GL.translate(f(x + f(0.26)), f(y + 0.25), f(z + 0.5));
          rotation = 90;
          break;
      }
    } else {
      GL.translate(f(x + 0.5), y, f(z + 0.5));
    }
    GL.enable(GL.RESCALE_NORMAL);
    GL.scale(-1, -1, 1);
    GL.enable(GL.ALPHA_TEST);
    model.render(null, 0, 0, 0, rotation, 0, f(0.0625));
    GL.popMatrix();
  }
}

// ------------------------------------------------------------------ moving pistons

/**
 * TileEntityRendererPiston: the block a piston is pushing (or the head and base while it
 * retracts), drawn from the terrain atlas at its interpolated offset with every face.
 */
export class TileEntityRendererPiston extends TileEntitySpecialRenderer {
  private blockRenderer: RenderBlocks | null = null;

  override onWorldChange(w: World | null): void {
    this.blockRenderer = new RenderBlocks(w);
  }

  renderTileEntityAt(te: TileEntity, x: number, y: number, z: number, pt: number): void {
    const piston = te as TileEntityPiston;
    const block = Block.blocksList[piston.getStoredBlockID()];
    const rb = this.blockRenderer;
    if (!block || !rb || piston.getProgress(pt) >= 1) return;
    const t = Tessellator.instance;
    this.bindTextureByName('/terrain.png');
    RenderHelper.disableStandardItemLighting();
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    GL.enable(GL.BLEND);
    GL.disable(GL.CULL_FACE);
    GL.shadeModel(RenderBlocks.aoLevel !== 0 ? GL.SMOOTH : GL.FLAT);
    const px = piston.xCoord;
    const py = piston.yCoord;
    const pz = piston.zCoord;
    t.startDrawingQuads();
    t.setTranslation(f(f(f(x) - px) + piston.getOffsetX(pt)), f(f(f(y) - py) + piston.getOffsetY(pt)), f(f(f(z) - pz) + piston.getOffsetZ(pt)));
    t.setColorOpaque(1, 1, 1);
    const head = Block.blocksList[BlockIds.pistonExtension] as BlockPistonExtension;
    if (block === head && piston.getProgress(pt) < 0.5) {
      rb.renderPistonExtensionAllFaces(block, px, py, pz, false);
    } else if (piston.shouldRenderHead() && !piston.isExtending()) {
      head.setHeadTexture((block as BlockPistonBase).getPistonExtensionTexture());
      rb.renderPistonExtensionAllFaces(head, px, py, pz, piston.getProgress(pt) < 0.5);
      head.clearHeadTexture();
      t.setTranslation(f(f(x) - px), f(f(y) - py), f(f(z) - pz));
      rb.renderPistonBaseAllFaces(block, px, py, pz);
    } else {
      rb.renderBlockAllFaces(block, px, py, pz);
    }
    t.setTranslation(0, 0, 0);
    t.draw();
    RenderHelper.enableStandardItemLighting();
  }
}

// ------------------------------------------------------------------ enchanting table book

/** RenderEnchantmentTable: the book hovering over the table, bobbing, turning to the player and flipping pages. */
export class RenderEnchantmentTable extends TileEntitySpecialRenderer {
  private readonly book = new ModelBook();

  renderTileEntityAt(te: TileEntity, x: number, y: number, z: number, pt: number): void {
    const table = te as TileEntityEnchantmentTable;
    GL.pushMatrix();
    GL.translate(f(f(x) + 0.5), f(f(y) + 0.75), f(f(z) + 0.5));
    const age = f(table.tickCount + pt);
    GL.translate(0, f(f(0.1) + f(MathHelper.sin(f(age * f(0.1))) * f(0.01))), 0);
    let turn = f(table.bookRotation2 - table.bookRotationPrev);
    while (turn >= PI_F) turn = f(turn - f(Math.PI * 2));
    while (turn < -PI_F) turn = f(turn + f(Math.PI * 2));
    const yaw = f(table.bookRotationPrev + f(turn * pt));
    GL.rotate(f(f(-yaw * 180) / PI_F), 0, 1, 0);
    GL.rotate(80, 0, 0, 1);
    this.bindTextureByName('/item/book.png');
    const flip = f(table.pageFlipPrev + f((table.pageFlip - table.pageFlipPrev) * pt));
    const page = (offset: number): number => {
      let p = f(flip + offset);
      p = f(f(f(p - Math.trunc(p)) * f(1.6)) - f(0.3));
      return p < 0 ? 0 : p > 1 ? 1 : p;
    };
    const right = page(0.25);
    const left = page(0.75);
    const spread = f(table.bookSpreadPrev + f((table.bookSpread - table.bookSpreadPrev) * pt));
    GL.enable(GL.CULL_FACE);
    this.book.render(null, age, right, left, spread, 0, f(0.0625));
    GL.popMatrix();
  }
}

// ------------------------------------------------------------------ beacon beam

/**
 * TileEntityBeaconRenderer: two scrolling beam layers 256 blocks tall from misc/beam.png,
 * an additive inner pair of rotating planes and a translucent outer square.
 */
export class TileEntityBeaconRenderer extends TileEntitySpecialRenderer {
  renderTileEntityAt(te: TileEntity, x: number, y: number, z: number, pt: number): void {
    const beacon = te as TileEntityBeacon;
    const strength = beacon.getBeamStrength();
    if (strength <= 0) return;
    const t = Tessellator.instance;
    this.bindTextureByName('/misc/beam.png');
    GL.disable(GL.LIGHTING);
    GL.disable(GL.CULL_FACE);
    GL.disable(GL.BLEND);
    GL.depthMask(true);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE);
    const time = f(beacon.getWorldObj()!.getTotalWorldTime() + pt);
    const scroll = f(f(-time * f(0.2)) - MathHelper.floor_float(f(-time * f(0.1))));
    const spin = time * 0.025 * (1.0 - 1 * 2.5);
    const height = f(256 * strength);
    const v0 = f(-1 + scroll);
    // Inner beam: four corners turning around the centre.
    const r = 0.2;
    const corner = (a: number): [number, number] => [0.5 + Math.cos(spin + a) * r, 0.5 + Math.sin(spin + a) * r];
    const [ax, az] = corner((Math.PI * 3.0) / 4.0);
    const [bx, bz] = corner(Math.PI / 4);
    const [cx, cz] = corner((Math.PI * 5.0) / 4.0);
    const [dx, dz] = corner((Math.PI * 7.0) / 4.0);
    const v1 = height * (0.5 / r) + v0;
    const planes = (pairs: readonly (readonly [number, number, number, number])[], top: number): void => {
      for (const [x0, z0, x1, z1] of pairs) {
        t.addVertexWithUV(x + x0, y + height, z + z0, 1, top);
        t.addVertexWithUV(x + x0, y, z + z0, 1, v0);
        t.addVertexWithUV(x + x1, y, z + z1, 0, v0);
        t.addVertexWithUV(x + x1, y + height, z + z1, 0, top);
      }
    };
    t.startDrawingQuads();
    t.setColorRGBA(255, 255, 255, 32);
    planes(
      [
        [ax, az, bx, bz],
        [dx, dz, cx, cz],
        [bx, bz, dx, dz],
        [cx, cz, ax, az],
      ],
      v1,
    );
    t.draw();
    // Outer square, alpha blended without depth writes.
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    GL.depthMask(false);
    t.startDrawingQuads();
    t.setColorRGBA(255, 255, 255, 32);
    planes(
      [
        [0.2, 0.2, 0.8, 0.2],
        [0.8, 0.8, 0.2, 0.8],
        [0.8, 0.2, 0.8, 0.8],
        [0.2, 0.8, 0.2, 0.2],
      ],
      height + v0,
    );
    t.draw();
    GL.enable(GL.LIGHTING);
    GL.enable(GL.TEXTURE_2D);
    GL.depthMask(true);
  }
}

// ------------------------------------------------------------------ end portal

/**
 * RenderEndPortal: sixteen layers on the portal's surface, the first the dark tunnel and the
 * rest additive star fields, each mapped by the original's eye-linear texture generation so
 * that the layers seem to lie at different depths below the surface as the camera moves.
 * WebGL has no glTexGen, so the generated coordinates are computed here per vertex (the
 * surface is flat, so they stay affine across it).
 */
export class RenderEndPortal extends TileEntitySpecialRenderer {
  private readonly texMatrix = new MatrixStack(2);

  renderTileEntityAt(_te: TileEntity, x: number, y: number, z: number, _pt: number): void {
    const ter = this.tileEntityRenderer;
    const camX = f(ter.playerX);
    const camY = f(ter.playerY);
    const camZ = f(ter.playerZ);
    GL.disable(GL.LIGHTING);
    const rand = new JavaRandom(31100);
    const surface = f(0.75);
    const t = Tessellator.instance;
    const m = this.texMatrix;
    const corners: readonly (readonly [number, number])[] = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ];
    for (let layer = 0; layer < 16; layer++) {
      let depth = f(16 - layer);
      let scale = f(0.0625);
      let fade = f(1 / f(depth + 1));
      if (layer === 0) {
        this.bindTextureByName('/misc/tunnel.png');
        fade = f(0.1);
        depth = 65;
        scale = f(0.125);
        GL.enable(GL.BLEND);
        GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
      }
      if (layer === 1) {
        this.bindTextureByName('/misc/particlefield.png');
        GL.enable(GL.BLEND);
        GL.blendFunc(GL.ONE, GL.ONE);
        scale = 0.5;
      }
      const below = f(-(y + surface));
      const near = f(below + ActiveRenderInfo.objectY);
      const far = f(f(below + depth) + ActiveRenderInfo.objectY);
      const genY = f(f(y + surface) + f(near / far));
      void genY;
      // The texture matrix of this layer.
      m.loadIdentity();
      m.translate(0, f((Date.now() % 700000) / 700000), 0);
      m.scale(scale, scale, scale);
      m.translate(0.5, 0.5, 0);
      m.rotate(f((layer * layer * 4321 + layer * 9) * 2), 0, 0, 1);
      m.translate(-0.5, -0.5, 0);
      m.translate(-camX, -camZ, -camY);
      m.translate(f(f(ActiveRenderInfo.objectX * depth) / near), f(f(ActiveRenderInfo.objectZ * depth) / near), -camY);
      const tm = m.top;
      let red = f(f(rand.nextFloat() * f(0.5)) + f(0.1));
      let green = f(f(rand.nextFloat() * f(0.5)) + f(0.4));
      let blue = f(f(rand.nextFloat() * f(0.5)) + f(0.5));
      if (layer === 0) red = green = blue = 1;
      t.startDrawingQuads();
      t.setColorRGBA_F(f(red * fade), f(green * fade), f(blue * fade), 1);
      const vy = y + surface;
      for (const [cx, cz] of corners) {
        const vx = x + cx;
        const vz = z + cz;
        // Eye-linear generation relative to the translation (camX, genY, camZ) applied when it was set up.
        const s = vx - camX;
        const tt = vz - camZ;
        const r = 1;
        const q = vy;
        const ss = tm[0] * s + tm[4] * tt + tm[8] * r + tm[12] * q;
        const st = tm[1] * s + tm[5] * tt + tm[9] * r + tm[13] * q;
        const sq = tm[3] * s + tm[7] * tt + tm[11] * r + tm[15] * q;
        t.addVertexWithUV(vx, vy, vz, ss / sq, st / sq);
      }
      t.draw();
    }
    GL.disable(GL.BLEND);
    GL.enable(GL.LIGHTING);
  }
}
