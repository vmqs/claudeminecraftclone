import type { JavaRandom } from '../../core/JavaRandom';
import type { Entity } from '../../entity/Entity';
import type { EntityLiving } from '../../entity/EntityLiving';
import type { ModelRenderer } from './ModelRenderer';

/** A named texture offset (TextureOffset). */
export interface TextureOffset {
  readonly textureOffsetX: number;
  readonly textureOffsetY: number;
}

/** Base of every entity model. */
export abstract class ModelBase {
  /** Swing progress of the arm (the field is called onGround in MCP). */
  onGround = 0;
  isRiding = false;
  readonly boxList: ModelRenderer[] = [];
  isChild = true;
  textureWidth = 64;
  textureHeight = 32;
  private readonly modelTextureMap = new Map<string, TextureOffset>();

  /** Texture offsets for ModelRenderer.addBoxNamed: key "<part name>.<box name>". */
  protected setTextureOffset(name: string, u: number, v: number): void {
    this.modelTextureMap.set(name, { textureOffsetX: u, textureOffsetY: v });
  }

  getTextureOffset(name: string): TextureOffset | undefined {
    return this.modelTextureMap.get(name);
  }

  render(_e: Entity | null, _limbSwing: number, _limbAmount: number, _ageInTicks: number, _headYaw: number, _headPitch: number, _scale: number): void {}

  setRotationAngles(_limbSwing: number, _limbAmount: number, _ageInTicks: number, _headYaw: number, _headPitch: number, _scale: number, _e: Entity | null): void {}

  setLivingAnimations(_e: EntityLiving, _limbSwing: number, _limbAmount: number, _pt: number): void {}

  getRandomModelBox(rand: JavaRandom): ModelRenderer {
    return this.boxList[rand.nextInt(this.boxList.length)];
  }
}
