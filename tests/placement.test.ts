/**
 * Placement logic of the placing items (doors, beds, slabs, signs, skulls, snow, buckets, seeds,
 * hoes, redstone, reeds) against a small in-memory world with stand-in blocks.
 * Run: node scripts/run-node-test.mjs tests/placement.test.ts
 */
import '../src/block/Blocks';
import { Block } from '../src/block/Block';
import { BlockIds as B, ItemIds as I } from '../src/block/BlockIds';
import { Material } from '../src/block/Material';
import { JavaRandom } from '../src/core/JavaRandom';
import { Item } from '../src/item/Item';
import { Items, registerBlockItems } from '../src/item/Items';
import { ItemStack } from '../src/item/ItemStack';
import { check, report } from './harness';

// Stand-ins for blocks the blocks agent adds (only the placement contract matters here).
class StandIn extends Block {
  constructor(id: number, m: Material, private readonly opaque = true) {
    super(id, m);
  }
  override isOpaqueCube(): boolean {
    return this.opaque;
  }
  override renderAsNormalBlock(): boolean {
    return this.opaque;
  }
}
const ensure = (id: number, m: Material, opaque = false) => Block.blocksList[id] ?? new StandIn(id, m, opaque);
ensure(B.doorWood, Material.wood);
ensure(B.doorIron, Material.iron);
ensure(B.bed, Material.cloth);
ensure(B.stoneSingleSlab, Material.rock);
ensure(B.stoneDoubleSlab, Material.rock, true);
ensure(B.signPost, Material.wood);
ensure(B.signWall, Material.wood);
ensure(B.skull, Material.circuits);
ensure(B.crops, Material.plants);
ensure(B.tilledField, Material.ground, true);
ensure(B.redstoneWire, Material.circuits);
ensure(B.pistonBase, Material.piston, true);
registerBlockItems();

/** A flat test world: grass at y = 3, air above. */
class TestWorld {
  readonly isRemote = false;
  readonly rand = new JavaRandom(1n);
  readonly provider = { dimensionId: 0, isHellWorld: false, hasNoSky: false };
  readonly blocks = new Map<string, [number, number]>();
  readonly sounds: string[] = [];
  readonly tileEntities = new Map<string, object>();
  private k(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }
  getBlockId(x: number, y: number, z: number): number {
    if (y <= 3 && !this.blocks.has(this.k(x, y, z))) return B.grass;
    return this.blocks.get(this.k(x, y, z))?.[0] ?? 0;
  }
  getBlockMetadata(x: number, y: number, z: number): number {
    return this.blocks.get(this.k(x, y, z))?.[1] ?? 0;
  }
  setBlock(x: number, y: number, z: number, id: number, meta = 0): boolean {
    if (id !== 0 && !Block.blocksList[id]) return false;
    this.blocks.set(this.k(x, y, z), [id, meta]);
    return true;
  }
  setBlockMetadataWithNotify(x: number, y: number, z: number, meta: number): boolean {
    this.blocks.set(this.k(x, y, z), [this.getBlockId(x, y, z), meta]);
    return true;
  }
  setBlockToAir(x: number, y: number, z: number): boolean {
    return this.setBlock(x, y, z, 0);
  }
  isAirBlock(x: number, y: number, z: number): boolean {
    return this.getBlockId(x, y, z) === 0;
  }
  getBlockMaterial(x: number, y: number, z: number): Material {
    const b = Block.blocksList[this.getBlockId(x, y, z)];
    return b ? b.blockMaterial : Material.air;
  }
  isBlockNormalCube(x: number, y: number, z: number): boolean {
    const b = Block.blocksList[this.getBlockId(x, y, z)];
    return !!b && b.blockMaterial.isOpaque() && b.renderAsNormalBlock();
  }
  doesBlockHaveSolidTopSurface(x: number, y: number, z: number): boolean {
    return this.isBlockNormalCube(x, y, z);
  }
  notifyBlocksOfNeighborChange(): void {}
  playSoundEffect(_x: number, _y: number, _z: number, name: string): void {
    this.sounds.push(name);
  }
  spawnParticle(): void {}
  playAuxSFX(): void {}
  checkNoEntityCollision(): boolean {
    return true;
  }
  getBlockTileEntity(x: number, y: number, z: number): object | null {
    return this.tileEntities.get(this.k(x, y, z)) ?? null;
  }
  canPlaceEntityOnSide(id: number, x: number, y: number, z: number, _ignore: boolean, side: number, _e: unknown, stack: ItemStack | null): boolean {
    const existing = Block.blocksList[this.getBlockId(x, y, z)];
    const block = Block.blocksList[id];
    if (!block) return false;
    const replaceable = !existing || existing.blockMaterial.isReplaceable() || existing.blockMaterial.isLiquid();
    return replaceable && block.canPlaceBlockOnSide(this as never, x, y, z, side, stack);
  }
}

const w = new TestWorld();
let signEditor = 0;
const player = {
  rotationYaw: 0,
  capabilities: { isCreativeMode: true },
  canPlayerEdit: () => true,
  displayGUIEditSign: () => signEditor++,
} as unknown as Parameters<Item['onItemUse']>[1];
const use = (id: number, dmg: number, x: number, y: number, z: number, side: number, yaw = 0, hy = 1) => {
  (player as unknown as { rotationYaw: number }).rotationYaw = yaw;
  const stack = new ItemStack(id, 64, dmg);
  const ok = Item.itemsList[id]!.onItemUse(stack, player, w as never, x, y, z, side, 0.5, hy, 0.5);
  return { ok, stack };
};
const at = (x: number, y: number, z: number) => `${w.getBlockId(x, y, z)}:${w.getBlockMetadata(x, y, z)}`;

