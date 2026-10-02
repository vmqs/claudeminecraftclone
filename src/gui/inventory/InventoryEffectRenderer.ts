import { I18n } from '../../core/I18n';
import type { PotionEffectLike } from '../../entity/PotionEffects';
import { Potion } from '../../potion/Potion';
import type { PotionEffect } from '../../potion/PotionEffect';
import { GL } from '../../render/gl/GL';
import type { Container } from './Container';
import { GuiContainer } from './GuiContainer';

const ROMAN = ['', ' II', ' III', ' IV'];

/**
 * The active potion effects of the player, read without requiring the living entity to expose
 * them publicly yet (getActivePotionEffects, falling back to the activePotionsMap field).
 */
export function activePotionEffects(player: object): PotionEffectLike[] {
  const p = player as { getActivePotionEffects?: () => Iterable<PotionEffectLike>; activePotionsMap?: Map<number, PotionEffectLike> };
  if (typeof p.getActivePotionEffects === 'function') return [...p.getActivePotionEffects()];
  return p.activePotionsMap ? [...p.activePotionsMap.values()] : [];
}

/**
 * A container screen that lists the player's active potion effects to the left of the window
 * (InventoryEffectRenderer): with any effect active the window moves right to make room.
 */
export abstract class InventoryEffectRenderer extends GuiContainer {
  private hasActivePotionEffects = false;

  constructor(container: Container) {
    super(container);
  }

  override initGui(): void {
    super.initGui();
    if (activePotionEffects(this.mc.thePlayer!).length > 0) {
      this.guiLeft = 160 + Math.trunc((this.width - this.xSize - 200) / 2);
      this.hasActivePotionEffects = true;
    }
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    super.drawScreen(mx, my, pt);
    if (this.hasActivePotionEffects) this.displayDebuffEffects();
  }

  /** One 140x32 panel per effect: status icon, name with level, remaining time. */
  private displayDebuffEffects(): void {
    const x = this.guiLeft - 124;
    let y = this.guiTop;
    const effects = activePotionEffects(this.mc.thePlayer!);
    if (effects.length === 0) return;
    GL.color(1, 1, 1, 1);
    GL.disable(GL.LIGHTING);
    const step = effects.length > 5 ? Math.trunc(132 / (effects.length - 1)) : 33;
    for (const effect of effects) {
      const potion = Potion.potionTypes[effect.getPotionID()];
      if (!potion) continue;
      GL.color(1, 1, 1, 1);
      this.mc.renderEngine.bindTexture('/gui/inventory.png');
      this.drawTexturedModalRect(x, y, 0, 166, 140, 32);
      if (potion.hasStatusIcon()) {
        const icon = potion.getStatusIconIndex();
        this.drawTexturedModalRect(x + 6, y + 7, (icon % 8) * 18, 198 + Math.trunc(icon / 8) * 18, 18, 18);
      }
      const amp = effect.getAmplifier();
      const name = I18n.translateToLocal(potion.getName()) + (amp >= 1 && amp <= 3 ? ROMAN[amp] : '');
      this.fontRenderer.drawStringWithShadow(name, x + 10 + 18, y + 6, 0xffffff);
      this.fontRenderer.drawStringWithShadow(Potion.getDurationString(effect as unknown as PotionEffect), x + 10 + 18, y + 6 + 10, 0x7f7f7f);
      y += step;
    }
  }
}
