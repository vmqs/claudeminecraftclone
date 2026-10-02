import { AxisAlignedBB } from '../core/AxisAlignedBB';
import { I18n } from '../core/I18n';
import type { JavaRandom } from '../core/JavaRandom';
import { MovingObjectPosition } from '../core/MovingObjectPosition';
import type { Vec3 } from '../core/Vec3';
import type { Entity } from '../entity/Entity';
import type { EntityLiving } from '../entity/EntityLiving';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { CreativeTabs } from '../item/CreativeTabs';
import { Item } from '../item/Item';
import { ItemStack } from '../item/ItemStack';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import type { Explosion } from '../world/Explosion';
import { Material } from './Material';
import { StepSounds, type StepSound } from './StepSound';

/**
 * Block base class with the 1.5.2 (MCP) API. Instances are created once in
 * `Blocks.ts` and register themselves in `Block.blocksList[id]`.
 *
 * Worker-safe: no DOM/GL. Behaviour methods receive an {@link IWorld}; rendering
 * methods only an {@link IBlockAccess}.
 *
 * Bounds note: like the original, `minX..maxZ` are shared mutable state that
 * `setBlockBoundsBasedOnState` updates right before use (single-threaded per worker).
 */
export class Block {
  static readonly blocksList: (Block | null)[] = new Array(4096).fill(null);
  static readonly opaqueCubeLookup: boolean[] = new Array(4096).fill(false);
  static readonly lightOpacity = new Int32Array(4096);
  static readonly canBlockGrass: boolean[] = new Array(4096).fill(false);
  static readonly lightValue = new Int32Array(4096);
  static readonly useNeighborBrightness: boolean[] = new Array(4096).fill(false);

  readonly blockID: number;
  readonly blockMaterial: Material;
  protected blockHardness = 0;
  protected blockResistance = 0;
  protected blockConstructorCalled = true;
  protected enableStats = true;
  protected needsRandomTick = false;
  protected isBlockContainer = false;
  minX = 0;
  minY = 0;
  minZ = 0;
  maxX = 1;
  maxY = 1;
  maxZ = 1;
  stepSound: StepSound = StepSounds.soundPowderFootstep;
  blockParticleGravity = 1;
  slipperiness = 0.6;
  /** null until setUnlocalizedName, like the original ("tile.null"). */
  private unlocalizedName: string | null = null;
  protected blockIcon: Icon | null = null;
  private displayOnCreativeTab: CreativeTabs | null = null;

  constructor(id: number, material: Material) {
    if (Block.blocksList[id]) {
      throw new Error(`Slot ${id} is already occupied by ${Block.blocksList[id]!.constructor.name} when adding ${this.constructor.name}`);
    }
    this.blockMaterial = material;
    this.blockID = id;
    Block.blocksList[id] = this;
    this.setBlockBounds(0, 0, 0, 1, 1, 1);
    // Note: subclass overrides of isOpaqueCube() are already active here (as in Java).
    // Subclass fields are not initialised yet (as in Java), so overrides that read them see undefined.
    Block.opaqueCubeLookup[id] = !!this.isOpaqueCube();
    Block.lightOpacity[id] = this.isOpaqueCube() ? 255 : 0;
    Block.canBlockGrass[id] = !material.getCanBlockGrass();
  }

  // ------------------------------------------------------------------ builder-style setters

  initializeBlock(): void {}

