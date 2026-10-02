import type { PlayerCapabilities } from '../entity/PlayerCapabilities';

/**
 * The game modes (EnumGameType): their id, their name (as used by /gamemode, the lang keys
 * `gameMode.<name>` and Create World), and the capabilities each one gives a player.
 * Worker-safe: no DOM.
 */
export class EnumGameType {
  static readonly NOT_SET = new EnumGameType(-1, '');
  static readonly SURVIVAL = new EnumGameType(0, 'survival');
  static readonly CREATIVE = new EnumGameType(1, 'creative');
  static readonly ADVENTURE = new EnumGameType(2, 'adventure');
  static readonly values: readonly EnumGameType[] = [EnumGameType.NOT_SET, EnumGameType.SURVIVAL, EnumGameType.CREATIVE, EnumGameType.ADVENTURE];

  private constructor(
    readonly id: number,
    readonly name: string,
  ) {}

  getID(): number {
    return this.id;
  }

  getName(): string {
    return this.name;
  }

  /**
   * Creative may fly, builds instantly and takes no damage; every other mode loses those (and
   * stops flying). Adventure players cannot edit the world.
   */
  configurePlayerCapabilities(caps: PlayerCapabilities): void {
    if (this === EnumGameType.CREATIVE) {
      caps.allowFlying = true;
      caps.isCreativeMode = true;
      caps.disableDamage = true;
    } else {
      caps.allowFlying = false;
      caps.isCreativeMode = false;
      caps.disableDamage = false;
      caps.isFlying = false;
    }
    caps.allowEdit = !this.isAdventure();
  }

  isAdventure(): boolean {
    return this === EnumGameType.ADVENTURE;
  }

  isCreative(): boolean {
    return this === EnumGameType.CREATIVE;
  }

  isSurvivalOrAdventure(): boolean {
    return this === EnumGameType.SURVIVAL || this === EnumGameType.ADVENTURE;
  }

  /** Unknown ids fall back to Survival, as in 1.5.2. */
  static getByID(id: number): EnumGameType {
    for (const t of EnumGameType.values) if (t.id === id) return t;
    return EnumGameType.SURVIVAL;
  }

  /** Unknown names (including "hardcore") fall back to Survival, as in 1.5.2. */
  static getByName(name: string): EnumGameType {
    for (const t of EnumGameType.values) if (t.name === name) return t;
    return EnumGameType.SURVIVAL;
  }
}
