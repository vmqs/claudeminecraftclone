import type { EntityLiving } from '../../entity/EntityLiving';
import type { EntityZombie } from '../../entity/EntityZombie';
import type { ModelBiped } from './ModelBiped';
import { ModelZombie } from './ModelZombie';
import { ModelZombieVillager } from './ModelZombieVillager';
import { RenderBiped } from './RenderBiped';

const f = Math.fround;

/**
 * Zombies, zombie villagers and pigmen (RenderZombie): swaps the main and armour models to the
 * zombie villager ones for villagers, and shakes the body while a zombie villager is being cured.
 */
export class RenderZombie extends RenderBiped {
  private readonly zombieModel: ModelBiped;
  private villagerModel: ModelZombieVillager;
  private villagerModelVersion = 1;
  declare private zombieChest: ModelBiped;
  declare private zombieLegs: ModelBiped;
  declare private villagerChest: ModelBiped;
  declare private villagerLegs: ModelBiped;

  constructor() {
    super(new ModelZombie(), 0.5, 1);
    this.zombieModel = this.modelBipedMain;
    this.villagerModel = new ModelZombieVillager();
  }

  protected override createArmorModels(): void {
    this.modelArmorChestplate = new ModelZombie(1, true);
    this.modelArmor = new ModelZombie(0.5, true);
    this.zombieChest = this.modelArmorChestplate;
    this.zombieLegs = this.modelArmor;
    this.villagerChest = new ModelZombieVillager(1, 0, true);
    this.villagerLegs = new ModelZombieVillager(0.5, 0, true);
  }

  protected override shouldRenderPass(e: EntityLiving, pass: number, pt: number): number {
    this.selectModels(e as EntityZombie);
    return super.shouldRenderPass(e, pass, pt);
  }

  override doRenderLiving(e: EntityLiving, x: number, y: number, z: number, yaw: number, pt: number): void {
    this.selectModels(e as EntityZombie);
    super.doRenderLiving(e, x, y, z, yaw, pt);
  }

  protected override renderEquippedItems(e: EntityLiving, pt: number): void {
    this.selectModels(e as EntityZombie);
    super.renderEquippedItems(e, pt);
  }

  private selectModels(e: EntityZombie): void {
    if (e.isVillager()) {
      if (this.villagerModelVersion !== this.villagerModel.getModelVersion()) {
        this.villagerModel = new ModelZombieVillager();
        this.villagerModelVersion = this.villagerModel.getModelVersion();
        this.villagerChest = new ModelZombieVillager(1, 0, true);
        this.villagerLegs = new ModelZombieVillager(0.5, 0, true);
      }
      this.mainModel = this.villagerModel;
      this.modelArmorChestplate = this.villagerChest;
      this.modelArmor = this.villagerLegs;
    } else {
      this.mainModel = this.zombieModel;
      this.modelArmorChestplate = this.zombieChest;
      this.modelArmor = this.zombieLegs;
    }
    (this as unknown as { modelBipedMain: ModelBiped }).modelBipedMain = this.mainModel as ModelBiped;
  }

  /** A zombie villager being cured shakes from side to side. */
  protected override rotateCorpse(e: EntityLiving, age: number, bodyYaw: number, pt: number): void {
    if ((e as EntityZombie).isConverting()) bodyYaw = f(bodyYaw + f(Math.cos(e.ticksExisted * 3.25) * Math.PI * 0.25));
    super.rotateCorpse(e, age, bodyYaw, pt);
  }
}

