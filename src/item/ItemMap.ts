import { Block } from '../block/Block';
import { BlockIds, ItemIds } from '../block/BlockIds';
import { MapColor } from '../block/Material';
import { MathHelper } from '../core/MathHelper';
import type { Entity } from '../entity/Entity';
import type { EntityPlayer } from '../entity/EntityPlayer';
import type { IWorld } from '../world/IWorld';
import type { World } from '../world/World';
import { CreativeTabs } from './CreativeTabs';
import { Item } from './Item';
import { ItemStack } from './ItemStack';

/** The EntityHanging fields an item frame marker uses (block position and facing 0-3). */
interface HangingLike {
  xPosition?: number;
  zPosition?: number;
  hangingDirection?: number;
}

const f = Math.fround;

/** A marker on a map (MapCoord): icon 0 player, 1 item frame, 6 off-map player; position in half pixels. */
export interface MapCoord {
  iconSize: number;
  centerX: number;
  centerZ: number;
  iconRotation: number;
}

/**
 * The contents of one filled map (MapData): centre, scale (1:1 .. 1:16), 128x128 colour indices
 * (MapColor index * 4 + shade 0..2) and the visible markers. `version` increases whenever the
 * pixels change so a renderer knows to re-upload them.
 */
export class MapData {
  xCenter = 0;
  zCenter = 0;
  dimension = 0;
  scale = 0;
  readonly colors = new Uint8Array(16384);
  readonly playersVisibleOnMap = new Map<string, MapCoord>();
  /** Per-player update phase (MapInfo.field_82569_d): which 1/16th of the columns is redrawn. */
  readonly playerUpdateCounters = new Map<EntityPlayer, number>();
  version = 0;

  constructor(readonly mapName: string) {}

  markDirty(): void {
    this.version++;
  }

  setColumnDirty(_x: number, _minZ: number, _maxZ: number): void {
    this.markDirty();
  }

  /** Puts the holders (and the item frame holding it) on the map. */
  updateVisiblePlayers(player: EntityPlayer, stack: ItemStack): void {
    if (!this.playerUpdateCounters.has(player)) this.playerUpdateCounters.set(player, 0);
    if (!player.inventory.hasItemStack(stack)) this.playersVisibleOnMap.delete(player.getCommandSenderName());
    for (const p of [...this.playerUpdateCounters.keys()]) {
      if (!p.isDead && p.inventory.hasItemStack(stack)) {
        if (p.dimension === this.dimension) this.updateMarker(0, p.worldObj, p.getCommandSenderName(), p.posX, p.posZ, p.rotationYaw);
      } else {
        this.playerUpdateCounters.delete(p);
      }
    }
    const frame = stack.getItemFrame() as (Entity & HangingLike) | null;
    if (frame) this.updateMarker(1, player.worldObj, `frame-${frame.entityId}`, frame.xPosition ?? 0, frame.zPosition ?? 0, (frame.hangingDirection ?? 0) * 90);
  }

  /** func_82567_a: a marker inside the map (rotated in 16ths), or clamped to the edge as icon 6. */
  private updateMarker(icon: number, w: World, key: string, x: number, z: number, rotation: number): void {
    const k = 1 << this.scale;
    const mx = f(f(x - this.xCenter) / k);
    const mz = f(f(z - this.zCenter) / k);
    let cx = (Math.trunc(mx * 2 + 0.5) << 24) >> 24;
    let cz = (Math.trunc(mz * 2 + 0.5) << 24) >> 24;
    const edge = 63;
    let rot: number;
    if (mx >= -edge && mz >= -edge && mx <= edge && mz <= edge) {
      rotation += rotation < 0 ? -8 : 8;
      rot = (Math.trunc((rotation * 16) / 360) << 24) >> 24;
      if (this.dimension < 0) {
        const t = Math.trunc(w.getWorldTime() / 10);
        rot = ((Math.imul(Math.imul(t, t), 34187121) + Math.imul(t, 121)) >> 15) & 15;
      }
    } else {
      if (!(Math.abs(mx) < 320) || !(Math.abs(mz) < 320)) {
        this.playersVisibleOnMap.delete(key);
        return;
      }
      icon = 6;
      rot = 0;
      // (byte)128: a marker past the left / top edge wraps to -128, the far side of the byte.
      if (mx <= -edge) cx = (Math.trunc(edge * 2 + 2.5) << 24) >> 24;
      if (mz <= -edge) cz = (Math.trunc(edge * 2 + 2.5) << 24) >> 24;
      if (mx >= edge) cx = edge * 2 + 1;
      if (mz >= edge) cz = edge * 2 + 1;
    }
    this.playersVisibleOnMap.set(key, { iconSize: icon, centerX: cx, centerZ: cz, iconRotation: rot });
  }
}

