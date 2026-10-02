import { I18n } from '../../core/I18n';
import type { PotionEffectLike } from '../../entity/PotionEffects';
import { Potion, ticksToElapsedTime } from '../../potion/Potion';
import { GL } from '../../render/gl/GL';
import type { Container } from './Container';
import { GuiContainer } from './GuiContainer';

/** What the list needs beyond PotionEffectLike (PotionEffect's "**:**" flag). */
interface DurationMaxFlag {
  getIsPotionDurationMax?(): boolean;
}

/**
 * The order a java.util.HashMap<Integer, PotionEffect> of the default capacity (16 buckets,
 * room for 12 effects) hands its values out: by bucket (id & 15), and within a bucket the most
 * recently added first. EntityLiving keeps its effects in insertion order.
 */
export function hashMapOrder(effects: readonly PotionEffectLike[]): PotionEffectLike[] {
  const indexed = effects.map((e, i) => ({ e, i }));
  indexed.sort((a, b) => (a.e.getPotionID() & 15) - (b.e.getPotionID() & 15) || b.i - a.i);
  return indexed.map((x) => x.e);
}

/** The roman level suffix of an effect name (amplifier 1..3 = II..IV; higher levels show none). */
export function potionLevelSuffix(amplifier: number): string {
  if (amplifier === 1) return ' II';
  if (amplifier === 2) return ' III';
  if (amplifier === 3) return ' IV';
  return '';
}

/**
 * A container screen that lists the player's active potion effects on its left
 * (InventoryEffectRenderer): with any effect active the window moves right to make room, and
 * each effect gets a 140x32 panel from gui/inventory.png with its status icon, name and level,
 * and the time left. More than five effects squeeze the panels together.
 */
export abstract class InventoryEffectRenderer extends GuiContainer {
  private hasActivePotionEffects = false;

  constructor(container: Container) {
    super(container);
  }

  override initGui(): void {
    super.initGui();
    if (this.mc.thePlayer!.getActivePotionEffects().length > 0) {
      this.guiLeft = 160 + Math.trunc((this.width - this.xSize - 200) / 2);
      this.hasActivePotionEffects = true;
    }
  }

  override drawScreen(mx: number, my: number, pt: number): void {
    super.drawScreen(mx, my, pt);
    if (this.hasActivePotionEffects) this.displayDebuffEffects();
  }

  private displayDebuffEffects(): void {
    const x = this.guiLeft - 124;
    let y = this.guiTop;
    const effects = hashMapOrder(this.mc.thePlayer!.getActivePotionEffects());
    if (effects.length === 0) return;
    GL.color(1, 1, 1, 1);
    GL.disable(GL.LIGHTING);
    const step = effects.length > 5 ? Math.trunc(132 / (effects.length - 1)) : 33;
    for (const effect of effects) {
      const potion = Potion.potionTypes[effect.getPotionID()];
      GL.color(1, 1, 1, 1);
      this.mc.renderEngine.bindTexture('/gui/inventory.png');
      this.drawTexturedModalRect(x, y, 0, 166, 140, 32);
      if (potion?.hasStatusIcon()) {
        const icon = potion.getStatusIconIndex();
        this.drawTexturedModalRect(x + 6, y + 7, (icon % 8) * 18, 198 + Math.trunc(icon / 8) * 18, 18, 18);
      }
      const name = I18n.translateToLocal(potion?.getName() ?? '') + potionLevelSuffix(effect.getAmplifier());
      this.fontRenderer.drawStringWithShadow(name, x + 10 + 18, y + 6, 0xffffff);
      const duration = (effect as PotionEffectLike & DurationMaxFlag).getIsPotionDurationMax?.() ? '**:**' : ticksToElapsedTime(effect.getDuration());
      this.fontRenderer.drawStringWithShadow(duration, x + 10 + 18, y + 6 + 10, 0x7f7f7f);
      y += step;
    }
  }
}

