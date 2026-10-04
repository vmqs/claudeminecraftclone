import type { EntityPlayer } from '../entity/EntityPlayer';
import { GuiDownloadTerrain } from '../gui/GuiDownloadTerrain';
import type { GuiScreen } from '../gui/GuiScreen';
import { END_SKY_TEXTURE } from '../render/sky/DimensionSky';
import { AchievementIds } from '../stats/StatIds';
import type { LoadedDimension } from '../world/DimensionManager';
import { serverPosY } from '../world/Teleporter';
import type { EntityPlayerSP } from './EntityPlayerSP';
import type { Minecraft } from './Minecraft';

/** A trip through a portal waiting for the destination's chunks. */
interface PendingArrival {
  dim: number;
  fromX: number;
  fromY: number;
  fromZ: number;
  fromYaw: number;
  /** The Teleporter places the player (not when leaving the End for the End). */
  place: boolean;
  /** Arriving in the End: the platform is built, no portal is searched for. */
  entrance: boolean;
}

/** A respawn in the overworld after dying (or winning) in another dimension. */
interface PendingRespawn {
  old: EntityPlayerSP;
  keepEverything: boolean;
}

type ScreenClass = new () => GuiScreen;

let winScreenClass: ScreenClass | null | undefined;

/** GuiWinGame of this build (the End's credits), when it exists (Vite resolves the glob at build time). */
function findWinScreen(): ScreenClass | null {
  if (winScreenClass !== undefined) return winScreenClass;
  winScreenClass = null;
  try {
    const mods = import.meta.glob<Record<string, unknown>>('../gui/GuiWinGame.ts', { eager: true });
    for (const m of Object.values(mods)) if (typeof m.GuiWinGame === 'function') winScreenClass = m.GuiWinGame as ScreenClass;
  } catch {
    // Not built by Vite.
  }
  return winScreenClass;
}

/**
 * The client player's dimension changes in single player and on a LAN host
 * (EntityPlayerMP.travelToDimension + ServerConfigurationManager.transferPlayerToDimension on the
 * integrated server, NetClientHandler.handleRespawn on the client): the player leaves its world
 * at once, the client switches to the destination's world behind "Downloading terrain", and
 * once the chunks around the arrival point are there the Teleporter places it. Dying (or
 * finishing the End) outside the overworld respawns there the same way.
 */
export class PlayerTravel {
  /** Screen that ends the game in the End (GuiWinGame); set by the End's code, else found by name. */
  static winGameScreen: (() => GuiScreen) | null = null;

  private requested: number | null = null;
  arrival: PendingArrival | null = null;
  respawn: PendingRespawn | null = null;
  /** playerConqueredTheEnd: the win screen is up; the respawn follows when it closes. */
  private winScreen: GuiScreen | null = null;

  constructor(private readonly mc: Minecraft) {}

  /** Whether a dimension change is under way. */
  get busy(): boolean {
    return this.arrival !== null || this.respawn !== null || this.winScreen !== null;
  }

  /** Forgets everything (leaving the world). */
  reset(): void {
    this.requested = null;
    this.arrival = null;
    this.respawn = null;
    this.winScreen = null;
  }

  /** Entity.travelToDimension of the client's own player: carried out after the worlds' tick. */
  request(dim: number): void {
    if (!this.busy) this.requested = dim;
  }

  /** Where the client's chunks are loaded while the player travels (else around the player). */
  loadCenter(): { dim: number; x: number; z: number } | null {
    if (this.respawn) {
      const info = this.mc.dimensions?.info;
      return info ? { dim: 0, x: info.spawnX, z: info.spawnZ } : null;
    }
    return null;
  }

  /** Once per tick, after the worlds ticked. */
  tick(): void {
    if (this.requested !== null) {
      const d = this.requested;
      this.requested = null;
      this.travel(d);
    }
    if (this.winScreen && this.mc.currentScreen !== this.winScreen) {
      // The credits were closed (GuiWinGame.respawnPlayer): back to the overworld with everything.
      this.winScreen = null;
      this.mc.respawnPlayer(true);
    }
    if (this.arrival) this.tryArrive();
    if (this.respawn) this.tryRespawn();
  }

  /** EntityPlayerMP.travelToDimension for the client's player. */
  private travel(target: number): void {
    const mc = this.mc;
    const p = mc.thePlayer;
    if (!p || !mc.dimensions || p.isDead || this.busy) return;
    const from = p.dimension;
    if (from === 1 && target === 1) {
      // The exit portal: "The End." and the credits; the player leaves the End.
      p.triggerAchievement(AchievementIds.theEnd2);
      p.worldObj.removeEntity(p);
      const make = PlayerTravel.winGameScreen ?? (() => {
        const cls = findWinScreen();
        return cls ? new cls() : null;
      });
      const screen = make();
      if (screen) {
        this.winScreen = screen;
        mc.displayGuiScreen(screen);
      } else {
        mc.respawnPlayer(true);
      }
      return;
    }
    // As in the 1.5.2 bytecode: "The End?" only for the End -> overworld case, every other
    // trip (the End's entrance included) counts as "We Need to Go Deeper".
    if (from === 1 && target === 0) {
      p.triggerAchievement(AchievementIds.theEnd);
      target = 1;
    } else {
      p.triggerAchievement(AchievementIds.portal);
    }
    this.transfer(p, target);
  }

