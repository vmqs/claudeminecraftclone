import { AxisAlignedBB } from '../core/AxisAlignedBB';
import { Direction } from '../core/Facing';
import type { JavaRandom } from '../core/JavaRandom';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { Icon, IconRegister } from '../render/texture/Icon';
import type { IBlockAccess } from '../world/IBlockAccess';
import type { IWorld } from '../world/IWorld';
import { Block } from './Block';
import { BlockDirectional } from './BlockDirectional';
import { BlockIds, ItemIds } from './BlockIds';
import { Material } from './Material';

/** EntityPlayer.sleepInBedAt results (EnumStatus). */
export type BedSleepStatus = 'OK' | 'NOT_POSSIBLE_HERE' | 'NOT_POSSIBLE_NOW' | 'TOO_FAR_AWAY' | 'OTHER_PROBLEM' | 'NOT_SAFE';

/** What a player offers for sleeping (EntityPlayer.sleepInBedAt / playerLocation); provided by the entity code. */
interface SleepingPlayer {
  sleepInBedAt?(x: number, y: number, z: number): BedSleepStatus;
  isPlayerSleeping?(): boolean;
  playerLocation?: { posX: number; posY: number; posZ: number } | null;
}

/**
 * Bed (26, render type 14): two blocks; meta & 3 = direction from foot to head, bit 4 =
 * occupied, bit 8 = head. Use sleeps through `player.sleepInBedAt` (the entity code's job);
 * without it the 1.5.2 refusals ("You can only sleep at night", "You may not rest now, there
 * are monsters nearby") still show.
 */
