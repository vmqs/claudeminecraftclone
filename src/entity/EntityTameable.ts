import type { World } from '../world/World';
import { EntityAISit } from './ai/EntityAISit';
import { EntityAnimal } from './EntityAnimal';
import type { EntityLiving } from './EntityLiving';

const f = Math.fround;

/** An animal that can be tamed by a player and told to sit (EntityTameable: wolves, ocelots). */
export abstract class EntityTameable extends EntityAnimal {
  protected readonly aiSit = new EntityAISit(this);
  private tamed = false;
  private sitting = false;
  private ownerName = '';

  constructor(world: World) {
    super(world);
  }

  /** Hearts on success, smoke on failure. */
  protected playTameEffect(success: boolean): void {
    const name = success ? 'heart' : 'smoke';
    for (let i = 0; i < 7; i++) {
      this.worldObj.spawnParticle(
        name,
        this.posX + f(this.rand.nextFloat() * this.width * 2) - this.width,
        this.posY + 0.5 + f(this.rand.nextFloat() * this.height),
        this.posZ + f(this.rand.nextFloat() * this.width * 2) - this.width,
        this.rand.nextGaussian() * 0.02,
        this.rand.nextGaussian() * 0.02,
        this.rand.nextGaussian() * 0.02,
      );
    }
  }

  override handleHealthUpdate(status: number): void {
    if (status === 7) this.playTameEffect(true);
    else if (status === 6) this.playTameEffect(false);
    else super.handleHealthUpdate(status);
  }

  isTamed(): boolean {
    return this.tamed;
  }

  setTamed(v: boolean): void {
    this.tamed = v;
  }

  isSitting(): boolean {
    return this.sitting;
  }

  setSitting(v: boolean): void {
    this.sitting = v;
  }

  getOwnerName(): string {
    return this.ownerName;
  }

  setOwner(name: string): void {
    this.ownerName = name;
  }

  getOwner(): EntityLiving | null {
    return this.worldObj.getPlayerEntityByName(this.ownerName);
  }

  /** func_70907_r */
  getAISit(): EntityAISit {
    return this.aiSit;
  }
}
