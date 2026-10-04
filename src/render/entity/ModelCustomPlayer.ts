import { bipedPivots, partMatrices, PLAYER_SCALE, STEVE_REST, writeMatrix, type PartPose } from '../../client/model/ModelPose';
import { PART_COUNT, PART_HEAD, PART_RIGHT_ARM } from '../../client/model/PlayerModelFormat';
import type { Entity } from '../../entity/Entity';
import { GL, MAX_BONES } from '../gl/GL';
import type { CustomModelMesh } from './CustomModelMesh';
import { ModelBiped } from './ModelBiped';
import type { ModelRenderer } from './ModelRenderer';

const f = Math.fround;
/** Where Steve holds an item, relative to his right shoulder pivot (pixels): the palm. */
const STEVE_PALM = [-1, 8, 0];
/** Steve's head: its centre relative to the neck pivot, and its height (pixels). */
const STEVE_HEAD_CENTRE = [0, -4, 0];
const STEVE_HEAD_SIZE = 8;

/**
 * ModelBiped for a custom polygon model: the same animation (setRotationAngles: walking, head
 * turns, swinging, sneaking, riding, bow and blocking poses), applied to the model's six parts
 * by GPU skinning instead of drawing Steve's boxes. The parts' ModelRenderers are moved onto
 * the model's own joints after each pose, so whatever attaches to them (the held item through
 * bipedRightArm.postRender, head items through bipedHead.postRender) sits on this body; the hand
 * and head attachments are shifted to the model's palm and head size.
 */
export class ModelCustomPlayer extends ModelBiped {
  readonly bones = new Float32Array(MAX_BONES * 16);
  private readonly pivots: [number, number, number][];
  private readonly poses: PartPose[] = [];
  private readonly parts: ModelRenderer[];
  /** Palm offset from Steve's in the arm's frame (blocks). */
  private readonly palmShift: [number, number, number];
  private readonly headShift: [number, number, number];
  private readonly headScale: number;

  constructor(readonly mesh: CustomModelMesh) {
    super(0);
    this.isChild = false;
    const rig = mesh.data.rig;
    this.pivots = bipedPivots(rig);
    this.parts = [this.bipedHead, this.bipedBody, this.bipedRightArm, this.bipedLeftArm, this.bipedRightLeg, this.bipedLeftLeg];
    for (let k = 0; k < PART_COUNT; k++) {
      const r = STEVE_REST[k];
      this.poses.push({ rotationPointX: r[0], rotationPointY: r[1], rotationPointZ: r[2], rotateAngleX: 0, rotateAngleY: 0, rotateAngleZ: 0 });
    }
    const arm = this.pivots[PART_RIGHT_ARM];
    const palm = bipedPivotsOf(rig.hands[0]);
    this.palmShift = [(palm[0] - arm[0]) - STEVE_PALM[0] / 16, (palm[1] - arm[1]) - STEVE_PALM[1] / 16, (palm[2] - arm[2]) - STEVE_PALM[2] / 16];
    const head = this.pivots[PART_HEAD];
    const centre = bipedPivotsOf(rig.headCenter);
    this.headShift = [centre[0] - head[0] - STEVE_HEAD_CENTRE[0] / 16, centre[1] - head[1] - STEVE_HEAD_CENTRE[1] / 16, centre[2] - head[2] - STEVE_HEAD_CENTRE[2] / 16];
    this.headScale = rig.headSize / PLAYER_SCALE / (STEVE_HEAD_SIZE / 16);
    const armRenderer = this.bipedRightArm;
    const armPost = armRenderer.postRender.bind(armRenderer);
    armRenderer.postRender = (scale: number) => {
      armPost(scale);
      GL.translate(f(this.palmShift[0]), f(this.palmShift[1]), f(this.palmShift[2]));
    };
    const headRenderer = this.bipedHead;
    const headPost = headRenderer.postRender.bind(headRenderer);
    headRenderer.postRender = (scale: number) => {
      headPost(scale);
      const s = f(this.headScale);
      GL.translate(f(this.headShift[0]), f(this.headShift[1] - 0.25), f(this.headShift[2]));
      GL.scale(s, s, s);
      GL.translate(0, f(0.25), 0);
    };
  }

  override setRotationAngles(limbSwing: number, limbAmount: number, age: number, headYaw: number, headPitch: number, scale: number, e: Entity | null): void {
    // ModelBiped leaves some rotation points alone (the body's): start from Steve's rest.
    for (let k = 0; k < PART_COUNT; k++) this.parts[k].setRotationPoint(STEVE_REST[k][0], STEVE_REST[k][1], STEVE_REST[k][2]);
    super.setRotationAngles(limbSwing, limbAmount, age, headYaw, headPitch, scale, e);
    for (let k = 0; k < PART_COUNT; k++) {
      const r = this.parts[k];
      const p = this.poses[k];
      p.rotationPointX = r.rotationPointX;
      p.rotationPointY = r.rotationPointY;
      p.rotationPointZ = r.rotationPointZ;
      p.rotateAngleX = r.rotateAngleX;
      p.rotateAngleY = r.rotateAngleY;
      p.rotateAngleZ = r.rotateAngleZ;
      // Attachments follow this body's joints.
      const rest = STEVE_REST[k];
      const pv = this.pivots[k];
      r.setRotationPoint(pv[0] * 16 + (p.rotationPointX - rest[0]), pv[1] * 16 + (p.rotationPointY - rest[1]), pv[2] * 16 + (p.rotationPointZ - rest[2]));
    }
    this.bipedHeadwear.setRotationPoint(this.bipedHead.rotationPointX, this.bipedHead.rotationPointY, this.bipedHead.rotationPointZ);
  }

  override render(e: Entity | null, limbSwing: number, limbAmount: number, age: number, headYaw: number, headPitch: number, scale: number): void {
    this.setRotationAngles(limbSwing, limbAmount, age, headYaw, headPitch, scale, e);
    partMatrices(this.pivots, this.poses, this.bones);
    this.mesh.draw(this.bones);
  }

  /**
   * The first-person hand: the model's right arm posed like Steve's (idle sway), with its
   * shoulder where Steve's would be, in the frame ItemRenderer set up for Steve's arm. False when
   * the model has no right arm to show.
   */
  renderFirstPersonArm(e: Entity | null): boolean {
    // No triangles bound to the right arm: Steve's arm (with the skin) stands in.
    if (!this.mesh.hasArm) return false;
    GL.color(1, 1, 1);
    this.onGround = 0;
    this.setRotationAngles(0, 0, 0, 0, 0, f(0.0625), e);
    const p = this.poses[PART_RIGHT_ARM];
    const pv = this.pivots[PART_RIGHT_ARM];
    writeMatrix(this.bones, 0, p.rotationPointX / 16, p.rotationPointY / 16, p.rotationPointZ / 16, p.rotateAngleX, p.rotateAngleY, p.rotateAngleZ, pv[0], pv[1], pv[2]);
    for (let k = 1; k < MAX_BONES; k++) this.bones.copyWithin(k * 16, 0, 16);
    this.mesh.draw(this.bones, true);
    return true;
  }
}

function bipedPivotsOf(p: readonly number[]): [number, number, number] {
  return [p[0] / PLAYER_SCALE, 1.5 - p[1] / PLAYER_SCALE, -p[2] / PLAYER_SCALE];
}
