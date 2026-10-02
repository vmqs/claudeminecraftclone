import type { EntityPlayer } from '../entity/EntityPlayer';
import type { IInventory } from '../gui/inventory/IInventory';
import type { IWorld } from '../world/IWorld';
import type { TileEntity } from '../world/tileentity/TileEntity';

/** The block GUIs of 1.5.2, by what the block opens. */
export type BlockGuiKind =
  | 'chest'
  | 'enderChest'
  | 'workbench'
  | 'furnace'
  | 'dispenser'
  | 'dropper'
  | 'hopper'
  | 'brewingStand'
  | 'enchantment'
  | 'anvil'
  | 'beacon'
  | 'sign'
  | 'commandBlock';

/** What an activated block asks to open. */
export interface BlockGuiRequest {
  readonly kind: BlockGuiKind;
  readonly player: EntityPlayer;
  readonly world: IWorld;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The inventory to show (chests: the single or large chest; ender chest: the player's ender inventory). */
  readonly inventory?: IInventory;
  /** The block's tile entity (furnace, dispenser, sign, command block, ...). */
  readonly tileEntity?: TileEntity | null;
  /** Custom name of the enchanting table (from a renamed item), or null. */
  readonly customName?: string | null;
}

export type BlockGuiHandler = (req: BlockGuiRequest) => boolean | void;

/**
 * Where blocks open their screens. A block's onBlockActivated calls `BlockGuiHooks.open`;
 * the inventory code registers a handler per kind (`BlockGuiHooks.register('furnace', ...)`).
 * Without a handler the request goes to the player's displayGUI* method, as in 1.5.2
 * (EntityPlayerSP overrides the ones whose screens exist).
 *
 * Worker-safe: type imports only.
 */
export class BlockGuiHooks {
  private static readonly handlers = new Map<BlockGuiKind, BlockGuiHandler>();

  static register(kind: BlockGuiKind, handler: BlockGuiHandler): void {
    BlockGuiHooks.handlers.set(kind, handler);
  }

  static unregister(kind: BlockGuiKind): void {
    BlockGuiHooks.handlers.delete(kind);
  }

  static hasHandler(kind: BlockGuiKind): boolean {
    return BlockGuiHooks.handlers.has(kind);
  }

  /** Opens the GUI; always returns true (the click was used), like the original blocks. */
  static open(req: BlockGuiRequest): boolean {
    const h = BlockGuiHooks.handlers.get(req.kind);
    if (h) {
      h(req);
      return true;
    }
    const p = req.player;
    const inv = (req.inventory ?? (req.tileEntity as unknown as IInventory | null | undefined)) || null;
    switch (req.kind) {
      case 'chest':
      case 'enderChest':
        if (inv) p.displayGUIChest(inv);
        break;
      case 'workbench':
        p.displayGUIWorkbench(req.x, req.y, req.z);
        break;
      case 'furnace':
        if (inv) p.displayGUIFurnace(inv);
        break;
      case 'dispenser':
      case 'dropper':
        if (inv) p.displayGUIDispenser(inv);
        break;
      case 'hopper':
        if (inv) p.displayGUIHopper(inv);
        break;
      case 'brewingStand':
        if (inv) p.displayGUIBrewingStand(inv);
        break;
      case 'enchantment':
        p.displayGUIEnchantment(req.x, req.y, req.z, req.customName ?? null);
        break;
      case 'anvil':
        p.displayGUIAnvil(req.x, req.y, req.z);
        break;
      case 'beacon':
        if (inv) p.displayGUIBeacon(inv);
        break;
      case 'sign':
      case 'commandBlock':
        if (req.tileEntity) p.displayGUIEditSign(req.tileEntity);
        break;
    }
    return true;
  }
}
