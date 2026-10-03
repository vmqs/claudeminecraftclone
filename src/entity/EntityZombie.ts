import { BlockIds, ItemIds } from '../block/BlockIds';
import { MathHelper } from '../core/MathHelper';
import { ItemStack } from '../item/ItemStack';
import { PotionEffect } from '../potion/PotionEffect';
import type { World } from '../world/World';
import { EntityAIAttackOnCollide } from './ai/EntityAIAttackOnCollide';
import { EntityAIBreakDoor } from './ai/EntityAIBreakDoor';
import { EntityAIHurtByTarget } from './ai/EntityAIHurtByTarget';
import { EntityAILookIdle } from './ai/EntityAILookIdle';
import { EntityAIMoveThroughVillage } from './ai/EntityAIMoveThroughVillage';
import { EntityAIMoveTwardsRestriction } from './ai/EntityAIMoveTwardsRestriction';
import { EntityAINearestAttackableTarget } from './ai/EntityAINearestAttackableTarget';
import { EntityAISwimming } from './ai/EntityAISwimming';
import { EntityAIWander } from './ai/EntityAIWander';
import { EntityAIWatchClosest } from './ai/EntityAIWatchClosest';
import type { Entity } from './Entity';
import { EntityList } from './EntityList';
import { EntityLiving, EnumCreatureAttribute } from './EntityLiving';
import { EntityMob } from './EntityMob';
import type { EntityPlayer } from './EntityPlayer';
import { burnInDaylight, isEntityNamed, maybeHalloweenHelmet, tagBool, tagNumber } from './HostileMobUtil';
import { PotionId, type PotionEffectLike } from './PotionEffects';
import type { TagCompound } from '../item/ItemStack';
import { NBT } from '../world/storage/NBT';

const f = Math.fround;

const isPlayer = (e: Entity): boolean => e.isPlayerEntity;
const isVillager = (e: Entity): boolean => isEntityNamed(e, 'Villager');

/** What zombie curing needs of the villager (EntityVillager; mobs-passive code). */
interface CuredVillager {
  setGrowingAge?(age: number): void;
  /** func_82187_q: marks a cured villager (its trades start unlocked). */
  func_82187_q?(): void;
  initCreature?(): void;
  addPotionEffect?(e: PotionEffectLike): void;
}

/**
 * A zombie (EntityZombie): AI-task melee mob that chases players and villagers, breaks wooden
 * doors (on Hard), burns in daylight unless helmeted, sets targets on fire when burning,
 * converts the villagers it kills (Normal/Hard) and can be cured back with a golden apple
 * while weakened (3600-6000 ticks, faster near iron bars and beds). 5% spawn as zombie
 * villagers; baby zombies only come from converted baby villagers.
 */
export class EntityZombie extends EntityMob {
  /** DataWatcher 12-14: child, villager, converting. */
  private childFlag = false;
  private villagerFlag = false;
  private convertingFlag = false;
  private conversionTime = 0;

  constructor(world: World) {
    super(world);
    this.texture = '/mob/zombie.png';
    this.moveSpeed = f(0.23);
    this.getNavigator().setBreakDoors(true);
    this.tasks.addTask(0, new EntityAISwimming(this));
    this.tasks.addTask(1, new EntityAIBreakDoor(this));
    this.tasks.addTask(2, EntityAIAttackOnCollide.forClass(this, isPlayer, this.moveSpeed, false));
    this.tasks.addTask(3, EntityAIAttackOnCollide.forClass(this, isVillager, this.moveSpeed, true));
    this.tasks.addTask(4, new EntityAIMoveTwardsRestriction(this, this.moveSpeed));
    this.tasks.addTask(5, new EntityAIMoveThroughVillage(this, this.moveSpeed, false));
    this.tasks.addTask(6, new EntityAIWander(this, this.moveSpeed));
    this.tasks.addTask(7, new EntityAIWatchClosest(this, 'player', 8));
    this.tasks.addTask(7, new EntityAILookIdle(this));
    this.targetTasks.addTask(1, new EntityAIHurtByTarget(this, true));
    this.targetTasks.addTask(2, new EntityAINearestAttackableTarget(this, 'player', 16, 0, true));
    this.targetTasks.addTask(2, new EntityAINearestAttackableTarget(this, isVillager, 16, 0, false));
  }

  protected override getPathSearchRange(): number {
    return 40;
  }

  override getSpeedModifier(): number {
    return f(super.getSpeedModifier() * (this.isChild() ? f(1.5) : 1));
  }