  setStepSound(s: StepSound): this {
    this.stepSound = s;
    return this;
  }
  setLightOpacity(v: number): this {
    Block.lightOpacity[this.blockID] = v;
    return this;
  }
  /** 0..1 -> light value 0..15 */
  setLightValue(v: number): this {
    Block.lightValue[this.blockID] = (15 * Math.fround(v)) | 0;
    return this;
  }
  setResistance(v: number): this {
    this.blockResistance = v * 3;
    return this;
  }
  setHardness(v: number): this {
    this.blockHardness = v;
    if (this.blockResistance < v * 5) this.blockResistance = v * 5;
    return this;
  }
  setBlockUnbreakable(): this {
    return this.setHardness(-1);
  }
  setTickRandomly(v: boolean): this {
    this.needsRandomTick = v;
    return this;
  }
  setUnlocalizedName(name: string): this {
    this.unlocalizedName = name;
    return this;
  }
  disableStats(): this {
    this.enableStats = false;
    return this;
  }
  setCreativeTab(tab: CreativeTabs | null): this {
    this.displayOnCreativeTab = tab;
    return this;
  }
  /** Bounds in block-local units (floats in the original). */
  setBlockBounds(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): void {
    const f = Math.fround;
    this.minX = f(minX);
    this.minY = f(minY);
    this.minZ = f(minZ);
    this.maxX = f(maxX);
    this.maxY = f(maxY);
    this.maxZ = f(maxZ);
  }

  // ------------------------------------------------------------------ static helpers

  static isNormalCube(id: number): boolean {
    const b = Block.blocksList[id];
    return b !== null && b.blockMaterial.isOpaque() && b.renderAsNormalBlock() && !b.canProvidePower();
  }

  /**
   * World.isBlockIndirectlyGettingPowered. Redstone logic is out of scope, so this is false
   * unless a world provides it; blocks only react to power when {@link hasRedstone} is true.
   */
  static isPowered(w: IWorld, x: number, y: number, z: number): boolean {
    return w.isBlockIndirectlyGettingPowered?.(x, y, z) ?? false;
  }

  /** Whether the world simulates redstone power at all (see {@link isPowered}). */
  static hasRedstone(w: IWorld): boolean {
    return typeof w.isBlockIndirectlyGettingPowered === 'function';
  }

  /** A game rule of the world (doTileDrops, mobGriefing, ...); `def` when the world has none. */
  static getGameRule(w: IWorld, name: string, def = true): boolean {
    const rules = (w as unknown as { worldInfo?: { gameRules?: Record<string, boolean> } }).worldInfo?.gameRules;
    return rules && name in rules ? rules[name] : def;
  }

  /** The 4-way direction an entity faces: floor(yaw * 4 / 360 + offset) & 3 (0 south, 1 west, 2 north, 3 east). */
  static yawToDirection(e: { rotationYaw: number }, offset = 0.5): number {
    return Math.floor(Math.fround(Math.fround(e.rotationYaw * 4) / 360) + offset) & 3;
  }

  /**
   * Spawns an item entity with a given motion (the scatter of container contents when a chest,
   * furnace or dispenser breaks); falls back to the plain drop when the world cannot create one.
   */
  static spawnItemWithMotion(w: IWorld, x: number, y: number, z: number, stack: ItemStack, mx: number, my: number, mz: number): void {
    if (w.isRemote) return;
    const e = w.createItemEntity?.(x, y, z, stack) ?? null;
    if (!e) {
      w.dropItemStack(x, y, z, stack);
      return;
    }
    e.motionX = mx;
    e.motionY = my;
    e.motionZ = mz;
    w.spawnEntityInWorld(e);
  }

  static isAssociatedBlockID(a: number, b: number): boolean {
    if (a === b) return true;
    const ba = Block.blocksList[a];
    return a !== 0 && b !== 0 && ba !== null && Block.blocksList[b] !== null ? ba.isAssociatedBlockID(b) : false;
  }

  // ------------------------------------------------------------------ properties

  /** The blockHardness field (stairs and walls copy their model block's values). */
  getRawHardness(): number {
    return this.blockHardness;
  }
  /** The blockResistance field (3x the value given to setResistance). */
  getRawResistance(): number {
    return this.blockResistance;
  }

