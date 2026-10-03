import { BlockIds, ItemIds } from '../block/BlockIds';
import { MathHelper } from '../core/MathHelper';
import type { JavaRandom } from '../core/JavaRandom';
import { Enchantment } from '../enchantment/Enchantment';
import { EnchantmentData, EnchantmentHelper } from '../enchantment/EnchantmentHelper';
import { Item } from '../item/Item';
import { ItemStack } from '../item/ItemStack';
import { PotionEffect } from '../potion/PotionEffect';
import type { Village } from '../world/village/Village';
import type { World } from '../world/World';
import { EntityAIAvoidEntity } from './ai/EntityAIAvoidEntity';
import { EntityAIFollowGolem } from './ai/EntityAIFollowGolem';
import { EntityAILookAtTradePlayer } from './ai/EntityAILookAtTradePlayer';
import { EntityAIMoveIndoors } from './ai/EntityAIMoveIndoors';
import { EntityAIMoveTwardsRestriction } from './ai/EntityAIMoveTwardsRestriction';
import { EntityAIOpenDoor } from './ai/EntityAIOpenDoor';
import { EntityAIPlay } from './ai/EntityAIPlay';
import { EntityAIRestrictOpenDoor } from './ai/EntityAIRestrictOpenDoor';
import { EntityAISwimming } from './ai/EntityAISwimming';
import { EntityAITradePlayer } from './ai/EntityAITradePlayer';
import { EntityAIVillagerMate } from './ai/EntityAIVillagerMate';
import { EntityAIWander } from './ai/EntityAIWander';
import { EntityAIWatchClosest } from './ai/EntityAIWatchClosest';
import { EntityAIWatchClosest2 } from './ai/EntityAIWatchClosest2';
import type { DamageSource } from './DamageSource';
import type { Entity } from './Entity';
import { EntityAgeable } from './EntityAgeable';
import type { EntityLiving } from './EntityLiving';
import { EntityList } from './EntityList';
import type { EntityPlayer } from './EntityPlayer';
import type { IMerchant } from './merchant/IMerchant';
import { MerchantRecipe } from './merchant/MerchantRecipe';
import { MerchantRecipeList } from './merchant/MerchantRecipeList';
import { PotionId } from './PotionEffects';
import type { TagCompound } from '../item/ItemStack';
import { NBT } from '../world/storage/NBT';

const f = Math.fround;

/** Items villagers buy, with the stack size range they ask for (villagerStockList). */
const villagerStockList = new Map<number, [number, number]>([
  [ItemIds.coal, [16, 24]],
  [ItemIds.ingotIron, [8, 10]],
  [ItemIds.ingotGold, [8, 10]],
  [ItemIds.diamond, [4, 6]],
  [ItemIds.paper, [24, 36]],
  [ItemIds.book, [11, 13]],
  [ItemIds.writtenBook, [1, 1]],
  [ItemIds.enderPearl, [3, 4]],
  [ItemIds.eyeOfEnder, [2, 3]],
  [ItemIds.porkRaw, [14, 18]],
  [ItemIds.beefRaw, [14, 18]],
  [ItemIds.chickenRaw, [14, 18]],
  [ItemIds.fishCooked, [9, 13]],
  [ItemIds.seeds, [34, 48]],
  [ItemIds.melonSeeds, [30, 38]],
  [ItemIds.pumpkinSeeds, [30, 38]],
  [ItemIds.wheat, [18, 22]],
  [BlockIds.cloth, [14, 22]],
  [ItemIds.rottenFlesh, [36, 64]],
]);

/**
 * Items villagers sell (blacksmithSellingList): a positive range is the emerald price for one
 * item, a negative one the number of items for one emerald.
 */