export class BlockBed extends BlockDirectional {
  /** Offset from the foot to the head for each direction. */
  static readonly footBlockToHeadBlockMap = [
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 0],
  ];
  private iconEnd: (Icon | null)[] = [];
  private iconSide: (Icon | null)[] = [];
  private iconTop: (Icon | null)[] = [];

  constructor(id: number) {
    super(id, Material.cloth);
    this.setBounds();
  }

  override onBlockActivated(w: IWorld, x: number, y: number, z: number, p: EntityPlayer): boolean {
    if (w.isRemote) return true;
    let meta = w.getBlockMetadata(x, y, z);
    if (!BlockBed.isBlockHeadOfBed(meta)) {
      const d = BlockDirectional.getDirection(meta);
      x += BlockBed.footBlockToHeadBlockMap[d][0];
      z += BlockBed.footBlockToHeadBlockMap[d][1];
      if (w.getBlockId(x, y, z) !== this.blockID) return true;
      meta = w.getBlockMetadata(x, y, z);
    }
    // The overworld can always be slept in (beds explode only in the Nether and the End).
    if (BlockBed.isBedOccupied(meta)) {
      const sleeper = (w.playerEntities ?? []).find((o) => {
        const s = o as unknown as SleepingPlayer;
        const loc = s.playerLocation;
        return !!s.isPlayerSleeping?.() && !!loc && loc.posX === x && loc.posY === y && loc.posZ === z;
      });
      if (sleeper) {
        p.addChatMessage('tile.bed.occupied');
        return true;
      }
      BlockBed.setBedOccupied(w, x, y, z, false);
    }
    const status = BlockBed.trySleep(w, p, x, y, z);
    if (status === 'OK') {
      BlockBed.setBedOccupied(w, x, y, z, true);
    } else if (status === 'NOT_POSSIBLE_NOW') {
      p.addChatMessage('tile.bed.noSleep');
    } else if (status === 'NOT_SAFE') {
      p.addChatMessage('tile.bed.notSafe');
    }
    return true;
  }

  /** player.sleepInBedAt, or its checks without sleeping when the player cannot sleep yet. */
  private static trySleep(w: IWorld, p: EntityPlayer, x: number, y: number, z: number): BedSleepStatus {
    const s = p as unknown as SleepingPlayer;
    if (s.sleepInBedAt) return s.sleepInBedAt(x, y, z);
    if (w.isDaytime?.() ?? false) return 'NOT_POSSIBLE_NOW';
    if (Math.abs(p.posX - x) > 3 || Math.abs(p.posY - y) > 2 || Math.abs(p.posZ - z) > 3) return 'TOO_FAR_AWAY';
    const box = AxisAlignedBB.getBoundingBox(x - 8, y - 5, z - 8, x + 8, y + 5, z + 8);
    if (w.getEntitiesWithinAABBExcludingEntity(null, box).some((e) => e.isIMob)) return 'NOT_SAFE';
    return 'OTHER_PROBLEM';
  }

  override getIcon(side: number, meta: number): Icon | null {
    if (side === 0) return Block.blocksList[BlockIds.planks]!.getBlockTextureFromSide(side);
    const d = BlockDirectional.getDirection(meta);
    const face = Direction.bedDirection[d][side];
    const head = BlockBed.isBlockHeadOfBed(meta) ? 1 : 0;
    if ((head === 1 && face === 2) || (head === 0 && face === 3)) return this.iconEnd[head];
    return face !== 5 && face !== 4 ? this.iconTop[head] : this.iconSide[head];
  }

  override registerIcons(reg: IconRegister): void {
    this.iconTop = [reg.registerIcon('bed_feet_top'), reg.registerIcon('bed_head_top')];
    this.iconEnd = [reg.registerIcon('bed_feet_end'), reg.registerIcon('bed_head_end')];
    this.iconSide = [reg.registerIcon('bed_feet_side'), reg.registerIcon('bed_head_side')];
  }

  override getRenderType(): number {
    return 14;
  }

  override renderAsNormalBlock(): boolean {
    return false;
  }

  override isOpaqueCube(): boolean {
    return false;
  }

  override setBlockBoundsBasedOnState(_w: IBlockAccess, _x: number, _y: number, _z: number): void {
    this.setBounds();
  }

  /** Each half disappears without the other; the foot drops the bed item. */
  override onNeighborBlockChange(w: IWorld, x: number, y: number, z: number, _id: number): void {
    const meta = w.getBlockMetadata(x, y, z);
    const d = BlockDirectional.getDirection(meta);
    const [hx, hz] = BlockBed.footBlockToHeadBlockMap[d];
    if (BlockBed.isBlockHeadOfBed(meta)) {
      if (w.getBlockId(x - hx, y, z - hz) !== this.blockID) w.setBlockToAir(x, y, z);
    } else if (w.getBlockId(x + hx, y, z + hz) !== this.blockID) {
      w.setBlockToAir(x, y, z);
      if (!w.isRemote) this.dropBlockAsItem(w, x, y, z, meta, 0);
    }
  }

  override idDropped(meta: number, _rand: JavaRandom, _fortune: number): number {
    return BlockBed.isBlockHeadOfBed(meta) ? 0 : ItemIds.bed;
  }

  private setBounds(): void {
    this.setBlockBounds(0, 0, 0, 1, 0.5625, 1);
  }

  static isBlockHeadOfBed(meta: number): boolean {
    return (meta & 8) !== 0;
  }

  static isBedOccupied(meta: number): boolean {
    return (meta & 4) !== 0;
  }

  static setBedOccupied(w: IWorld, x: number, y: number, z: number, occupied: boolean): void {
    let meta = w.getBlockMetadata(x, y, z);
    meta = occupied ? meta | 4 : meta & -5;
    w.setBlockMetadataWithNotify(x, y, z, meta, 4);
  }

  /** Where a player waking up (or respawning) is put: the n-th free spot around the bed. */
  static getNearestEmptyChunkCoordinates(w: IWorld, x: number, y: number, z: number, n: number): { posX: number; posY: number; posZ: number } | null {
    const d = BlockDirectional.getDirection(w.getBlockMetadata(x, y, z));
    for (let i = 0; i <= 1; i++) {
      const x0 = x - BlockBed.footBlockToHeadBlockMap[d][0] * i - 1;
      const z0 = z - BlockBed.footBlockToHeadBlockMap[d][1] * i - 1;
      for (let bx = x0; bx <= x0 + 2; bx++) {
        for (let bz = z0; bz <= z0 + 2; bz++) {
          if (w.doesBlockHaveSolidTopSurface(bx, y - 1, bz) && w.isAirBlock(bx, y, bz) && w.isAirBlock(bx, y + 1, bz)) {
            if (n <= 0) return { posX: bx, posY: y, posZ: bz };
            n--;
          }
        }
      }
    }
    return null;
  }

  override dropBlockAsItemWithChance(w: IWorld, x: number, y: number, z: number, meta: number, chance: number, _fortune: number): void {
    if (!BlockBed.isBlockHeadOfBed(meta)) super.dropBlockAsItemWithChance(w, x, y, z, meta, chance, 0);
  }

  override getMobilityFlag(): number {
    return 1;
  }

  override idPicked(_w: IWorld, _x: number, _y: number, _z: number): number {
    return ItemIds.bed;
  }

  /** Breaking the head in creative removes the foot first, so nothing drops. */
  override onBlockHarvested(w: IWorld, x: number, y: number, z: number, meta: number, p: EntityPlayer): void {
    if (p.capabilities.isCreativeMode && BlockBed.isBlockHeadOfBed(meta)) {
      const d = BlockDirectional.getDirection(meta);
      x -= BlockBed.footBlockToHeadBlockMap[d][0];
      z -= BlockBed.footBlockToHeadBlockMap[d][1];
      if (w.getBlockId(x, y, z) === this.blockID) w.setBlockToAir(x, y, z);
    }
  }
}