  renderAsNormalBlock(): boolean {
    return true;
  }
  getBlocksMovement(_w: IBlockAccess, _x: number, _y: number, _z: number): boolean {
    return !this.blockMaterial.blocksMovement();
  }
  /** Render type for RenderBlocks.renderBlockByRenderType (0 = standard cube, -1 = not rendered). */
  getRenderType(): number {
    return 0;
  }
  getBlockHardness(_w: IWorld, _x: number, _y: number, _z: number): number {
    return this.blockHardness;
  }
  getTickRandomly(): boolean {
    return this.needsRandomTick;
  }
  hasTileEntity(): boolean {
    return this.isBlockContainer;
  }
  isOpaqueCube(): boolean {
    return true;
  }
  canCollideCheck(_meta: number, _hitLiquids: boolean): boolean {
    return this.isCollidable();
  }
  isCollidable(): boolean {
    return true;
  }
  /** 0 = opaque/cut-out pass, 1 = translucent pass (water, ice). */
  getRenderBlockPass(): number {
    return 0;
  }
  getEnableStats(): boolean {
    return this.enableStats;
  }
  getMobilityFlag(): number {
    return this.blockMaterial.getMaterialMobility();
  }
  canProvidePower(): boolean {
    return false;
  }
  isProvidingWeakPower(_w: IBlockAccess, _x: number, _y: number, _z: number, _side: number): number {
    return 0;
  }
  isProvidingStrongPower(_w: IBlockAccess, _x: number, _y: number, _z: number, _side: number): number {
    return 0;
  }
  hasComparatorInputOverride(): boolean {
    return false;
  }
  getComparatorInputOverride(_w: IWorld, _x: number, _y: number, _z: number, _side: number): number {
    return 0;
  }
  /**
   * World.isBlockTopFacingSurfaceSolid: true for opaque full cubes; stairs, slabs, hoppers
   * and snow layers override it (the original used instanceof checks in World).
   */
  hasSolidTopSurface(_meta: number): boolean {
    return this.blockMaterial.isOpaque() && this.renderAsNormalBlock();
  }
  /** Extra condition for Block.useNeighborBrightness (half slabs return true). */
  usesNeighborBrightness(): boolean {
    return false;
  }
  isFlowerPot(): boolean {
    return false;
  }
  isLadder(_w: IBlockAccess, _x: number, _y: number, _z: number): boolean {
    return this.blockID === 65 || this.blockID === 106; // ladder, vine
  }
  /** func_82506_l: whether a scheduled update of this block may run immediately while generating. */
  isUpdateTickImmediate(): boolean {
    return true;
  }
  canDropFromExplosion(_explosion?: Explosion): boolean {
    return true;
  }
  isAssociatedBlockID(id: number): boolean {
    return this.blockID === id;
  }
  getExplosionResistance(_e: Entity | null): number {
    return this.blockResistance / 5;
  }
  getUnlocalizedName(): string {
    return 'tile.' + (this.unlocalizedName ?? 'null');
  }
  getUnlocalizedName2(): string {
    return this.unlocalizedName ?? 'null';
  }
  getLocalizedName(): string {
    return I18n.translateToLocal(this.getUnlocalizedName() + '.name');
  }
  getCreativeTabToDisplayOn(): CreativeTabs | null {
    return this.displayOnCreativeTab;
  }
  getSubBlocks(id: number, _tab: CreativeTabs, out: ItemStack[]): void {
    out.push(new ItemStack(id, 1, 0));
  }
  /** Item icon name for blocks shown as a flat item (null = render the block). */
  getItemIconName(): string | null {
    return null;
  }

  // ------------------------------------------------------------------ bounds

  getBlockBoundsMinX(): number {
    return this.minX;
  }
  getBlockBoundsMaxX(): number {
    return this.maxX;
  }
  getBlockBoundsMinY(): number {
    return this.minY;
  }
  getBlockBoundsMaxY(): number {
    return this.maxY;
  }
  getBlockBoundsMinZ(): number {
    return this.minZ;
  }
  getBlockBoundsMaxZ(): number {
    return this.maxZ;
  }
  setBlockBoundsBasedOnState(_w: IBlockAccess, _x: number, _y: number, _z: number): void {}
  setBlockBoundsForItemRender(): void {}

  getSelectedBoundingBoxFromPool(_w: IWorld, x: number, y: number, z: number): AxisAlignedBB {
    return AxisAlignedBB.getBoundingBox(x + this.minX, y + this.minY, z + this.minZ, x + this.maxX, y + this.maxY, z + this.maxZ);
  }