  override getTexture(): string {
    return this.isVillager() ? '/mob/zombie_villager.png' : '/mob/zombie.png';
  }

  getMaxHealth(): number {
    return 20;
  }

  /** Two points of natural armour, capped at 20. */
  override getTotalArmorValue(): number {
    return Math.min(super.getTotalArmorValue() + 2, 20);
  }

  protected override isAIEnabled(): boolean {
    return true;
  }

  override isChild(): boolean {
    return this.childFlag;
  }

  /** setChild: as in 1.5.2 the flag can only be switched on. */
  setChild(_v: boolean): void {
    this.childFlag = true;
  }

  isVillager(): boolean {
    return this.villagerFlag;
  }

  setVillager(v: boolean): void {
    this.villagerFlag = v;
  }

  override onLivingUpdate(): void {
    if (!this.isChild()) burnInDaylight(this, this.rand);
    super.onLivingUpdate();
  }

  override onUpdate(): void {
    if (this.isConverting()) {
      this.conversionTime -= this.getConversionTimeBoost();
      if (this.conversionTime <= 0) this.convertToVillager();
    }
    super.onUpdate();
  }

  /** A burning, unarmed zombie may set what it hits on fire (difficulty x 30%). */
  override attackEntityAsMob(target: Entity): boolean {
    const hit = super.attackEntityAsMob(target);
    const diff = this.worldObj.difficultySetting;
    if (hit && !this.getHeldItem() && this.isBurning() && this.rand.nextFloat() < f(diff * f(0.3))) target.setFire(2 * diff);
    return hit;
  }

  /** 3 + up to 4 more as it loses health, plus the held weapon. */
  override getAttackStrength(_target: Entity): number {
    const held = this.getHeldItem();
    const lost = f((this.getMaxHealth() - this.getHealth()) / this.getMaxHealth());
    let dmg = 3 + MathHelper.floor_float(f(lost * 4));
    if (held) dmg += held.getDamageVsEntity(this);
    return dmg;
  }

  protected override getLivingSound(): string | null {
    return 'mob.zombie.say';
  }

  protected override getHurtSound(): string | null {
    return 'mob.zombie.hurt';
  }

  protected override getDeathSound(): string | null {
    return 'mob.zombie.death';
  }

  protected override playStepSound(_x: number, _y: number, _z: number, _id: number): void {
    this.playSound('mob.zombie.step', f(0.15), 1);
  }

  protected override getDropItemId(): number {
    return ItemIds.rottenFlesh;
  }

  override getCreatureAttribute(): EnumCreatureAttribute {
    return EnumCreatureAttribute.UNDEAD;
  }

  protected override dropRareDrop(_kind: number): void {
    switch (this.rand.nextInt(3)) {
      case 0:
        this.dropItem(ItemIds.ingotIron, 1);
        break;
      case 1:
        this.dropItem(ItemIds.carrot, 1);
        break;
      case 2:
        this.dropItem(ItemIds.potato, 1);
        break;
    }
  }

  /** Armour by difficulty, and 1% (5% on Hard) hold an iron sword (1 in 3) or iron shovel. */
  protected override addRandomArmor(): void {
    super.addRandomArmor();
    if (this.rand.nextFloat() < (this.worldObj.difficultySetting === 3 ? f(0.05) : f(0.01))) {
      const kind = this.rand.nextInt(3);
      this.setCurrentItemOrArmor(0, new ItemStack(kind === 0 ? ItemIds.swordIron : ItemIds.shovelIron, 1, 0));
    }
  }

  /** Villagers killed on Normal (half the time) or Hard rise as zombie villagers. */
  override onKillEntity(victim: Entity): void {
    super.onKillEntity(victim);
    const diff = this.worldObj.difficultySetting;
    if (diff < 2 || !isVillager(victim)) return;
    if (diff === 2 && this.rand.nextBoolean()) return;
    const z = new EntityZombie(this.worldObj);
    z.copyLocationAndAnglesFrom(victim);
    this.worldObj.removeEntity(victim);
    z.initCreature();
    z.setVillager(true);
    if ((victim as EntityLiving).isChild()) z.setChild(true);
    this.worldObj.spawnEntityInWorld(z);
    this.worldObj.playAuxSFXAtEntity(null, 1016, Math.trunc(this.posX), Math.trunc(this.posY), Math.trunc(this.posZ), 0);
  }

