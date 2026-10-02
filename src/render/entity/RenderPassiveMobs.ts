import { Block } from '../../block/Block';
import { BlockIds } from '../../block/BlockIds';
import { MathHelper } from '../../core/MathHelper';
import type { EntityBat } from '../../entity/EntityBat';
import type { EntityChicken } from '../../entity/EntityChicken';
import type { EntityIronGolem } from '../../entity/EntityIronGolem';
import type { EntityLiving } from '../../entity/EntityLiving';
import type { EntityOcelot } from '../../entity/EntityOcelot';
import type { EntityPig } from '../../entity/EntityPig';
import { EntitySheep } from '../../entity/EntitySheep';
import type { EntitySquid } from '../../entity/EntitySquid';
import type { EntityVillager } from '../../entity/EntityVillager';
import type { EntityWolf } from '../../entity/EntityWolf';
import { ItemStack } from '../../item/ItemStack';
import { GL } from '../gl/GL';
import { OpenGlHelper } from '../OpenGlHelper';
import { RenderBlocks } from '../RenderBlocks';
import type { ModelBase } from './ModelBase';
import { ModelBat } from './ModelBat';
import { golemTriangleWave, ModelIronGolem } from './ModelIronGolem';
import type { ModelQuadruped } from './ModelQuadruped';
import { ModelSnowMan } from './ModelSnowMan';
import { ModelVillager } from './ModelVillager';
import { RenderLiving } from './RenderLiving';

const f = Math.fround;
const SCALE = f(0.0625);

/** The pig (RenderPig): the saddle layer (a grown pig model) when saddled. */
export class RenderPig extends RenderLiving {
  constructor(main: ModelBase, saddle: ModelBase, shadow: number) {
    super(main, shadow);
    this.setRenderPassModel(saddle);
  }

  protected override shouldRenderPass(e: EntityLiving, pass: number, _pt: number): number {
    if (pass === 0 && (e as EntityPig).getSaddled()) {
      this.loadTexture('/mob/saddle.png');
      return 1;
    }
    return -1;
  }
}

/** The sheep (RenderSheep): the fleece layer tinted with the wool colour unless sheared. */
export class RenderSheep extends RenderLiving {
  constructor(main: ModelBase, fur: ModelBase, shadow: number) {
    super(main, shadow);
    this.setRenderPassModel(fur);
  }

  protected override shouldRenderPass(e: EntityLiving, pass: number, _pt: number): number {
    const sheep = e as EntitySheep;
    if (pass === 0 && !sheep.getSheared()) {
      this.loadTexture('/mob/sheep_fur.png');
      const c = EntitySheep.fleeceColorTable[sheep.getFleeceColor()];
      GL.color(c[0], c[1], c[2]);
      return 1;
    }
    return -1;
  }
}

/** The chicken (RenderChicken): the model's age argument is the wing flap angle. */
export class RenderChicken extends RenderLiving {
  protected override handleRotationFloat(e: EntityLiving, pt: number): number {
    const c = e as EntityChicken;
    const flap = f(c.prevWingRotation + f(f(c.wingRotation - c.prevWingRotation) * pt));
    const spread = f(c.prevDestPos + f(f(c.destPos - c.prevDestPos) * pt));
    return f(f(MathHelper.sin(flap) + 1) * spread);
  }
}