const blacksmithSellingList = new Map<number, [number, number]>([
  [ItemIds.flintAndSteel, [3, 4]],
  [ItemIds.shears, [3, 4]],
  [ItemIds.swordIron, [7, 11]],
  [ItemIds.swordDiamond, [12, 14]],
  [ItemIds.axeIron, [6, 8]],
  [ItemIds.axeDiamond, [9, 12]],
  [ItemIds.pickaxeIron, [7, 9]],
  [ItemIds.pickaxeDiamond, [10, 12]],
  [ItemIds.shovelIron, [4, 6]],
  [ItemIds.shovelDiamond, [7, 8]],
  [ItemIds.hoeIron, [4, 6]],
  [ItemIds.hoeDiamond, [7, 8]],
  [ItemIds.bootsIron, [4, 6]],
  [ItemIds.bootsDiamond, [7, 8]],
  [ItemIds.helmetIron, [4, 6]],
  [ItemIds.helmetDiamond, [7, 8]],
  [ItemIds.plateIron, [10, 14]],
  [ItemIds.plateDiamond, [16, 19]],
  [ItemIds.legsIron, [8, 10]],
  [ItemIds.legsDiamond, [11, 14]],
  [ItemIds.bootsChain, [5, 7]],
  [ItemIds.helmetChain, [5, 7]],
  [ItemIds.plateChain, [11, 15]],
  [ItemIds.legsChain, [9, 11]],
  [ItemIds.bread, [-4, -2]],
  [ItemIds.melon, [-8, -4]],
  [ItemIds.appleRed, [-8, -4]],
  [ItemIds.cookie, [-10, -7]],
  [BlockIds.glass, [-5, -3]],
  [BlockIds.bookShelf, [3, 4]],
  [ItemIds.plateLeather, [4, 5]],
  [ItemIds.bootsLeather, [2, 4]],
  [ItemIds.helmetLeather, [2, 4]],
  [ItemIds.legsLeather, [2, 4]],
  [ItemIds.saddle, [6, 8]],
  [ItemIds.expBottle, [-4, -1]],
  [ItemIds.redstone, [-4, -1]],
  [ItemIds.compass, [10, 12]],
  [ItemIds.pocketSundial, [10, 12]],
  [BlockIds.glowStone, [-3, -1]],
  [ItemIds.porkCooked, [-7, -5]],
  [ItemIds.beefCooked, [-7, -5]],
  [ItemIds.chickenCooked, [-8, -6]],
  [ItemIds.eyeOfEnder, [7, 11]],
  [ItemIds.arrow, [-12, -8]],
]);

function randomCount(table: Map<number, [number, number]>, id: number, rand: JavaRandom): number {
  const range = table.get(id);
  if (!range) return 1;
  return range[0] >= range[1] ? range[0] : range[0] + rand.nextInt(range[1] - range[0]);
}

/** The villager buys `id` (a random-sized stack) for one emerald, with probability `chance`. */
function addMerchantItem(list: MerchantRecipe[], id: number, rand: JavaRandom, chance: number): void {
  if (rand.nextFloat() < chance) list.push(MerchantRecipe.of(new ItemStack(id, randomCount(villagerStockList, id, rand), 0), ItemIds.emerald));
}

/** The villager sells `id` for emeralds (or several for one emerald), with probability `chance`. */
function addBlacksmithItem(list: MerchantRecipe[], id: number, rand: JavaRandom, chance: number): void {
  if (!(rand.nextFloat() < chance)) return;
  const n = randomCount(blacksmithSellingList, id, rand);
  if (n < 0) list.push(MerchantRecipe.of(new ItemStack(ItemIds.emerald, 1, 0), new ItemStack(id, -n, 0)));
  else list.push(MerchantRecipe.of(new ItemStack(ItemIds.emerald, n, 0), new ItemStack(id, 1, 0)));
}

const isZombie = (e: Entity): boolean => EntityList.getEntityString(e) === 'Zombie';

/**
 * The villager (EntityVillager): 20 health, five professions (farmer, librarian, priest,
 * blacksmith, butcher) with their own skins and trades, lives in the nearest village (home area
 * 60% of its radius), hides indoors at night and in rain, opens doors, runs from zombies,
 * children play and take poppies from iron golems, adults breed while the village has doors to
 * spare. Right click (adult) opens the trading window; a trade's last offer restocks.
 */
export class EntityVillager extends EntityAgeable implements IMerchant {
  private randomTickDivider = 0;
  private isMatingFlag = false;
  private isPlayingFlag = false;
  private villageObj: Village | null = null;
  private buyingPlayer: EntityPlayer | null = null;
  private buyingList: MerchantRecipeList | null = null;
  private timeUntilReset = 0;
  private needsInitilization = false;
  private wealth = 0;
  private lastBuyingPlayer: string | null = null;
  /** field_82190_bM: a cured zombie villager raises everyone's reputation when it finds a village. */
  private isLookingForHome = false;
  /** field_82191_bN: makes new trades rarer the more trades exist. */
  private tradeChanceBonus = 0;
  /** DataWatcher 16. */
  private profession = 0;