/** Per-world item data (World.loadItemData / setItemData / getUniqueDataId) kept for the session. */
const worldData = new WeakMap<object, { data: Map<string, MapData>; ids: Map<string, number> }>();

function storage(w: IWorld): { data: Map<string, MapData>; ids: Map<string, number> } {
  let s = worldData.get(w);
  if (!s) worldData.set(w, (s = { data: new Map(), ids: new Map() }));
  return s;
}

/** World.getUniqueDataId: the next free number for "map_<n>" (0, 1, 2...). */
export function getUniqueDataId(w: IWorld, key: string): number {
  const s = storage(w);
  const n = s.ids.has(key) ? s.ids.get(key)! + 1 : 0;
  s.ids.set(key, n);
  return n;
}

export function loadMapData(w: IWorld, name: string): MapData | null {
  return storage(w).data.get(name) ?? null;
}

export function setMapData(w: IWorld, name: string, data: MapData): void {
  storage(w).data.set(name, data);
}

/** ItemMapBase: maps are drawn flat in the hand by ItemRenderer (isMap). */
export class ItemMapBase extends Item {
  override isMap(): boolean {
    return true;
  }
}

/** A filled map (ItemMap, damage = map number): draws the terrain around its centre while held. */
export class ItemMap extends ItemMapBase {
  constructor(index: number) {
    super(index);
    this.setHasSubtypes(true);
  }

  /** The map's data, creating a 1:8 map centred on the spawn for an unknown number (as 1.5.2). */
  getMapData(stack: ItemStack, w: IWorld): MapData {
    let data = loadMapData(w, 'map_' + stack.getItemDamage());
    if (!data && !w.isRemote) {
      stack.setItemDamage(getUniqueDataId(w, 'map'));
      const name = 'map_' + stack.getItemDamage();
      data = new MapData(name);
      data.scale = 3;
      const size = 128 * (1 << data.scale);
      const spawn = (w as World).getSpawnPoint();
      data.xCenter = Math.round(f(spawn.x / size)) * size;
      data.zCenter = Math.round(Math.trunc(spawn.z / size)) * size;
      data.dimension = w.provider.dimensionId;
      data.markDirty();
      setMapData(w, name, data);
    }
    return data!;
  }

  /** Redraws one sixteenth of the columns around the holder each tick (ItemMap.updateMapData). */
  updateMapData(w: World, holder: Entity, data: MapData): void {
    if (w.provider.dimensionId !== data.dimension || !holder.isPlayerEntity) return;
    const W = 128;
    const H = 128;
    const k = 1 << data.scale;
    const cx = data.xCenter;
    const cz = data.zCenter;
    const px = Math.trunc(MathHelper.floor_double(holder.posX - cx) / k) + W / 2;
    const pz = Math.trunc(MathHelper.floor_double(holder.posZ - cz) / k) + H / 2;
    let radius = Math.trunc(128 / k);
    if (w.provider.hasNoSky) radius = Math.trunc(radius / 2);
    const player = holder as EntityPlayer;
    const phase = (data.playerUpdateCounters.get(player) ?? 0) + 1;
    data.playerUpdateCounters.set(player, phase);
    for (let x = px - radius + 1; x < px + radius; x++) {
      if ((x & 15) !== (phase & 15)) continue;
      let minZ = 255;
      let maxZ = 0;
      let prevHeight = 0;
      for (let z = pz - radius - 1; z < pz + radius; z++) {
        if (!(x >= 0 && z >= -1 && x < W && z < H)) continue;
        const dx = x - px;
        const dz = z - pz;
        const rim = dx * dx + dz * dz > (radius - 2) * (radius - 2);
        const bx = (Math.trunc(cx / k) + x - W / 2) * k;
        const bz = (Math.trunc(cz / k) + z - H / 2) * k;
        const counts = new Int32Array(256);
        const chunk = w.getChunkFromBlockCoords(bx, bz);
        if (chunk.isEmpty()) continue;
        const ox = bx & 15;
        const oz = bz & 15;
        let waterDepth = 0;
        let height = 0;
        if (w.provider.hasNoSky) {
          let h = (bx + bz * 231871) | 0;
          h = (Math.imul(Math.imul(h, h), 31287121) + Math.imul(h, 11)) | 0;
          if (((h >> 20) & 1) === 0) counts[BlockIds.dirt] += 10;
          else counts[BlockIds.stone] += 10;
          height = 100;
        } else {
          for (let i = 0; i < k; i++) {
            for (let j = 0; j < k; j++) {
              let y = chunk.getHeightValue(i + ox, j + oz) + 1;
              let id = 0;
              if (y > 1) {
                let solid: boolean;
                do {
                  solid = true;
                  id = chunk.getBlockID(i + ox, y - 1, j + oz);
                  if (id === 0) solid = false;
                  else if (y > 0 && id > 0 && Block.blocksList[id]?.blockMaterial.materialMapColor === MapColor.airColor) solid = false;
                  if (!solid) {
                    if (--y <= 0) break;
                    id = chunk.getBlockID(i + ox, y - 1, j + oz);
                  }
                } while (y > 0 && !solid);
                if (y > 0 && id !== 0 && Block.blocksList[id]?.blockMaterial.isLiquid()) {
                  let yy = y - 1;
                  let below = 0;
                  do {
                    below = chunk.getBlockID(i + ox, yy--, j + oz);
                    waterDepth++;
                  } while (yy > 0 && below !== 0 && Block.blocksList[below]?.blockMaterial.isLiquid());
                }
              }
              height += y / (k * k);
              counts[id]++;
            }
          }
        }
        waterDepth = Math.trunc(waterDepth / (k * k));
        let best = 0;
        let bestId = 0;
        for (let id = 0; id < 256; id++) {
          if (counts[id] > best) {
            bestId = id;
            best = counts[id];
          }
        }
        let shadeV = ((height - prevHeight) * 4) / (k + 4) + (((x + z) & 1) - 0.5) * 0.4;
        let shade = 1;
        if (shadeV > 0.6) shade = 2;
        if (shadeV < -0.6) shade = 0;
        let color = 0;
        if (bestId > 0) {
          const mc = Block.blocksList[bestId]?.blockMaterial.materialMapColor ?? MapColor.airColor;
          if (mc === MapColor.waterColor) {
            shadeV = waterDepth * 0.1 + ((x + z) & 1) * 0.2;
            shade = 1;
            if (shadeV < 0.5) shade = 2;
            if (shadeV > 0.9) shade = 0;
          }
          color = mc.colorIndex;
        }
        prevHeight = height;
        if (z >= 0 && dx * dx + dz * dz < radius * radius && (!rim || ((x + z) & 1) !== 0)) {
          const v = (color * 4 + shade) & 255;
          if (data.colors[x + z * W] !== v) {
            if (minZ > z) minZ = z;
            if (maxZ < z) maxZ = z;
            data.colors[x + z * W] = v;
          }
        }
      }
      if (minZ <= maxZ) data.setColumnDirty(x, minZ, maxZ);
    }
  }