  override initCreature(): void {
    this.setCanPickUpLoot(this.rand.nextFloat() < EntityLiving.pickUpLootProbability[this.worldObj.difficultySetting]);
    if (this.worldObj.rand.nextFloat() < f(0.05)) this.setVillager(true);
    this.addRandomArmor();
    this.enchantEquipment();
    maybeHalloweenHelmet(this, this.rand, this.equipmentDropChances);
  }

  /** A golden apple (not enchanted) fed to a weakened zombie villager starts the cure. */
  override interact(player: EntityPlayer): boolean {
    const held = player.getCurrentEquippedItem();
    if (held && held.itemID === ItemIds.appleGold && held.getItemDamage() === 0 && this.isVillager() && this.isPotionActive(PotionId.weakness)) {
      if (!player.capabilities.isCreativeMode) held.stackSize--;
      if (held.stackSize <= 0) player.inventory.setInventorySlotContents(player.inventory.currentItem, null);
      this.startConversion(this.rand.nextInt(2401) + 3600);
      return true;
    }
    return false;
  }

  protected startConversion(ticks: number): void {
    this.conversionTime = ticks;
    this.convertingFlag = true;
    this.removePotionEffect(PotionId.weakness);
    this.addPotionEffect(new PotionEffect(PotionId.damageBoost, ticks, Math.min(this.worldObj.difficultySetting - 1, 0)) as unknown as PotionEffectLike);
    this.worldObj.setEntityState(this, 16);
  }

  override handleHealthUpdate(status: number): void {
    if (status === 16) {
      this.worldObj.playSound(this.posX + 0.5, this.posY + 0.5, this.posZ + 0.5, 'mob.zombie.remedy', f(1 + this.rand.nextFloat()), f(f(this.rand.nextFloat() * f(0.7)) + f(0.3)), false);
    } else {
      super.handleHealthUpdate(status);
    }
  }

  isConverting(): boolean {
    return this.convertingFlag;
  }

  /** The cure finishes: a villager (child if the zombie was) with 10 s of nausea replaces it. */
  protected convertToVillager(): void {
    const v = EntityList.createEntityByName('Villager', this.worldObj);
    if (!v) {
      // No villager class yet: stay a zombie villager until it exists.
      this.convertingFlag = false;
      return;
    }
    const villager = v as Entity & CuredVillager;
    v.copyLocationAndAnglesFrom(this);
    villager.initCreature?.();
    villager.func_82187_q?.();
    if (this.isChild()) villager.setGrowingAge?.(-24000);
    this.worldObj.removeEntity(this);
    this.worldObj.spawnEntityInWorld(v);
    villager.addPotionEffect?.(new PotionEffect(PotionId.confusion, 200, 0) as unknown as PotionEffectLike);
    this.worldObj.playAuxSFXAtEntity(null, 1017, Math.trunc(this.posX), Math.trunc(this.posY), Math.trunc(this.posZ), 0);
  }

  /** 1% of ticks: +1 for each iron bar or bed within 4 blocks (30% each, at most 14 checked). */
  protected getConversionTimeBoost(): number {
    let boost = 1;
    if (this.rand.nextFloat() < f(0.01)) {
      let found = 0;
      const px = Math.trunc(this.posX);
      const py = Math.trunc(this.posY);
      const pz = Math.trunc(this.posZ);
      for (let x = px - 4; x < px + 4 && found < 14; x++) {
        for (let y = py - 4; y < py + 4 && found < 14; y++) {
          for (let z = pz - 4; z < pz + 4 && found < 14; z++) {
            const id = this.worldObj.getBlockId(x, y, z);
            if (id === BlockIds.fenceIron || id === BlockIds.bed) {
              if (this.rand.nextFloat() < f(0.3)) boost++;
              found++;
            }
          }
        }
      }
    }
    return boost;
  }

  override writeEntityToNBT(tag: TagCompound): void {
    super.writeEntityToNBT(tag);
    if (this.isChild()) NBT.setBoolean(tag, 'IsBaby', true);
    if (this.isVillager()) NBT.setBoolean(tag, 'IsVillager', true);
    NBT.setInteger(tag, 'ConversionTime', this.isConverting() ? this.conversionTime : -1);
  }

  override readEntityFromNBT(tag: TagCompound): void {
    super.readEntityFromNBT(tag);
    if (NBT.getBoolean(tag, 'IsBaby')) this.setChild(true);
    if (NBT.getBoolean(tag, 'IsVillager')) this.setVillager(true);
    if (NBT.hasKey(tag, 'ConversionTime') && NBT.getInteger(tag, 'ConversionTime') > -1) this.startConversion(NBT.getInteger(tag, 'ConversionTime'));
  }
}