  getCollisionBoundingBoxFromPool(_w: IWorld, x: number, y: number, z: number): AxisAlignedBB | null {
    return AxisAlignedBB.getBoundingBox(x + this.minX, y + this.minY, z + this.minZ, x + this.maxX, y + this.maxY, z + this.maxZ);
  }

  addCollisionBoxesToList(w: IWorld, x: number, y: number, z: number, mask: AxisAlignedBB, list: AxisAlignedBB[], _e: Entity | null): void {
    const bb = this.getCollisionBoundingBoxFromPool(w, x, y, z);
    if (bb && mask.intersectsWith(bb)) list.push(bb);
  }

  // ------------------------------------------------------------------ rendering

  getMixedBrightnessForBlock(w: IBlockAccess, x: number, y: number, z: number): number {
    return w.getLightBrightnessForSkyBlocks(x, y, z, Block.lightValue[w.getBlockId(x, y, z)]);
  }

  getBlockBrightness(w: IBlockAccess, x: number, y: number, z: number): number {
    return w.getBrightness(x, y, z, Block.lightValue[w.getBlockId(x, y, z)]);
  }

  /** Whether `side` should be drawn; (x, y, z) is the neighbour in that direction. */
  shouldSideBeRendered(w: IBlockAccess, x: number, y: number, z: number, side: number): boolean {
    if (side === 0 && this.minY > 0) return true;
    if (side === 1 && this.maxY < 1) return true;
    if (side === 2 && this.minZ > 0) return true;
    if (side === 3 && this.maxZ < 1) return true;
    if (side === 4 && this.minX > 0) return true;
    if (side === 5 && this.maxX < 1) return true;
    return !w.isBlockOpaqueCube(x, y, z);
  }

  isBlockSolid(w: IBlockAccess, x: number, y: number, z: number, _side: number): boolean {
    return w.getBlockMaterial(x, y, z).isSolid();
  }

  getBlockTexture(w: IBlockAccess, x: number, y: number, z: number, side: number): Icon | null {
    return this.getIcon(side, w.getBlockMetadata(x, y, z));
  }

  getIcon(_side: number, _meta: number): Icon | null {
    return this.blockIcon;
  }

  getBlockTextureFromSide(side: number): Icon | null {
    return this.getIcon(side, 0);
  }

  registerIcons(reg: IconRegister): void {
    this.blockIcon = reg.registerIcon(this.getUnlocalizedName2());
  }

  getBlockColor(): number {
    return 0xffffff;
  }
  getRenderColor(_meta: number): number {
    return 0xffffff;
  }
  colorMultiplier(_w: IBlockAccess, _x: number, _y: number, _z: number): number {
    return 0xffffff;
  }

  /** 0.2 for normal cubes, 1.0 otherwise (smooth lighting occlusion). */
  getAmbientOcclusionLightValue(w: IBlockAccess, x: number, y: number, z: number): number {
    return w.isBlockNormalCube(x, y, z) ? 0.2 : 1.0;
  }

  // ------------------------------------------------------------------ ray tracing

  collisionRayTrace(w: IWorld, x: number, y: number, z: number, start: Vec3, end: Vec3): MovingObjectPosition | null {
    this.setBlockBoundsBasedOnState(w, x, y, z);
    start = start.addVector(-x, -y, -z);
    end = end.addVector(-x, -y, -z);
    let v0 = start.getIntermediateWithXValue(end, this.minX);
    let v1 = start.getIntermediateWithXValue(end, this.maxX);
    let v2 = start.getIntermediateWithYValue(end, this.minY);
    let v3 = start.getIntermediateWithYValue(end, this.maxY);
    let v4 = start.getIntermediateWithZValue(end, this.minZ);
    let v5 = start.getIntermediateWithZValue(end, this.maxZ);
    if (!this.isVecInsideYZBounds(v0)) v0 = null;
    if (!this.isVecInsideYZBounds(v1)) v1 = null;
    if (!this.isVecInsideXZBounds(v2)) v2 = null;
    if (!this.isVecInsideXZBounds(v3)) v3 = null;
    if (!this.isVecInsideXYBounds(v4)) v4 = null;
    if (!this.isVecInsideXYBounds(v5)) v5 = null;
    const cand = [v0, v1, v2, v3, v4, v5];
    const sides = [4, 5, 0, 1, 2, 3];
    let best: Vec3 | null = null;
    let side = -1;
    for (let i = 0; i < 6; i++) {
      const c = cand[i];
      if (c && (best === null || start.squareDistanceTo(c) < start.squareDistanceTo(best))) {
        best = c;
        side = sides[i];
      }
    }
    if (!best) return null;
    return MovingObjectPosition.forBlock(x, y, z, side, best.addVector(x, y, z));
  }

