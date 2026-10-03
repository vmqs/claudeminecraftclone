import { Block } from '../block/Block';
import { BlockBed } from '../block/BlockBed';
import { BlockIds } from '../block/BlockIds';
import { EntityOtherPlayerMP } from '../entity/EntityOtherPlayerMP';
import { Item } from '../item/Item';
import { ItemArmor } from '../item/ItemArmor';
import { ItemStack } from '../item/ItemStack';
import { PotionEffect } from '../potion/PotionEffect';
import type { Minecraft } from './Minecraft';

/** Options of `mc.dev.player.otherPlayer` (the reference harness's `otherplayer`). */
export interface OtherPlayerOptions {
  pitch?: number;
  /** Held item id, or [id, damage]. */
  held?: number | [number, number];
  /** Armour ids boots, legs, chest, helmet (0 = none; a block id such as the pumpkin works too). */
  armor?: number[];
  /** Dye colour (0xRRGGBB) of leather pieces. */
  color?: number;
  sneak?: boolean;
  /** Item use ticks left (a bow drawn for n ticks: 72000 - n; a sword blocks with any count). */
  use?: number;
  /** Lie down in the bed whose head is at [x, y, z]. */
  bed?: [number, number, number];
}

/**
 * Player helpers on `mc.dev.player` (scripts/scenarios/player.json): armour, item use, potion
 * effects, beds, and other players posed like the reference harness's `otherplayer`.
 */
export class PlayerDevTools {
  private readonly others: EntityOtherPlayerMP[] = [];

  constructor(private readonly mc: Minecraft) {}

  private stack(id: number, damage = 0, color?: number): ItemStack {
    const s = new ItemStack(id, 1, damage);
    const item = Item.itemsList[id];
    if (color !== undefined && item instanceof ItemArmor && item.getArmorInfo().isCloth) item.setColor(s, color);
    return s;
  }

  /** Puts `id` in armour slot `slot` (0 boots ... 3 helmet; 0 = empty), dyed `color` if leather. */
  armor(slot: number, id: number, color?: number): void {
    const p = this.mc.thePlayer;
    if (p) p.inventory.armorInventory[slot] = id === 0 ? null : this.stack(id, 0, color);
  }

  /** Starts using the held item with `count` ticks left. */
  use(count: number): void {
    const p = this.mc.thePlayer;
    const held = p?.inventory.getCurrentItem();
    if (p && held) p.setItemInUse(held, count);
  }

  /** Adds a potion effect like /effect (seconds, amplifier). */
  effect(id: number, seconds: number, amplifier = 0): void {
    this.mc.thePlayer?.addPotionEffect(new PotionEffect(id, Math.round(seconds * 20), amplifier));
  }

  /** Places a bed with its foot at (x, y, z) and its head one block towards `dir` (0 south, 1 west, 2 north, 3 east). */
  bed(x: number, y: number, z: number, dir: number): void {
    const w = this.mc.theWorld;
    if (!w) return;
    const [dx, dz] = BlockBed.footBlockToHeadBlockMap[dir];
    w.setBlock(x, y, z, BlockIds.bed, dir, 3);
    w.setBlock(x + dx, y, z + dz, BlockIds.bed, dir | 8, 3);
  }

  /** Right-clicks the bed block at (x, y, z) as the player; true when the player lies down. */
  sleepIn(x: number, y: number, z: number): boolean {
    const w = this.mc.theWorld;
    const p = this.mc.thePlayer;
    if (!w || !p) return false;
    Block.blocksList[BlockIds.bed]!.onBlockActivated(w, x, y, z, p, 0, 0, 0, 0);
    return p.isPlayerSleeping();
  }

  /** Another player at (x, y, z) (feet) facing `yaw`, posed and equipped as asked. Not ticked while the clock is pinned. */
  otherPlayer(name: string, x: number, y: number, z: number, yaw: number, o: OtherPlayerOptions = {}): EntityOtherPlayerMP | null {
    const w = this.mc.theWorld;
    if (!w) return null;
    const e = new EntityOtherPlayerMP(w, name);
    const pitch = o.pitch ?? 0;
    e.setLocationAndAngles(x, y, z, yaw, pitch);
    e.prevRotationYaw = yaw;
    e.prevRotationPitch = pitch;
    e.rotationYawHead = e.prevRotationYawHead = yaw;
    e.renderYawOffset = e.prevRenderYawOffset = yaw;
    e.onGround = true;
    if (o.held !== undefined) {
      const [id, damage] = typeof o.held === 'number' ? [o.held, 0] : o.held;
      e.inventory.mainInventory[e.inventory.currentItem] = this.stack(id, damage);
    }
    o.armor?.forEach((id, i) => {
      if (id !== 0) e.inventory.armorInventory[i] = this.stack(id, 0, o.color);
    });
    if (o.sneak) e.setSneaking(true);
    const held = e.inventory.getCurrentItem();
    if (o.use !== undefined && held) e.setItemInUse(held, o.use);
    w.spawnEntityInWorld(e);
    if (o.bed) {
      e.sleepInBedAt(o.bed[0], o.bed[1], o.bed[2]);
      e.prevPosX = e.lastTickPosX = e.posX;
      e.prevPosY = e.lastTickPosY = e.posY;
      e.prevPosZ = e.lastTickPosZ = e.posZ;
    }
    this.others.push(e);
    return e;
  }

  /** Removes the players made by otherPlayer. */
  clearOthers(): void {
    for (const e of this.others) this.mc.theWorld?.removeEntity(e);
    this.others.length = 0;
  }

  /** The player's sleep, position, effects and FOV state (for scenario logs and checks). */
  state(): Record<string, unknown> {
    const p = this.mc.thePlayer;
    const w = this.mc.theWorld;
    if (!p || !w) return {};
    return {
      sleeping: p.isPlayerSleeping(),
      sleepTimer: p.getSleepTimer(),
      pos: [p.posX, p.posY, p.posZ],
      yOffset: p.yOffset,
      bed: p.getBedLocation(),
      screen: this.mc.currentScreen?.constructor.name ?? 'none',
      time: w.getWorldTime(),
      effects: p.getActivePotionEffects().map((e) => `${e.getPotionID()}/${e.getAmplifier()}/${e.getDuration()}`),
      fov: p.getFOVMultiplier(),
      timeInPortal: p.timeInPortal,
      invisible: p.isInvisible(),
    };
  }
}