  constructor(world: World, profession = 0) {
    super(world);
    this.setProfession(profession);
    this.texture = '/mob/villager/villager.png';
    this.moveSpeed = f(0.5);
    this.setSize(f(0.6), f(1.8));
    this.getNavigator().setBreakDoors(true);
    this.getNavigator().setAvoidsWater(true);
    this.tasks.addTask(0, new EntityAISwimming(this));
    this.tasks.addTask(1, new EntityAIAvoidEntity(this, isZombie, 8, f(0.3), f(0.35)));
    this.tasks.addTask(1, new EntityAITradePlayer(this));
    this.tasks.addTask(1, new EntityAILookAtTradePlayer(this));
    this.tasks.addTask(2, new EntityAIMoveIndoors(this));
    this.tasks.addTask(3, new EntityAIRestrictOpenDoor(this));
    this.tasks.addTask(4, new EntityAIOpenDoor(this, true));
    this.tasks.addTask(5, new EntityAIMoveTwardsRestriction(this, f(0.3)));
    this.tasks.addTask(6, new EntityAIVillagerMate(this));
    this.tasks.addTask(7, new EntityAIFollowGolem(this));
    this.tasks.addTask(8, new EntityAIPlay(this, f(0.32)));
    this.tasks.addTask(9, new EntityAIWatchClosest2(this, 'player', 3, 1));
    this.tasks.addTask(9, new EntityAIWatchClosest2(this, (e) => EntityList.getEntityString(e) === 'Villager', 5, f(0.02)));
    this.tasks.addTask(9, new EntityAIWander(this, f(0.3)));
    this.tasks.addTask(10, new EntityAIWatchClosest(this, (e) => e.isLivingEntity, 8));
  }

  protected override isAIEnabled(): boolean {
    return true;
  }

  protected override updateAITick(): void {
    if (--this.randomTickDivider <= 0) {
      const villages = this.worldObj.villageCollectionObj;
      const x = MathHelper.floor_double(this.posX);
      const y = MathHelper.floor_double(this.posY);
      const z = MathHelper.floor_double(this.posZ);
      villages.addVillagerPosition(x, y, z);
      this.randomTickDivider = 70 + this.rand.nextInt(50);
      this.villageObj = villages.findNearestVillage(x, y, z, 32);
      if (!this.villageObj) {
        this.detachHome();
      } else {
        const c = this.villageObj.getCenter();
        this.setHomeArea(c.posX, c.posY, c.posZ, Math.trunc(f(this.villageObj.getVillageRadius() * f(0.6))));
        if (this.isLookingForHome) {
          this.isLookingForHome = false;
          this.villageObj.addReputationForAllPlayers(5);
        }
      }
    }
    if (!this.isTrading() && this.timeUntilReset > 0) {
      this.timeUntilReset--;
      if (this.timeUntilReset <= 0) {
        if (this.needsInitilization) {
          const list = this.buyingList!;
          if (list.length > 1) {
            for (const r of list) if (r.isRecipeDisabled()) r.increaseMaxTradeUses(this.rand.nextInt(6) + this.rand.nextInt(6) + 2);
          }
          this.addDefaultEquipmentAndRecipies(1);
          this.needsInitilization = false;
          if (this.villageObj && this.lastBuyingPlayer !== null) {
            this.worldObj.setEntityState(this, 14);
            this.villageObj.setReputationForPlayer(this.lastBuyingPlayer, 1);
          }
        }
        this.addPotionEffect(new PotionEffect(PotionId.regeneration, 200, 0));
      }
    }
    super.updateAITick();
  }

  /** Right click (not with a spawn egg) on an adult that is not trading opens the trading window. */
  override interact(player: EntityPlayer): boolean {
    const held = player.inventory.getCurrentItem();
    const egg = held !== null && held.itemID === ItemIds.monsterPlacer;
    if (!egg && this.isEntityAlive() && !this.isTrading() && !this.isChild()) {
      this.setCustomer(player);
      player.displayGUIMerchant(this, this.hasCustomName() ? this.getCustomNameTag() : '');
      return true;
    }
    return super.interact(player);
  }

  getMaxHealth(): number {
    return 20;
  }

  override getTexture(): string {
    switch (this.getProfession()) {
      case 0:
        return '/mob/villager/farmer.png';
      case 1:
        return '/mob/villager/librarian.png';
      case 2:
        return '/mob/villager/priest.png';
      case 3:
        return '/mob/villager/smith.png';
      case 4:
        return '/mob/villager/butcher.png';
      default:
        return super.getTexture();
    }
  }