/** The mooshroom (RenderMooshroom): two red mushrooms on the back and one on the head. */
export class RenderMooshroom extends RenderLiving {
  protected override renderEquippedItems(e: EntityLiving, pt: number): void {
    super.renderEquippedItems(e, pt);
    if (e.isChild()) return;
    const mushroom = Block.blocksList[BlockIds.mushroomRed];
    if (!mushroom) return;
    this.loadTexture('/terrain.png');
    GL.enable(GL.CULL_FACE);
    GL.pushMatrix();
    GL.scale(1, -1, 1);
    GL.translate(f(0.2), f(0.4), f(0.5));
    GL.rotate(42, 0, 1, 0);
    this.renderBlocks.renderBlockAsItem(mushroom, 0, 1);
    GL.translate(f(0.1), 0, f(-0.6));
    GL.rotate(42, 0, 1, 0);
    this.renderBlocks.renderBlockAsItem(mushroom, 0, 1);
    GL.popMatrix();
    GL.pushMatrix();
    (this.mainModel as ModelQuadruped).head.postRender(SCALE);
    GL.scale(1, -1, 1);
    GL.translate(0, f(0.75), f(-0.2));
    GL.rotate(12, 0, 1, 0);
    this.renderBlocks.renderBlockAsItem(mushroom, 0, 1);
    GL.popMatrix();
    GL.disable(GL.CULL_FACE);
  }
}

/**
 * The wolf (RenderWolf): the tail angle is the model's age argument; while shaking a darkened
 * copy of the skin is drawn on top, and tamed wolves get the collar layer in its dye colour.
 */
export class RenderWolf extends RenderLiving {
  constructor(main: ModelBase, pass: ModelBase, shadow: number) {
    super(main, shadow);
    this.setRenderPassModel(pass);
  }

  protected override handleRotationFloat(e: EntityLiving, _pt: number): number {
    return (e as EntityWolf).getTailRotation();
  }

  protected override shouldRenderPass(e: EntityLiving, pass: number, pt: number): number {
    const wolf = e as EntityWolf;
    if (pass === 0 && wolf.getWolfShaking()) {
      const k = f(wolf.getBrightness(pt) * wolf.getShadingWhileShaking(pt));
      this.loadTexture(wolf.getTexture());
      GL.color(k, k, k);
      return 1;
    }
    if (pass === 1 && wolf.isTamed()) {
      this.loadTexture('/mob/wolf_collar.png');
      const c = EntitySheep.fleeceColorTable[wolf.getCollarColor()];
      GL.color(c[0], c[1], c[2]);
      return 1;
    }
    return -1;
  }
}

/** The ocelot (RenderOcelot): tamed cats are drawn at 80%. */
export class RenderOcelot extends RenderLiving {
  protected override preRenderCallback(e: EntityLiving, pt: number): void {
    super.preRenderCallback(e, pt);
    if ((e as EntityOcelot).isTamed()) GL.scale(f(0.8), f(0.8), f(0.8));
  }
}

/** The squid (RenderSquid): pitched and spun around its centre; the age argument is the tentacle angle. */
export class RenderSquid extends RenderLiving {
  protected override rotateCorpse(e: EntityLiving, _age: number, bodyYaw: number, pt: number): void {
    const s = e as EntitySquid;
    const pitch = f(s.prevSquidPitch + f(f(s.squidPitch - s.prevSquidPitch) * pt));
    const yaw = f(s.prevSquidYaw + f(f(s.squidYaw - s.prevSquidYaw) * pt));
    GL.translate(0, f(0.5), 0);
    GL.rotate(f(180 - bodyYaw), 0, 1, 0);
    GL.rotate(pitch, 1, 0, 0);
    GL.rotate(yaw, 0, 1, 0);
    GL.translate(0, f(-1.2), 0);
  }

  protected override handleRotationFloat(e: EntityLiving, pt: number): number {
    const s = e as EntitySquid;
    return f(s.prevTentacleAngle + f(f(s.tentacleAngle - s.prevTentacleAngle) * pt));
  }
}

/** The bat (RenderBat): drawn at 35%, bobbing while flying. */
export class RenderBat extends RenderLiving {
  constructor() {
    super(new ModelBat(), f(0.25));
  }

  protected override preRenderCallback(_e: EntityLiving, _pt: number): void {
    GL.scale(f(0.35), f(0.35), f(0.35));
  }