  private isVecInsideYZBounds(v: Vec3 | null): boolean {
    return !!v && v.yCoord >= this.minY && v.yCoord <= this.maxY && v.zCoord >= this.minZ && v.zCoord <= this.maxZ;
  }
  private isVecInsideXZBounds(v: Vec3 | null): boolean {
    return !!v && v.xCoord >= this.minX && v.xCoord <= this.maxX && v.zCoord >= this.minZ && v.zCoord <= this.maxZ;
  }
  private isVecInsideXYBounds(v: Vec3 | null): boolean {
    return !!v && v.xCoord >= this.minX && v.xCoord <= this.maxX && v.yCoord >= this.minY && v.yCoord <= this.maxY;
  }

  // ------------------------------------------------------------------ behaviour hooks

  updateTick(_w: IWorld, _x: number, _y: number, _z: number, _rand: JavaRandom): void {}
  randomDisplayTick(_w: IWorld, _x: number, _y: number, _z: number, _rand: JavaRandom): void {}
  onBlockDestroyedByPlayer(_w: IWorld, _x: number, _y: number, _z: number, _meta: number): void {}
  onNeighborBlockChange(_w: IWorld, _x: number, _y: number, _z: number, _neighborId: number): void {}
  /** Delay in ticks for scheduled updates. */
  tickRate(_w: IWorld): number {
    return 10;
  }
  onBlockAdded(_w: IWorld, _x: number, _y: number, _z: number): void {}
  breakBlock(_w: IWorld, _x: number, _y: number, _z: number, _id: number, _meta: number): void {}
  /** After an explosion removed the block (TNT primes itself here). */
  onBlockDestroyedByExplosion(_w: IWorld, _x: number, _y: number, _z: number, _explosion?: Explosion): void {}
  onBlockActivated(_w: IWorld, _x: number, _y: number, _z: number, _p: EntityPlayer, _side: number, _hx: number, _hy: number, _hz: number): boolean {
    return false;
  }
  onEntityWalking(_w: IWorld, _x: number, _y: number, _z: number, _e: Entity): void {}
  /** Returns the metadata to place (default: the item damage passed in). */
  onBlockPlaced(_w: IWorld, _x: number, _y: number, _z: number, _side: number, _hx: number, _hy: number, _hz: number, meta: number): number {
    return meta;
  }
  onBlockClicked(_w: IWorld, _x: number, _y: number, _z: number, _p: EntityPlayer): void {}
  velocityToAddToEntity(_w: IWorld, _x: number, _y: number, _z: number, _e: Entity, _v: Vec3): void {}
  onEntityCollidedWithBlock(_w: IWorld, _x: number, _y: number, _z: number, _e: Entity): void {}
  onBlockPlacedBy(_w: IWorld, _x: number, _y: number, _z: number, _e: EntityLiving, _stack: ItemStack): void {}
  onPostBlockPlaced(_w: IWorld, _x: number, _y: number, _z: number, _meta: number): void {}
  onBlockEventReceived(_w: IWorld, _x: number, _y: number, _z: number, _a: number, _b: number): boolean {
    return false;
  }
  onFallenUpon(_w: IWorld, _x: number, _y: number, _z: number, _e: Entity, _dist: number): void {}
  onBlockHarvested(_w: IWorld, _x: number, _y: number, _z: number, _meta: number, _p: EntityPlayer): void {}
  onSetBlockIDWithMetaData(_w: IWorld, _x: number, _y: number, _z: number, _meta: number): void {}
  fillWithRain(_w: IWorld, _x: number, _y: number, _z: number): void {}