  protected override canDespawn(): boolean {
    return false;
  }

  protected override getLivingSound(): string | null {
    return 'mob.villager.default';
  }

  protected override getHurtSound(): string | null {
    return 'mob.villager.defaulthurt';
  }

  protected override getDeathSound(): string | null {
    return 'mob.villager.defaultdeath';
  }

  setProfession(p: number): void {
    this.profession = p;
  }

  getProfession(): number {
    return this.profession;
  }

  isMating(): boolean {
    return this.isMatingFlag;
  }

  setMating(v: boolean): void {
    this.isMatingFlag = v;
  }

  setPlaying(v: boolean): void {
    this.isPlayingFlag = v;
  }

  isPlaying(): boolean {
    return this.isPlayingFlag;
  }

  /** Hurting a villager makes the attacker a village aggressor and costs a player reputation. */
  override setRevengeTarget(e: EntityLiving | null): void {
    super.setRevengeTarget(e);
    if (this.villageObj && e) {
      this.villageObj.addOrRenewAgressor(e);
      if (e.isPlayerEntity) {
        this.villageObj.setReputationForPlayer((e as EntityPlayer).getCommandSenderName(), this.isChild() ? -3 : -1);
        if (this.isEntityAlive()) this.worldObj.setEntityState(this, 13);
      }
    }
  }

  override onDeath(src: DamageSource): void {
    if (this.villageObj) {
      const killer = src.getEntity();
      if (killer) {
        if (killer.isPlayerEntity) this.villageObj.setReputationForPlayer((killer as EntityPlayer).getCommandSenderName(), -2);
        else if (killer.isIMob) this.villageObj.endMatingSeason();
      } else if (this.worldObj.getClosestPlayerToEntity(this, 16) !== null) {
        this.villageObj.endMatingSeason();
      }
    }
    super.onDeath(src);
  }

  setCustomer(p: EntityPlayer | null): void {
    this.buyingPlayer = p;
  }

  getCustomer(): EntityPlayer | null {
    return this.buyingPlayer;
  }

  isTrading(): boolean {
    return this.buyingPlayer !== null;
  }

  /** Using the last offer schedules a new one (40 ticks after trading ends); emeralds add wealth. */
  useRecipe(r: MerchantRecipe): void {
    r.incrementToolUses();
    const list = this.buyingList!;
    if (r.hasSameIDsAs(list[list.length - 1])) {
      this.timeUntilReset = 40;
      this.needsInitilization = true;
      this.lastBuyingPlayer = this.buyingPlayer ? this.buyingPlayer.getCommandSenderName() : null;
    }
    if (r.getItemToBuy().itemID === ItemIds.emerald) this.wealth += r.getItemToBuy().stackSize;
  }

  getRecipes(_player: EntityPlayer): MerchantRecipeList | null {
    if (!this.buyingList) this.addDefaultEquipmentAndRecipies(1);
    return this.buyingList;
  }

  setRecipes(_list: MerchantRecipeList): void {}

  /** func_82188_j: the chance of a trade, lowered as the offer list grows. */
  private adjustProbability(p: number): number {
    const k = f(p + this.tradeChanceBonus);
    return k > f(0.9) ? f(f(0.9) - f(k - f(0.9))) : k;
  }