  override onUpdate(stack: ItemStack, w: IWorld, e: Entity, _slot: number, held: boolean): void {
    if (w.isRemote) return;
    const data = this.getMapData(stack, w);
    if (e.isPlayerEntity) data.updateVisiblePlayers(e as EntityPlayer, stack);
    if (held) this.updateMapData(w as World, e, data);
  }

  /** A map crafted with paper around it ("map_is_scaling") becomes a new map one scale larger. */
  override onCreated(stack: ItemStack, w: IWorld, _player: EntityPlayer): void {
    const tag = stack.getTagCompound();
    if (!tag || !tag.map_is_scaling) return;
    const old = this.getMapData(stack, w);
    stack.setItemDamage(getUniqueDataId(w, 'map'));
    const data = new MapData('map_' + stack.getItemDamage());
    data.scale = Math.min(old.scale + 1, 4);
    data.xCenter = old.xCenter;
    data.zCenter = old.zCenter;
    data.dimension = old.dimension;
    data.markDirty();
    setMapData(w, 'map_' + stack.getItemDamage(), data);
  }

  /** With advanced tooltips (F3+H): "Scaling at 1:8", "(Level 3/4)". */
  override addInformation(stack: ItemStack, player: EntityPlayer | null, lines: string[], advanced: boolean): void {
    if (!advanced || !player) return;
    const data = loadMapData(player.worldObj, 'map_' + stack.getItemDamage());
    if (!data) {
      lines.push('Unknown map');
    } else {
      lines.push('Scaling at 1:' + (1 << data.scale));
      lines.push('(Level ' + data.scale + '/4)');
    }
  }
}

/** The empty map: right click makes a new 1:1 map centred on the player's 128-block cell. */
export class ItemEmptyMap extends ItemMapBase {
  constructor(index: number) {
    super(index);
    this.setCreativeTab(CreativeTabs.tabMisc);
  }
  override onItemRightClick(stack: ItemStack, w: IWorld, player: EntityPlayer): ItemStack {
    const map = new ItemStack(ItemIds.map, 1, getUniqueDataId(w, 'map'));
    const name = 'map_' + map.getItemDamage();
    const data = new MapData(name);
    setMapData(w, name, data);
    data.scale = 0;
    const size = 128 * (1 << data.scale);
    data.xCenter = Math.round(player.posX / size) * size;
    data.zCenter = Math.round(player.posZ / size) * size;
    data.dimension = w.provider.dimensionId;
    data.markDirty();
    stack.stackSize--;
    if (stack.stackSize <= 0) return map;
    if (!player.inventory.addItemStackToInventory(map.copy())) player.dropPlayerItem(map);
    return stack;
  }
}