// Doors: two blocks, lower = facing, upper = 8 | hinge.
use(I.doorWood, 0, 0, 3, 0, 1, 0);
check('wooden door placed facing south-yaw', at(0, 4, 0) === `${B.doorWood}:1` && at(0, 5, 0) === `${B.doorWood}:8`, `${at(0, 4, 0)} ${at(0, 5, 0)}`);
use(I.doorWood, 0, 1, 3, 0, 1, 0);
check('a door on the hinge side of another keeps its hinge', at(1, 5, 0) === `${B.doorWood}:8`, at(1, 5, 0));
use(I.doorWood, 0, -1, 3, 0, 1, 0);
check('a door on the other side mirrors (double door)', at(-1, 5, 0) === `${B.doorWood}:9`, at(-1, 5, 0));
check('door on a wall side is refused', use(I.doorIron, 0, 5, 3, 5, 2).ok === false);

// Beds: foot at the click, head one block in the facing direction.
use(I.bed, 0, 0, 3, 5, 1, 0);
check('bed facing south: foot meta 0, head +z meta 8', at(0, 4, 5) === `${B.bed}:0` && at(0, 4, 6) === `${B.bed}:8`, `${at(0, 4, 5)} ${at(0, 4, 6)}`);
use(I.bed, 0, 3, 3, 5, 1, 90);
check('bed facing west: head at -x, meta 9', at(3, 4, 5) === `${B.bed}:1` && at(2, 4, 5) === `${B.bed}:9`, `${at(3, 4, 5)} ${at(2, 4, 5)}`);

// Slabs: bottom slab, then a matching slab on its top face merges into a double slab.
use(B.stoneSingleSlab, 3, 8, 3, 0, 1);
check('cobblestone slab placed', at(8, 4, 0) === `${B.stoneSingleSlab}:3`, at(8, 4, 0));
use(B.stoneSingleSlab, 3, 8, 4, 0, 1);
check('slab on slab merges into a double slab', at(8, 4, 0) === `${B.stoneDoubleSlab}:3`, at(8, 4, 0));
use(B.stoneSingleSlab, 0, 9, 3, 0, 1);
use(B.stoneSingleSlab, 3, 9, 4, 0, 1);
check('different slab types stack instead', at(9, 4, 0) === `${B.stoneSingleSlab}:0` && at(9, 5, 0) === `${B.stoneSingleSlab}:3`, `${at(9, 4, 0)} ${at(9, 5, 0)}`);
check('slab item names', new ItemStack(B.stoneSingleSlab, 1, 3).getItemName() === 'tile.stoneSlab.cobble', new ItemStack(B.stoneSingleSlab, 1, 3).getItemName());

// Signs: standing sign with 16 rotations on top, wall sign on a side; the editor opens if a tile entity exists.
use(I.sign, 0, 12, 3, 0, 1, 90);
check('sign post rotation from yaw 90', at(12, 4, 0) === `${B.signPost}:12`, at(12, 4, 0));
w.setBlock(14, 4, 0, B.stoneDoubleSlab);
w.tileEntities.set('14,4,-1', {});
use(I.sign, 0, 14, 4, 0, 2);
check('wall sign on the north face, editor opened', at(14, 4, -1) === `${B.signWall}:2` && signEditor === 1, `${at(14, 4, -1)} editor ${signEditor}`);
check('no sign on the bottom face', use(I.sign, 0, 14, 4, 0, 0).ok === false);

// Skulls keep their type through the tile entity.
const skullTile = { type: -1, rot: -1, setSkullType(t: number) { this.type = t; }, getSkullType() { return this.type; }, setSkullRotation(r: number) { this.rot = r; } };
w.tileEntities.set('16,4,0', skullTile);
use(I.skull, 4, 16, 3, 0, 1, 45);
check('creeper head placed with rotation 2', at(16, 4, 0) === `${B.skull}:1` && skullTile.type === 4 && skullTile.rot === 2, `${at(16, 4, 0)} ${skullTile.type} ${skullTile.rot}`);

// Snow layers stack.
use(B.snow, 0, 20, 3, 0, 1);
use(B.snow, 0, 20, 4, 0, 1);
use(B.snow, 0, 20, 4, 0, 1);
check('three snow layers', at(20, 4, 0) === `${B.snow}:2`, at(20, 4, 0));

// Hoe, seeds and redstone.
use(I.hoeIron, 0, 22, 3, 0, 1);
check('hoe tills grass into farmland with its step sound', at(22, 3, 0) === `${B.tilledField}:0` && w.sounds[w.sounds.length - 1].startsWith('step.'), `${at(22, 3, 0)} ${w.sounds.join()}`);
use(I.seeds, 0, 22, 3, 0, 1);
check('seeds planted on farmland', at(22, 4, 0) === `${B.crops}:0`, at(22, 4, 0));
check('seeds refuse grass', use(I.seeds, 0, 24, 3, 0, 1).ok === false);
use(I.redstone, 0, 26, 3, 0, 1);
check('redstone wire placed', at(26, 4, 0) === `${B.redstoneWire}:0`, at(26, 4, 0));

// Pistons are placed with metadata 7 (the block picks its facing from the player).
check('piston item metadata 7', (Item.itemsList[B.pistonBase] as unknown as { getMetadata(d: number): number }).getMetadata(0) === 7);

// Creative keeps item counts where 1.5.2 checks isCreativeMode; survival uses one.
(player as unknown as { capabilities: { isCreativeMode: boolean } }).capabilities.isCreativeMode = false;
const egg = use(I.fireballCharge, 0, 28, 3, 0, 1);
check('fire charge consumed in survival', egg.stack.stackSize === 63);
void Items;
report();