  /** Rolls this profession's possible trades and adds `count` new ones to the offers. */
  private addDefaultEquipmentAndRecipies(count: number): void {
    this.tradeChanceBonus = this.buyingList ? f(MathHelper.sqrt_float(this.buyingList.length) * f(0.2)) : 0;
    const list: MerchantRecipe[] = [];
    const r = this.rand;
    const p = (x: number) => this.adjustProbability(f(x));
    switch (this.getProfession()) {
      case 0:
        addMerchantItem(list, ItemIds.wheat, r, p(0.9));
        addMerchantItem(list, BlockIds.cloth, r, p(0.5));
        addMerchantItem(list, ItemIds.chickenRaw, r, p(0.5));
        addMerchantItem(list, ItemIds.fishCooked, r, p(0.4));
        addBlacksmithItem(list, ItemIds.bread, r, p(0.9));
        addBlacksmithItem(list, ItemIds.melon, r, p(0.3));
        addBlacksmithItem(list, ItemIds.appleRed, r, p(0.3));
        addBlacksmithItem(list, ItemIds.cookie, r, p(0.3));
        addBlacksmithItem(list, ItemIds.shears, r, p(0.3));
        addBlacksmithItem(list, ItemIds.flintAndSteel, r, p(0.3));
        addBlacksmithItem(list, ItemIds.chickenCooked, r, p(0.3));
        addBlacksmithItem(list, ItemIds.arrow, r, p(0.5));
        if (r.nextFloat() < p(0.5)) list.push(new MerchantRecipe(new ItemStack(BlockIds.gravel, 10), new ItemStack(ItemIds.emerald), new ItemStack(ItemIds.flint, 4 + r.nextInt(2), 0)));
        break;
      case 1:
        addMerchantItem(list, ItemIds.paper, r, p(0.8));
        addMerchantItem(list, ItemIds.book, r, p(0.8));
        addMerchantItem(list, ItemIds.writtenBook, r, p(0.3));
        addBlacksmithItem(list, BlockIds.bookShelf, r, p(0.8));
        addBlacksmithItem(list, BlockIds.glass, r, p(0.2));
        addBlacksmithItem(list, ItemIds.compass, r, p(0.2));
        addBlacksmithItem(list, ItemIds.pocketSundial, r, p(0.2));
        if (r.nextFloat() < p(0.07)) {
          const books = Enchantment.enchantmentsBookList;
          const e = books[r.nextInt(books.length)];
          const level = MathHelper.getRandomIntegerInRange(r, e.getMinLevel(), e.getMaxLevel());
          const book = (Item.itemsList[ItemIds.enchantedBook] as Item & { getEnchantedItemStack(d: EnchantmentData): ItemStack }).getEnchantedItemStack(new EnchantmentData(e, level));
          const price = 2 + r.nextInt(5 + level * 10) + 3 * level;
          list.push(new MerchantRecipe(new ItemStack(ItemIds.book), new ItemStack(ItemIds.emerald, price), book));
        }
        break;
      case 2: {
        addBlacksmithItem(list, ItemIds.eyeOfEnder, r, p(0.3));
        addBlacksmithItem(list, ItemIds.expBottle, r, p(0.2));
        addBlacksmithItem(list, ItemIds.redstone, r, p(0.4));
        addBlacksmithItem(list, BlockIds.glowStone, r, p(0.3));
        const tools = [ItemIds.swordIron, ItemIds.swordDiamond, ItemIds.plateIron, ItemIds.plateDiamond, ItemIds.axeIron, ItemIds.axeDiamond, ItemIds.pickaxeIron, ItemIds.pickaxeDiamond];
        for (const id of tools) {
          if (r.nextFloat() < p(0.05)) {
            list.push(new MerchantRecipe(new ItemStack(id, 1, 0), new ItemStack(ItemIds.emerald, 2 + r.nextInt(3), 0), EnchantmentHelper.addRandomEnchantment(r, new ItemStack(id, 1, 0), 5 + r.nextInt(15))));
          }
        }
        break;
      }
      case 3:
        addMerchantItem(list, ItemIds.coal, r, p(0.7));
        addMerchantItem(list, ItemIds.ingotIron, r, p(0.5));
        addMerchantItem(list, ItemIds.ingotGold, r, p(0.5));
        addMerchantItem(list, ItemIds.diamond, r, p(0.5));
        addBlacksmithItem(list, ItemIds.swordIron, r, p(0.5));
        addBlacksmithItem(list, ItemIds.swordDiamond, r, p(0.5));
        addBlacksmithItem(list, ItemIds.axeIron, r, p(0.3));
        addBlacksmithItem(list, ItemIds.axeDiamond, r, p(0.3));
        addBlacksmithItem(list, ItemIds.pickaxeIron, r, p(0.5));
        addBlacksmithItem(list, ItemIds.pickaxeDiamond, r, p(0.5));
        addBlacksmithItem(list, ItemIds.shovelIron, r, p(0.2));
        addBlacksmithItem(list, ItemIds.shovelDiamond, r, p(0.2));
        addBlacksmithItem(list, ItemIds.hoeIron, r, p(0.2));
        addBlacksmithItem(list, ItemIds.hoeDiamond, r, p(0.2));
        addBlacksmithItem(list, ItemIds.bootsIron, r, p(0.2));
        addBlacksmithItem(list, ItemIds.bootsDiamond, r, p(0.2));
        addBlacksmithItem(list, ItemIds.helmetIron, r, p(0.2));
        addBlacksmithItem(list, ItemIds.helmetDiamond, r, p(0.2));
        addBlacksmithItem(list, ItemIds.plateIron, r, p(0.2));
        addBlacksmithItem(list, ItemIds.plateDiamond, r, p(0.2));
        addBlacksmithItem(list, ItemIds.legsIron, r, p(0.2));
        addBlacksmithItem(list, ItemIds.legsDiamond, r, p(0.2));
        addBlacksmithItem(list, ItemIds.bootsChain, r, p(0.1));
        addBlacksmithItem(list, ItemIds.helmetChain, r, p(0.1));
        addBlacksmithItem(list, ItemIds.plateChain, r, p(0.1));
        addBlacksmithItem(list, ItemIds.legsChain, r, p(0.1));
        break;
      case 4:
        addMerchantItem(list, ItemIds.coal, r, p(0.7));
        addMerchantItem(list, ItemIds.porkRaw, r, p(0.5));
        addMerchantItem(list, ItemIds.beefRaw, r, p(0.5));
        addBlacksmithItem(list, ItemIds.saddle, r, p(0.1));
        addBlacksmithItem(list, ItemIds.plateLeather, r, p(0.3));
        addBlacksmithItem(list, ItemIds.bootsLeather, r, p(0.3));
        addBlacksmithItem(list, ItemIds.helmetLeather, r, p(0.3));
        addBlacksmithItem(list, ItemIds.legsLeather, r, p(0.3));
        addBlacksmithItem(list, ItemIds.porkCooked, r, p(0.3));
        addBlacksmithItem(list, ItemIds.beefCooked, r, p(0.3));
        break;
    }
    if (list.length === 0) addMerchantItem(list, ItemIds.ingotGold, r, 1);
    // Collections.shuffle with its own random source.
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    this.buyingList ??= new MerchantRecipeList();
    for (let i = 0; i < count && i < list.length; i++) this.buyingList.addToListWithCheck(list[i]);
  }

