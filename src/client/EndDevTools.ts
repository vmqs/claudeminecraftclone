import { Block } from '../block/Block';
import { BlockIds, ItemIds } from '../block/BlockIds';
import type { BlockSkull } from '../block/BlockSkull';
import { DamageSource } from '../entity/DamageSource';
import { EntityDragon } from '../entity/EntityDragon';
import { EntityEnderCrystal } from '../entity/EntityEnderCrystal';
import { EntityWither } from '../entity/EntityWither';
import { BossStatus } from '../gui/BossStatus';
import { screenFactories } from '../gui/GuiDebugScreens';
import { GuiWinGame } from '../gui/GuiWinGame';
import { Item } from '../item/Item';
import { ItemStack } from '../item/ItemStack';
import { TileEntitySkull } from '../world/tileentity/TileEntitySkull';
import type { Minecraft } from './Minecraft';
import { conquerTheEnd } from './WinGame';

screenFactories.set('wingame', () => new GuiWinGame());

/**
 * End and boss helpers on `mc.dev.end` (scripts/scenarios/end.json): the dragon and crystals of
 * the loaded world, posing and killing the dragon, the exit portal and credits, building a
 * Wither and end portal frames.
 */
export class EndDevTools {
  constructor(private readonly mc: Minecraft) {}

  dragon(): EntityDragon | null {
    return (this.mc.theWorld?.loadedEntityList.find((e) => e instanceof EntityDragon && !e.isDead) as EntityDragon | undefined) ?? null;
  }

  wither(): EntityWither | null {
    return (this.mc.theWorld?.loadedEntityList.find((e) => e instanceof EntityWither && !e.isDead) as EntityWither | undefined) ?? null;
  }

  crystals(): { x: number; y: number; z: number }[] {
    return (this.mc.theWorld?.loadedEntityList.filter((e) => e instanceof EntityEnderCrystal && !e.isDead) ?? []).map((e) => ({ x: e.posX, y: e.posY, z: e.posZ }));
  }

  /** What a scenario checks: the bosses, the crystals, the boss bar and the open screen. */
  state(): Record<string, unknown> {
    const d = this.dragon();
    const wi = this.wither();
    const scr = this.mc.currentScreen;
    return {
      dimension: this.mc.theWorld?.provider.dimensionId ?? null,
      dragon: d && {
        x: d.posX,
        y: d.posY,
        z: d.posZ,
        yaw: d.rotationYaw,
        health: d.getHealth(),
        boss: d.getBossHealth(),
        deathTicks: d.deathTicks,
        healing: d.healingEnderCrystal !== null,
        parts: d.dragonPartArray.map((p) => [p.name, p.posX, p.posY, p.posZ, p.width, p.height]),
      },
      crystals: this.crystals().length,
      wither: wi && { x: wi.posX, y: wi.posY, z: wi.posZ, health: wi.getHealth(), invul: wi.getInvulTime(), armored: wi.isArmored(), targets: [...wi.watchedTargets], texture: wi.getTexture() },
      bossBar: { name: BossStatus.bossName, scale: BossStatus.healthScale, length: BossStatus.statusBarLength },
      screen: scr instanceof GuiWinGame ? 'wingame' : scr ? 'other' : null,
      conquered: this.mc.thePlayer?.playerConqueredTheEnd ?? false,
    };
  }

  /**
   * Puts the dragon at (x, y, z) facing `yaw`, level and still, with its parts laid out, for a
   * capture of a frozen game (mc.dev.sky.pin): the ring buffer is refilled from the pose.
   */
  poseDragon(x: number, y: number, z: number, yaw: number, animTime = 0.25): boolean {
    const d = this.dragon();
    if (!d) return false;
    d.setLocationAndAngles(x, y, z, yaw, 0);
    d.motionX = d.motionY = d.motionZ = 0;
    d.renderYawOffset = d.prevRenderYawOffset = yaw;
    d.ringBufferIndex = -1;
    d.animTime = d.prevAnimTime = animTime;
    d.updateClientState();
    d.animTime = d.prevAnimTime = animTime;
    d.prevPosX = d.lastTickPosX = d.posX;
    d.prevPosY = d.lastTickPosY = d.posY;
    d.prevPosZ = d.lastTickPosZ = d.posZ;
    d.prevRotationYaw = d.rotationYaw = yaw;
    return true;
  }

