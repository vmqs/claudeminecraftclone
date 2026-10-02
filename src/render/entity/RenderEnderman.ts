import { Block } from '../../block/Block';
import { JavaRandom } from '../../core/JavaRandom';
import type { EntityEnderman } from '../../entity/EntityEnderman';
import type { EntityLiving } from '../../entity/EntityLiving';
import { GL } from '../gl/GL';
import { applyGlowingEyesLight } from './GlowingEyes';
import { OpenGlHelper } from '../OpenGlHelper';
import { ModelEnderman } from './ModelEnderman';
import { RenderLiving } from './RenderLiving';

const f = Math.fround;

/**
 * Endermen (RenderEnderman): jittering while screaming (open jaw), the carried block between
 * the hands lit like the enderman, and the purple eyes drawn additively at full brightness.
 */
export class RenderEnderman extends RenderLiving {
  private readonly endermanModel: ModelEnderman;
  private readonly rnd = new JavaRandom();

  constructor() {
    super(new ModelEnderman(), 0.5);
    this.endermanModel = this.mainModel as ModelEnderman;
    this.setRenderPassModel(this.endermanModel);
  }

  override doRenderLiving(e: EntityLiving, x: number, y: number, z: number, yaw: number, pt: number): void {
    const en = e as EntityEnderman;
    this.endermanModel.isCarrying = en.getCarried() > 0;
    this.endermanModel.isAttacking = en.isScreaming();
    if (en.isScreaming()) {
      const k = 0.02;
      x += this.rnd.nextGaussian() * k;
      z += this.rnd.nextGaussian() * k;
    }
    super.doRenderLiving(e, x, y, z, yaw, pt);
  }

  /** renderCarrying */
  protected override renderEquippedItems(e: EntityLiving, pt: number): void {
    super.renderEquippedItems(e, pt);
    const en = e as EntityEnderman;
    const id = en.getCarried();
    if (id <= 0) return;
    const block = Block.blocksList[id];
    if (!block) return;
    GL.enable(GL.RESCALE_NORMAL);
    GL.pushMatrix();
    const s = f(0.5);
    GL.translate(0, f(0.6875), f(-0.75));
    GL.rotate(20, 1, 0, 0);
    GL.rotate(45, 0, 1, 0);
    GL.scale(-s, -s, s);
    const light = e.getBrightnessForRender(pt);
    OpenGlHelper.setLightmapTextureCoords(OpenGlHelper.lightmapTexUnit, light % 65536, Math.trunc(light / 65536));
    GL.color(1, 1, 1, 1);
    this.loadTexture('/terrain.png');
    this.renderBlocks.renderBlockAsItem(block, en.getCarryingData(), 1);
    GL.popMatrix();
    GL.disable(GL.RESCALE_NORMAL);
  }

  /** renderEyes */
  protected override shouldRenderPass(e: EntityLiving, pass: number, _pt: number): number {
    if (pass !== 0) return -1;
    this.loadTexture('/mob/enderman_eyes.png');
    GL.enable(GL.BLEND);
    GL.disable(GL.ALPHA_TEST);
    GL.blendFunc(GL.ONE, GL.ONE);
    GL.disable(GL.LIGHTING);
    GL.depthMask(!e.isInvisible());
    GL.enable(GL.LIGHTING);
    applyGlowingEyesLight();
    return 1;
  }
}