  /** Status 12 hearts (mating), 13 angry clouds (hurt by a player), 14 green sparkles (restock). */
  override handleHealthUpdate(status: number): void {
    if (status === 12) this.generateRandomParticles('heart');
    else if (status === 13) this.generateRandomParticles('angryVillager');
    else if (status === 14) this.generateRandomParticles('happyVillager');
    else super.handleHealthUpdate(status);
  }

  private generateRandomParticles(name: string): void {
    for (let i = 0; i < 5; i++) {
      const vx = this.rand.nextGaussian() * 0.02;
      const vy = this.rand.nextGaussian() * 0.02;
      const vz = this.rand.nextGaussian() * 0.02;
      this.worldObj.spawnParticle(
        name,
        this.posX + f(this.rand.nextFloat() * this.width * 2) - this.width,
        this.posY + 1 + f(this.rand.nextFloat() * this.height),
        this.posZ + f(this.rand.nextFloat() * this.width * 2) - this.width,
        vx,
        vy,
        vz,
      );
    }
  }

  /** A random profession. */
  override initCreature(): void {
    this.setProfession(this.worldObj.rand.nextInt(5));
  }

  /** func_82187_q: set on a villager cured from a zombie villager. */
  setLookingForHome(): void {
    this.isLookingForHome = true;
  }

  func_82187_q(): void {
    this.setLookingForHome();
  }

  createChild(_mate: EntityAgeable): EntityVillager {
    const baby = new EntityVillager(this.worldObj);
    baby.initCreature();
    return baby;
  }

  override writeEntityToNBT(tag: TagCompound): void {
    super.writeEntityToNBT(tag);
    NBT.setInteger(tag, 'Profession', this.getProfession());
    NBT.setInteger(tag, 'Riches', this.wealth);
    if (this.buyingList) NBT.setCompoundTag(tag, 'Offers', this.buyingList.getRecipiesAsTags());
  }

  override readEntityFromNBT(tag: TagCompound): void {
    super.readEntityFromNBT(tag);
    this.setProfession(NBT.getInteger(tag, 'Profession'));
    this.wealth = NBT.getInteger(tag, 'Riches');
    if (NBT.hasKey(tag, 'Offers')) this.buyingList = MerchantRecipeList.fromTags(NBT.getCompoundTag(tag, 'Offers'));
  }
}