  protected override rotateCorpse(e: EntityLiving, age: number, bodyYaw: number, pt: number): void {
    if (!(e as EntityBat).getIsBatHanging()) GL.translate(0, f(MathHelper.cos(f(age * f(0.3))) * f(0.1)), 0);
    else GL.translate(0, f(-0.1), 0);
    super.rotateCorpse(e, age, bodyYaw, pt);
  }
}

/** The villager (RenderVillager): 15/16 size, children half that with a smaller shadow. */
export class RenderVillager extends RenderLiving {
  constructor() {
    super(new ModelVillager(0), f(0.5));
  }

  protected override preRenderCallback(e: EntityLiving, _pt: number): void {
    let s = f(0.9375);
    if ((e as EntityVillager).getGrowingAge() < 0) {
      s = f(s * 0.5);
      this.shadowSize = f(0.25);
    } else {
      this.shadowSize = f(0.5);
    }
    GL.scale(s, s, s);
  }
}

/** The iron golem (RenderIronGolem): sways while walking and holds out a poppy. */
export class RenderIronGolem extends RenderLiving {
  private readonly ironGolemModel: ModelIronGolem;

  constructor() {
    const model = new ModelIronGolem();
    super(model, f(0.5));
    this.ironGolemModel = model;
  }

  protected override rotateCorpse(e: EntityLiving, age: number, bodyYaw: number, pt: number): void {
    super.rotateCorpse(e, age, bodyYaw, pt);
    if (e.limbYaw < 0.01) return;
    const t = f(f(e.limbSwing - f(e.limbYaw * f(1 - pt))) + 6);
    GL.rotate(f(f(6.5) * golemTriangleWave(t, 13)), 0, 0, 1);
  }

  protected override renderEquippedItems(e: EntityLiving, pt: number): void {
    super.renderEquippedItems(e, pt);
    const golem = e as EntityIronGolem;
    if (golem.getClientHoldRoseTick() === 0) return;
    const rose = Block.blocksList[BlockIds.plantRed];
    if (!rose) return;
    GL.enable(GL.RESCALE_NORMAL);
    GL.pushMatrix();
    GL.rotate(f(5 + f(f(180 * this.ironGolemModel.ironGolemRightArm.rotateAngleX) / f(Math.PI))), 1, 0, 0);
    GL.translate(f(-0.6875), f(1.25), f(-0.9375));
    GL.rotate(90, 1, 0, 0);
    const s = f(0.8);
    GL.scale(s, -s, s);
    const light = golem.getBrightnessForRender(pt);
    OpenGlHelper.setLightmapTextureCoords(OpenGlHelper.lightmapTexUnit, light % 65536, Math.trunc(light / 65536));
    GL.color(1, 1, 1, 1);
    this.loadTexture('/terrain.png');
    this.renderBlocks.renderBlockAsItem(rose, 0, 1);
    GL.popMatrix();
    GL.disable(GL.RESCALE_NORMAL);
  }
}

/** The snow golem (RenderSnowMan): wears a pumpkin. */
export class RenderSnowMan extends RenderLiving {
  private readonly snowmanModel: ModelSnowMan;
  private readonly pumpkin = new ItemStack(BlockIds.pumpkin, 1);

  constructor() {
    const model = new ModelSnowMan();
    super(model, f(0.5));
    this.snowmanModel = model;
    this.setRenderPassModel(model);
  }

  protected override renderEquippedItems(e: EntityLiving, pt: number): void {
    super.renderEquippedItems(e, pt);
    const block = Block.blocksList[this.pumpkin.itemID];
    if (!block) return;
    GL.pushMatrix();
    this.snowmanModel.head.postRender(SCALE);
    if (RenderBlocks.renderItemIn3d(block.getRenderType())) {
      const s = f(0.625);
      GL.translate(0, f(-0.34375), 0);
      GL.rotate(90, 0, 1, 0);
      GL.scale(s, -s, s);
    }
    this.renderManager.itemRenderer?.renderItem(e, this.pumpkin, 0);
    GL.popMatrix();
  }
}
