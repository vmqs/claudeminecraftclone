import type { JavaRandom } from '../../core/JavaRandom';
import type { Entity } from '../../entity/Entity';
import type { EntityLiving } from '../../entity/EntityLiving';
import type { ModelRenderer } from './ModelRenderer';

/** Base of every entity model. */
export abstract class ModelBase {
  onGround = 0;
  isRiding = false;
  readonly boxList: ModelRenderer[] = [];
  isChild = true;
  textureWidth = 64;
  textureHeight = 32;

  render(_e: Entity | null, _limbSwing: number, _limbAmount: number, _ageInTicks: number, _headYaw: number, _headPitch: number, _scale: number): void {}

  setRotationAngles(_limbSwing: number, _limbAmount: number, _ageInTicks: number, _headYaw: number, _headPitch: number, _scale: number, _e: Entity | null): void {}

  setLivingAnimations(_e: EntityLiving, _limbSwing: number, _limbAmount: number, _pt: number): void {}

  getRandomModelBox(rand: JavaRandom): ModelRenderer {
    return this.boxList[rand.nextInt(this.boxList.length)];
  }
}
