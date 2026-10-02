import { Block } from '../block/Block';
import { BlockIds } from '../block/BlockIds';
import { AxisAlignedBB } from '../core/AxisAlignedBB';
import { MathHelper } from '../core/MathHelper';
import type { World } from '../world/World';
import { EntityWeatherEffect } from './EntityWeatherEffect';

const f = Math.fround;

/**
 * A lightning bolt (EntityLightningBolt). In 1.5.2 the server's bolt sets fires, strikes the
 * entities around it and plays the thunder, and a copy the client receives flashes the sky
 * (World.lastLightningBolt) and is drawn; the world here is both, so this bolt does all of it.
 *
 * It lives a few ticks: two ticks visible, then up to three restrikes after random pauses, each
 * with a new shape (boltVertex seeds RenderLightningBolt) and, on Normal or Hard, a new fire.
 */
export class EntityLightningBolt extends EntityWeatherEffect {
  /** 2 on creation, counts down; the bolt is drawn and flashes while it is >= 0. */
  private lightningState = 2;
  /** Seed of the bolt's shape. */
  boltVertex = 0n;
  /** Restrikes left. */
  private boltLivingTime: number;

  constructor(world: World, x: number, y: number, z: number) {
    super(world);
    this.setLocationAndAngles(x, y, z, 0, 0);
    this.lightningState = 2;
    this.boltVertex = this.rand.nextLong();
    this.boltLivingTime = this.rand.nextInt(3) + 1;
    if (!world.isRemote && world.difficultySetting >= 2 && world.doChunksNearChunkExist(MathHelper.floor_double(x), MathHelper.floor_double(y), MathHelper.floor_double(z), 10)) {
      this.igniteAt(MathHelper.floor_double(x), MathHelper.floor_double(y), MathHelper.floor_double(z));
      for (let i = 0; i < 4; i++) {
        const fx = MathHelper.floor_double(x) + this.rand.nextInt(3) - 1;
        const fy = MathHelper.floor_double(y) + this.rand.nextInt(3) - 1;
        const fz = MathHelper.floor_double(z) + this.rand.nextInt(3) - 1;
        this.igniteAt(fx, fy, fz);
      }
    }
  }

  protected entityInit(): void {}

  /** Places fire in an air block where fire can stay (Block.fire.canPlaceBlockAt). */
  private igniteAt(x: number, y: number, z: number): void {
    const fire = Block.blocksList[BlockIds.fire];
    if (fire && this.worldObj.getBlockId(x, y, z) === 0 && fire.canPlaceBlockAt(this.worldObj, x, y, z)) {
      this.worldObj.setBlock(x, y, z, BlockIds.fire);
    }
  }

  override onUpdate(): void {
    super.onUpdate();
    const w = this.worldObj;
    if (this.lightningState === 2) {
      w.playSoundEffect(this.posX, this.posY, this.posZ, 'ambient.weather.thunder', 10000, f(f(0.8) + f(this.rand.nextFloat() * f(0.2))));
      w.playSoundEffect(this.posX, this.posY, this.posZ, 'random.explode', 2, f(f(0.5) + f(this.rand.nextFloat() * f(0.2))));
    }
    this.lightningState--;
    if (this.lightningState < 0) {
      if (this.boltLivingTime === 0) {
        this.setDead();
      } else if (this.lightningState < -this.rand.nextInt(10)) {
        this.boltLivingTime--;
        this.lightningState = 1;
        this.boltVertex = this.rand.nextLong();
        const x = MathHelper.floor_double(this.posX);
        const y = MathHelper.floor_double(this.posY);
        const z = MathHelper.floor_double(this.posZ);
        if (!w.isRemote && w.doChunksNearChunkExist(x, y, z, 10)) this.igniteAt(x, y, z);
      }
    }
    if (this.lightningState >= 0) {
      // The client's copy flashes the sky and the lightmap...
      w.lastLightningBolt = 2;
      // ...and the server's strikes everything within 3 blocks (6 above).
      const r = 3;
      const box = AxisAlignedBB.getBoundingBox(this.posX - r, this.posY - r, this.posZ - r, this.posX + r, this.posY + 6 + r, this.posZ + r);
      for (const e of w.getEntitiesWithinAABBExcludingEntity(this, box)) e.onStruckByLightning(this);
    }
  }

  /** Only drawn while it flashes. */
  override isInRangeToRenderVec3D(): boolean {
    return this.lightningState >= 0;
  }
}
