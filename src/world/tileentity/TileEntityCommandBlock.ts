import type { TagCompound } from '../../item/ItemStack';
import { nbt } from './InventoryNBT';
import { TileEntity } from './TileEntity';

/** Runs a command as a command block; installed by the command code. Returns the success count. */
export type CommandBlockExecutor = (te: TileEntityCommandBlock, command: string) => number;

/** A command block (TileEntityCommandBlock, "Control"): the command and its sender name. */
export class TileEntityCommandBlock extends TileEntity {
  static executor: CommandBlockExecutor | null = null;
  private succesCount = 0;
  private command = '';
  private commandSenderName = '@';

  setCommand(cmd: string): void {
    this.command = cmd;
    this.onInventoryChanged();
  }

  getCommand(): string {
    return this.command;
  }

  /** Runs the command when powered (needs the command code's executor). */
  executeCommandOnPowered(): number {
    const w = this.worldObj;
    if (!w || w.isRemote) return 0;
    return TileEntityCommandBlock.executor?.(this, this.command) ?? 0;
  }

  getCommandSenderName(): string {
    return this.commandSenderName;
  }

  setCommandSenderName(name: string): void {
    this.commandSenderName = name;
  }

  sendChatToPlayer(_msg: string): void {}

  canCommandSenderUseCommand(level: number, _command: string): boolean {
    return level <= 2;
  }

  translateString(key: string): string {
    return key;
  }

  getPlayerCoordinates(): { posX: number; posY: number; posZ: number } {
    return { posX: this.xCoord, posY: this.yCoord, posZ: this.zCoord };
  }

  override writeToNBT(tag: TagCompound): void {
    super.writeToNBT(tag);
    tag.Command = this.command;
    tag.SuccessCount = this.succesCount;
    tag.CustomName = this.commandSenderName;
  }

  override readFromNBT(tag: TagCompound): void {
    super.readFromNBT(tag);
    this.command = nbt.getString(tag, 'Command');
    this.succesCount = nbt.getInt(tag, 'SuccessCount');
    if (nbt.hasKey(tag, 'CustomName')) this.commandSenderName = nbt.getString(tag, 'CustomName');
  }

  /** func_96103_d: what a comparator reads. */
  getSuccessCount(): number {
    return this.succesCount;
  }

  /** func_96102_a */
  setSuccessCount(n: number): void {
    this.succesCount = n;
  }
}