  /** ServerConfigurationManager.transferPlayerToDimension, up to the Teleporter's placement. */
  private transfer(p: EntityPlayerSP, to: number): void {
    const mc = this.mc;
    const mgr = mc.dimensions!;
    const from = p.dimension;
    const fromX = p.posX;
    const fromY = serverPosY(p);
    const fromZ = p.posZ;
    const fromYaw = p.rotationYaw;
    p.worldObj.removePlayerEntityDangerously(p);
    p.isDead = false;
    const a = mgr.arrivalPoint(p, from, to);
    const d = mgr.load(to);
    p.dimension = to;
    p.setWorld(d.world);
    p.setLocationAndAngles(a.x, a.y, a.z, a.yaw, a.pitch);
    p.motionX = p.motionY = p.motionZ = 0;
    this.arrival = { dim: to, fromX, fromY, fromZ, fromYaw, place: a.place, entrance: a.entrance };
    if (to === 1) void mc.renderEngine.preload([END_SKY_TEXTURE]);
    this.showWorld(d);
  }

  /** The client half (NetClientHandler.handleRespawn): the new world behind "Downloading terrain". */
  private showWorld(d: LoadedDimension): void {
    const mc = this.mc;
    mc.enterDimensionWorld(d);
    mc.displayGuiScreen(
      new GuiDownloadTerrain(() => {
        const p = mc.thePlayer;
        if (!p || this.arrival || this.respawn) return false;
        const provider = mc.chunkProvider;
        if (provider && !provider.areaLoaded(p.posX, p.posZ, 2)) return false;
        return mc.renderGlobal.pendingNear(p, 1) === 0;
      }),
    );
  }

  /** transferEntityToWorld's second half once the chunks are there: into the world, then the Teleporter. */
  private tryArrive(): void {
    const mc = this.mc;
    const a = this.arrival!;
    const p = mc.thePlayer;
    const mgr = mc.dimensions;
    if (!p || !mgr) {
      this.arrival = null;
      return;
    }
    if (!mgr.arrivalReady(a.dim, p.posX, p.posZ, a.place && !a.entrance)) return;
    const w = mgr.getWorld(a.dim)!;
    w.spawnEntityInWorld(p);
    w.updateEntityWithOptionalForce(p, false);
    if (a.place) mgr.teleporter(a.dim).placeInPortal(p, a.fromX, a.fromY, a.fromZ, a.fromYaw);
    mgr.releaseArrival(a.dim);
    // The client gets a new player (setDimensionAndSpawnPlayer): standing still, no swirl.
    p.motionX = p.motionY = p.motionZ = 0;
    p.timeInPortal = p.prevTimeInPortal = 0;
    p.clientInPortal = false;
    p.prevRotationYaw = p.rotationYaw;
    p.prevRotationPitch = p.rotationPitch;
    p.rotationYawHead = p.prevRotationYawHead = p.rotationYaw;
    p.renderYawOffset = p.prevRenderYawOffset = p.rotationYaw;
    w.updateEntityWithOptionalForce(p, false);
    this.arrival = null;
  }

  /**
   * respawnPlayer(player, 0, keepEverything) for a player outside the overworld: the overworld
   * comes back first; the new player appears once its spawn area is loaded.
   */
  startRespawn(old: EntityPlayerSP, keepEverything: boolean): void {
    const mgr = this.mc.dimensions!;
    old.worldObj.removePlayerEntityDangerously(old);
    this.respawn = { old, keepEverything };
    this.showWorld(mgr.load(0));
  }

  private tryRespawn(): void {
    const mc = this.mc;
    const r = this.respawn!;
    const mgr = mc.dimensions;
    if (!mgr) {
      this.respawn = null;
      return;
    }
    const info = mgr.info;
    const w = mgr.getWorld(0);
    if (!w || !mgr.isReady(0)) return;
    const cx = info.spawnX >> 4;
    const cz = info.spawnZ >> 4;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (!w.chunkExists(cx + dx, cz + dz)) return;
    // The bed's chunks from the save (the server loaded them to check the bed).
    const bed = r.old.getBedLocation();
    const provider = mgr.get(0)?.provider;
    if (bed && provider && !provider.requestSavedArea(bed.posX >> 4, bed.posZ >> 4, 1)) return;
    this.respawn = null;
    mc.finishRespawn(r.old, w, r.keepEverything);
  }

  /** Whether `p` is the player whose trip or respawn is under way. */
  owns(p: EntityPlayer): boolean {
    return p === this.mc.thePlayer;
  }
}
