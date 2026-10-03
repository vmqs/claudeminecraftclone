import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';
import { EntityList } from '../../entity/EntityList';
import type { EntityLiving } from '../../entity/EntityLiving';
import { remoteVisuals } from './RemoteEntityVisuals';

/**
 * How a guest moves the host's entities (the client half of 1.5.2's entities without the
 * simulation): each packet sets a target that the copy approaches over a few ticks
 * (setPositionAndRotation2 with 3 increments, as EntityLiving did), and the living ones animate
 * from that movement: limb swing, body yaw, arm swing, hurt and death timers, the head. Class
 * extras (a chicken's wings, an item's bobbing, a slime's squish) are RemoteEntityVisuals'.
 * Nothing here can damage, spawn, remove or change anything in the world.
 */

interface Target {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  steps: number;
}

const targets = new WeakMap<Entity, Target>();
const f = Math.fround;

/** The interpolation steps of every network position (EntityLiving.newPosRotationIncrements). */
export const INTERPOLATION_STEPS = 3;

/** A new position and look from the host, reached over `steps` ticks (1 snaps on the next tick). */
export function setRemoteTarget(e: Entity, x: number, y: number, z: number, yaw: number, pitch: number, steps = INTERPOLATION_STEPS): void {
  targets.set(e, { x, y, z, yaw, pitch, steps });
}

/** Where the entity is heading (the last position the host sent). */
export function getRemoteTarget(e: Entity): Readonly<Target> | null {
  return targets.get(e) ?? null;
}

/** Puts the entity at its target now (teleports, mounting). */
export function snapToTarget(e: Entity): void {
  const t = targets.get(e);
  if (!t) return;
  e.setPosition(t.x, t.y, t.z);
  e.rotationYaw = f(t.yaw % 360);
  e.rotationPitch = f(t.pitch % 360);
  t.steps = 0;
}

/** Whether the entity stands on something (the client's moveEntity worked it out in 1.5.2). */
function standsOnGround(e: Entity): boolean {
  const box = e.boundingBox.copy().offset(0, -0.05, 0);
  return e.worldObj.getCollidingBoundingBoxes(e, box).length > 0;
}

/** One guest tick of a host entity. */
export function tickRemoteEntity(e: Entity): void {
  e.prevDistanceWalkedModified = e.distanceWalkedModified;
  e.prevPosX = e.posX;
  e.prevPosY = e.posY;
  e.prevPosZ = e.posZ;
  e.prevRotationPitch = e.rotationPitch;
  e.prevRotationYaw = e.rotationYaw;
  const t = targets.get(e);
  if (t && t.steps > 0) {
    const n = t.steps;
    const x = e.posX + (t.x - e.posX) / n;
    const y = e.posY + (t.y - e.posY) / n;
    const z = e.posZ + (t.z - e.posZ) / n;
    const dyaw = MathHelper.wrapAngleTo180_double(t.yaw - e.rotationYaw);
    e.rotationYaw = f(e.rotationYaw + dyaw / n);
    e.rotationPitch = f(e.rotationPitch + (t.pitch - e.rotationPitch) / n);
    t.steps--;
    e.setPosition(x, y, z);
  }
  if (e.isLivingEntity) tickRemoteLiving(e as EntityLiving);
  const name = EntityList.getDebugName(e);
  if (name) remoteVisuals[name]?.(e);
}

function tickRemoteLiving(l: EntityLiving): void {
  l.prevSwingProgress = l.swingProgress;
  l.prevRenderYawOffset = l.renderYawOffset;
  l.prevRotationYawHead = l.rotationYawHead;
  l.prevCameraPitch = l.cameraPitch;
  if (l.hurtTime > 0) l.hurtTime--;
  if (l.attackTime > 0) l.attackTime--;
  if (l.hurtResistantTime > 0) l.hurtResistantTime--;
  if (l.getHealth() <= 0 && l.deathTime < 20) l.deathTime++;
  l.onGround = standsOnGround(l);
  l.updateArmSwingProgress();
  l.updateLimbSwing();
  l.updateBodyRotation();
}