  /** Links the dragon to the nearest crystal (the beam) without waiting for its 1-in-10 search. */
  linkNearestCrystal(): boolean {
    const d = this.dragon();
    const w = this.mc.theWorld;
    if (!d || !w) return false;
    let best: EntityEnderCrystal | null = null;
    for (const e of w.loadedEntityList) if (e instanceof EntityEnderCrystal && !e.isDead && (!best || e.getDistanceSqToEntity(d) < best.getDistanceSqToEntity(d))) best = e;
    d.healingEnderCrystal = best;
    return best !== null;
  }

  /** A lethal explosion on the head (like the dragon's death by bed or crystal). */
  killDragon(): boolean {
    const d = this.dragon();
    if (!d) return false;
    (d as unknown as { hurtResistantTime: number }).hurtResistantTime = 0;
    d.dragonPartHead.attackEntityFrom(DamageSource.setExplosionSource(null), 10000);
    return d.getHealth() <= 0;
  }

  /** Walks the local player into the exit portal (EndPortalHooks.enterExitPortal). */
  exitPortal(): void {
    if (this.mc.thePlayer) conquerTheEnd(this.mc.thePlayer);
  }

  /** Advances the open credits by `n` screen ticks (they count only while the game runs). */
  creditsTicks(n: number): number {
    const s = this.mc.currentScreen;
    if (!(s instanceof GuiWinGame)) return -1;
    for (let i = 0; i < n && this.mc.currentScreen === s; i++) s.updateScreen();
    return n;
  }

  /**
   * Builds the Wither's T of soul sand at (x..x+2, y..y+1, z) with three wither skeleton skulls
   * on top, the last placed like ItemSkull does (BlockSkull.makeWither).
   */
  buildWither(x: number, y: number, z: number): EntityWither | null {
    const w = this.mc.theWorld;
    if (!w) return null;
    for (let i = 0; i < 3; i++) w.setBlock(x + i, y + 1, z, BlockIds.slowSand);
    w.setBlock(x + 1, y, z, BlockIds.slowSand);
    let te: TileEntitySkull | null = null;
    for (let i = 0; i < 3; i++) {
      w.setBlock(x + i, y + 2, z, BlockIds.skull, 1);
      te = w.getBlockTileEntity(x + i, y + 2, z) as TileEntitySkull | null;
      if (te instanceof TileEntitySkull) te.setSkullType(1, '');
    }
    if (te) (Block.blocksList[BlockIds.skull] as BlockSkull).makeWither(w, x + 2, y + 2, z, te);
    return this.wither();
  }

  /**
   * A stronghold portal room's ring of 12 frames around the 3x3 at (x+1..x+3, y, z+1..z+3),
   * each facing inwards; the first `eyes` already filled.
   */
  frames(x: number, y: number, z: number, eyes = 0): void {
    const w = this.mc.theWorld;
    if (!w) return;
    let n = 0;
    for (let i = 1; i <= 3; i++) {
      for (const [fx, fz, dir] of [[x + i, z, 0], [x + i, z + 4, 2], [x, z + i, 3], [x + 4, z + i, 1]]) {
        w.setBlock(fx, y, fz, BlockIds.endPortalFrame, dir | (n++ < eyes ? 4 : 0));
      }
    }
  }

  /** Uses an eye of ender on the frame at (x, y, z) as the player (ItemEnderEye.onItemUse). */
  insertEye(x: number, y: number, z: number): boolean {
    const w = this.mc.theWorld;
    const p = this.mc.thePlayer;
    if (!w || !p) return false;
    return Item.itemsList[ItemIds.eyeOfEnder]!.onItemUse(new ItemStack(ItemIds.eyeOfEnder, 1, 0), p, w, x, y, z, 1, 0.5, 1, 0.5);
  }
}
