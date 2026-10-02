import { Block } from '../../block/Block';
import { BlockIds } from '../../block/BlockIds';
import type { Minecraft } from '../../client/Minecraft';
import { Render } from '../entity/Render';
import { GL } from '../gl/GL';
import { Tessellator } from '../gl/Tessellator';

const f = Math.fround;

/**
 * Full-screen overlays of 1.5.2 that are not the HUD itself: the pumpkin blur and the nether
 * portal swirl (GuiIngame.renderGameOverlay, drawn in GUI space right after the vignette) and
 * the flames in front of a burning player (ItemRenderer.renderFireInFirstPerson, drawn in the
 * hand's projection).
 */
export const ScreenOverlays = {
  /** Pumpkin helmet (first person only), then the portal swirl while standing in a portal. */
  renderHelmetAndPortal(mc: Minecraft, pt: number, w: number, h: number): void {
    const p = mc.thePlayer;
    if (!p) return;
    const helmet = p.inventory.armorItemInSlot(3);
    if (mc.gameSettings.thirdPersonView === 0 && helmet && helmet.itemID === BlockIds.pumpkin) this.renderPumpkinBlur(mc, w, h);
    // 1.5.2 skips the swirl under Nausea; potion effects do not exist here yet.
    const portal = f(p.prevTimeInPortal + f(f(p.timeInPortal - p.prevTimeInPortal) * pt));
    if (portal > 0) this.renderPortalOverlay(mc, portal, w, h);
  },

  /** misc/pumpkinblur.png stretched over the screen (GuiIngame.renderPumpkinBlur). */
  renderPumpkinBlur(mc: Minecraft, w: number, h: number): void {
    GL.disable(GL.DEPTH_TEST);
    GL.depthMask(false);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    GL.color(1, 1, 1, 1);
    GL.disable(GL.ALPHA_TEST);
    mc.renderEngine.bindTexture('%blur%/misc/pumpkinblur.png');
    fullScreenQuad(w, h, 0, 0, 1, 1);
    GL.depthMask(true);
    GL.enable(GL.DEPTH_TEST);
    GL.enable(GL.ALPHA_TEST);
    GL.color(1, 1, 1, 1);
  },

  /** The portal texture fading in with the time spent in a portal (GuiIngame.renderPortalOverlay). */
  renderPortalOverlay(mc: Minecraft, amount: number, w: number, h: number): void {
    if (amount < 1) {
      amount = f(amount * amount);
      amount = f(amount * amount);
      amount = f(f(amount * f(0.8)) + f(0.2));
    }
    const icon = Block.blocksList[BlockIds.portal]?.getBlockTextureFromSide(1);
    if (!icon) return;
    GL.disable(GL.ALPHA_TEST);
    GL.disable(GL.DEPTH_TEST);
    GL.depthMask(false);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    GL.color(1, 1, 1, amount);
    mc.renderEngine.bindTexture('/terrain.png');
    fullScreenQuad(w, h, icon.getMinU(), icon.getMinV(), icon.getMaxU(), icon.getMaxV());
    GL.depthMask(true);
    GL.enable(GL.DEPTH_TEST);
    GL.enable(GL.ALPHA_TEST);
    GL.color(1, 1, 1, 1);
  },

  /**
   * Two tilted fire_1 sprites low on the screen (ItemRenderer.renderFireInFirstPerson). Creative
   * players show them too while the burning flag lags one tick behind the extinguish, e.g. in lava.
   */
  renderFireInFirstPerson(mc: Minecraft): void {
    const icon = Render.fireIcons[1];
    if (!icon) return;
    mc.renderEngine.bindTexture('/terrain.png');
    const t = Tessellator.instance;
    GL.color(1, 1, 1, f(0.9));
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    const size = 1;
    for (let side = 0; side < 2; side++) {
      GL.pushMatrix();
      const x0 = f(f(0 - size) / 2);
      const x1 = f(x0 + size);
      const y0 = f(0 - f(size / 2));
      const y1 = f(y0 + size);
      const z = f(-0.5);
      GL.translate(f(f(-(side * 2 - 1)) * f(0.24)), f(-0.3), 0);
      GL.rotate(f((side * 2 - 1) * 10), 0, 1, 0);
      t.startDrawingQuads();
      t.addVertexWithUV(x0, y0, z, icon.getMaxU(), icon.getMaxV());
      t.addVertexWithUV(x1, y0, z, icon.getMinU(), icon.getMaxV());
      t.addVertexWithUV(x1, y1, z, icon.getMinU(), icon.getMinV());
      t.addVertexWithUV(x0, y1, z, icon.getMaxU(), icon.getMinV());
      t.draw();
      GL.popMatrix();
    }
    GL.color(1, 1, 1, 1);
    GL.disable(GL.BLEND);
  },
};

/** A quad over the whole GUI-space screen at z -90 with the given texture rectangle. */
function fullScreenQuad(w: number, h: number, u0: number, v0: number, u1: number, v1: number): void {
  const t = Tessellator.instance;
  t.startDrawingQuads();
  t.addVertexWithUV(0, h, -90, u0, v1);
  t.addVertexWithUV(w, h, -90, u1, v1);
  t.addVertexWithUV(w, 0, -90, u1, v0);
  t.addVertexWithUV(0, 0, -90, u0, v0);
  t.draw();
}
