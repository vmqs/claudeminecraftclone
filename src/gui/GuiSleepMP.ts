import { Keys } from '../client/Keyboard';
import { I18n } from '../core/I18n';
import { GuiButton } from './GuiButton';
import { GuiChat } from './GuiChat';

/** The chat screen shown while lying in a bed, with "Leave Bed" (GuiSleepMP). */
export class GuiSleepMP extends GuiChat {
  override initGui(): void {
    super.initGui();
    this.buttonList.push(new GuiButton(1, Math.trunc(this.width / 2) - 100, this.height - 40, I18n.translateToLocal('multiplayer.stopSleeping')));
  }

  protected override keyTyped(ch: string, key: number): void {
    if (key === Keys.ESCAPE) {
      this.wakeEntity();
    } else if (key === Keys.RETURN) {
      const msg = this.inputField.getText().trim();
      if (msg.length > 0) this.mc.thePlayer!.sendChatMessage(msg);
      this.inputField.setText('');
      this.mc.ingameGUI.getChatGUI().resetScroll();
    } else {
      super.keyTyped(ch, key);
    }
  }

  protected override actionPerformed(b: GuiButton): void {
    if (b.id === 1) this.wakeEntity();
    else super.actionPerformed(b);
  }

  /** Packet19EntityAction 3: the server wakes the player (wakeUpPlayer(false, true, true)). */
  private wakeEntity(): void {
    const p = this.mc.thePlayer as unknown as { wakeUpPlayer?(immediately: boolean, updateWorld: boolean, setSpawn: boolean): void } | null;
    p?.wakeUpPlayer?.(false, true, true);
  }
}