  canPlaceBlockOnSide(w: IWorld, x: number, y: number, z: number, _side: number, _stack?: ItemStack | null): boolean {
    return this.canPlaceBlockAt(w, x, y, z);
  }
  canPlaceBlockAt(w: IWorld, x: number, y: number, z: number): boolean {
    const id = w.getBlockId(x, y, z);
    return id === 0 || Block.blocksList[id]!.blockMaterial.isReplaceable();
  }
  canBlockStay(_w: IWorld, _x: number, _y: number, _z: number): boolean {
    return true;
  }

  /** Picked block id for middle click. */
  idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return this.blockID;
  }
  getDamageValue(w: IWorld, x: number, y: number, z: number): number {
    return this.damageDropped(w.getBlockMetadata(x, y, z));
  }

  // ------------------------------------------------------------------ drops

  quantityDropped(_rand: JavaRandom): number {
    return 1;
  }
  quantityDroppedWithBonus(_fortune: number, rand: JavaRandom): number {
    return this.quantityDropped(rand);
  }
  idDropped(_meta: number, _rand: JavaRandom, _fortune: number): number {
    return this.blockID;
  }
  damageDropped(_meta: number): number {
    return 0;
  }

  getPlayerRelativeBlockHardness(p: EntityPlayer, w: IWorld, x: number, y: number, z: number): number {
    const h = this.getBlockHardness(w, x, y, z);
    if (h < 0) return 0;
    return !p.canHarvestBlock(this) ? p.getCurrentPlayerStrVsBlock(this, false) / h / 100 : p.getCurrentPlayerStrVsBlock(this, true) / h / 30;
  }

  dropBlockAsItem(w: IWorld, x: number, y: number, z: number, meta: number, fortune: number): void {
    this.dropBlockAsItemWithChance(w, x, y, z, meta, 1, fortune);
  }

  dropBlockAsItemWithChance(w: IWorld, x: number, y: number, z: number, meta: number, chance: number, fortune: number): void {
    if (w.isRemote) return;
    const n = this.quantityDroppedWithBonus(fortune, w.rand);
    for (let i = 0; i < n; i++) {
      if (w.rand.nextFloat() > chance) continue;
      const id = this.idDropped(meta, w.rand, fortune);
      if (id > 0) this.dropBlockAsItem_do(w, x, y, z, new ItemStack(id, 1, this.damageDropped(meta)));
    }
  }

  /** Spawns an item entity at a random point inside the block. */
  protected dropBlockAsItem_do(w: IWorld, x: number, y: number, z: number, stack: ItemStack): void {
    if (w.isRemote) return;
    const f = 0.7;
    const dx = w.rand.nextFloat() * f + (1 - f) * 0.5;
    const dy = w.rand.nextFloat() * f + (1 - f) * 0.5;
    const dz = w.rand.nextFloat() * f + (1 - f) * 0.5;
    w.dropItemStack(x + dx, y + dy, z + dz, stack);
  }

  protected dropXpOnBlockBreak(_w: IWorld, _x: number, _y: number, _z: number, _xp: number): void {
    // XP orbs are survival-only; nothing to do in Creative.
  }

  harvestBlock(w: IWorld, _p: EntityPlayer, x: number, y: number, z: number, meta: number): void {
    this.dropBlockAsItem(w, x, y, z, meta, 0);
  }

  protected canSilkHarvest(): boolean {
    return this.renderAsNormalBlock() && !this.isBlockContainer;
  }

  protected createStackedBlock(meta: number): ItemStack {
    const item = Item.itemsList[this.blockID];
    return new ItemStack(this.blockID, 1, item && item.getHasSubtypes() ? meta : 0);
  }

  toString(): string {
    return `${this.constructor.name}{${this.blockID}}`;
  }
}

/** Material.air convenience used by IBlockAccess implementations. */
export function materialOf(id: number): Material {
  return id === 0 ? Material.air : (Block.blocksList[id]?.blockMaterial ?? Material.air);
}
