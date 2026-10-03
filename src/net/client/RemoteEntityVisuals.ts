import { MathHelper } from '../../core/MathHelper';
import type { Entity } from '../../entity/Entity';

const f = Math.fround;
const PI_F = f(Math.PI);
const TWO_PI_F = f(Math.PI * 2);

/**
 * The purely visual parts of entity updates that a guest's copies still run (in 1.5.2 the client
 * ran the whole update and these parts did not depend on the server): wing flaps, squid
 * tentacles, slime squish, wolf shakes and head tilt, timers that animate items, orbs, TNT,
 * arrows and crystals. Keyed by EntityList name; each only touches its own entity's fields.
 */
type Visual = (e: Entity) => void;
type Fields = Record<string, number | boolean>;

const fields = (e: Entity) => e as unknown as Fields & Entity;

function chicken(e: Entity): void {
  const c = fields(e);
  c.prevWingRotation = c.wingRotation as number;
  c.prevDestPos = c.destPos as number;
  let dest = f((c.destPos as number) + (e.onGround ? -1 : 4) * 0.3);
  if (dest < 0) dest = 0;
  if (dest > 1) dest = 1;
  c.destPos = dest;
  let delta = c.wingRotDelta as number;
  if (!e.onGround && delta < 1) delta = 1;
  c.wingRotDelta = f(delta * 0.9);
  c.wingRotation = f((c.wingRotation as number) + f((c.wingRotDelta as number) * 2));
}

/** The squid's spin and tentacles, its pitch and roll from the way it moves. */
function squid(e: Entity): void {
  const s = fields(e);
  s.prevSquidPitch = s.squidPitch as number;
  s.prevSquidYaw = s.squidYaw as number;
  s.prevSquidRotation = s.squidRotation as number;
  s.prevTentacleAngle = s.tentacleAngle as number;
  const rand = (e as unknown as { rand: { nextFloat(): number; nextInt(n: number): number } }).rand;
  let rot = f((s.squidRotation as number) + (s.rotationVelocity as number));
  if (rot > TWO_PI_F) {
    rot = f(rot - TWO_PI_F);
    if (rand.nextInt(10) === 0) s.rotationVelocity = f(f(1 / f(rand.nextFloat() + 1)) * f(0.2));
  }
  s.squidRotation = rot;
  const mx = e.posX - e.prevPosX;
  const my = e.posY - e.prevPosY;
  const mz = e.posZ - e.prevPosZ;
  if (e.isInWater()) {
    if (rot < PI_F) {
      const k = f(rot / PI_F);
      s.tentacleAngle = f(f(MathHelper.sin(f(f(k * k) * PI_F)) * PI_F) * f(0.25));
      s.spinSpeed = k > 0.75 ? 1 : f((s.spinSpeed as number) * f(0.8));
    } else {
      s.tentacleAngle = 0;
      s.spinSpeed = f((s.spinSpeed as number) * f(0.99));
    }
    const horiz = MathHelper.sqrt_double(mx * mx + mz * mz);
    s.squidYaw = f((s.squidYaw as number) + f(f(PI_F * (s.spinSpeed as number)) * f(1.5)));
    if (horiz > 1e-4 || Math.abs(my) > 1e-4) s.squidPitch = f((s.squidPitch as number) + f(f(f(f(-f(Math.atan2(horiz, my)) * 180) / PI_F) - (s.squidPitch as number)) * f(0.1)));
  } else {
    s.tentacleAngle = f(f(MathHelper.abs(MathHelper.sin(rot)) * PI_F) * f(0.25));
    s.squidPitch = f((s.squidPitch as number) + f(-90 - (s.squidPitch as number)) * 0.02);
  }
}

/** Slimes and magma cubes squash on landing and stretch in the air. */
function slime(e: Entity): void {
  const s = fields(e);
  s.squishFactor = f((s.squishFactor as number) + f(f((s.squishAmount as number) - (s.squishFactor as number)) * f(0.5)));
  s.prevSquishFactor = s.squishFactor as number;
  const was = s.netWasOnGround === true;
  if (e.onGround && !was) s.squishAmount = f(-0.5);
  else if (!e.onGround && was) s.squishAmount = 1;
  s.netWasOnGround = e.onGround;
  s.squishAmount = f((s.squishAmount as number) * f(0.6));
}

/** Begging tilts the head; status 8 starts the shake, which plays out here. */
function wolf(e: Entity): void {
  const w = fields(e);
  w.headRotationCourseOld = w.headRotationCourse as number;
  const begging = w.begging === true;
  w.headRotationCourse = f((w.headRotationCourse as number) + f(f((begging ? 1 : 0) - (w.headRotationCourse as number)) * f(0.4)));
  if ((w.isShaking || w.isShakingAnim) && w.isShakingAnim) {
    w.prevTimeWolfIsShaking = w.timeWolfIsShaking as number;
    w.timeWolfIsShaking = f((w.timeWolfIsShaking as number) + f(0.05));
    if ((w.prevTimeWolfIsShaking as number) >= 2) {
      w.isShaking = false;
      w.isShakingAnim = false;
      w.prevTimeWolfIsShaking = 0;
      w.timeWolfIsShaking = 0;
    }
  }
}

/** The grazing animation of status 10 runs down. */
function sheep(e: Entity): void {
  const s = fields(e);
  if ((s.sheepTimer as number) > 0) s.sheepTimer = (s.sheepTimer as number) - 1;
}

function ironGolem(e: Entity): void {
  const g = fields(e);
  if ((g.attackTimer as number) > 0) g.attackTimer = (g.attackTimer as number) - 1;
  if ((g.holdRoseTick as number) > 0) g.holdRoseTick = (g.holdRoseTick as number) - 1;
  if ((g.clientHoldRoseTick as number) > 0) g.clientHoldRoseTick = (g.clientHoldRoseTick as number) - 1;
}

/** The creeper swells while its state (metadata) is 1 and shrinks back otherwise. */
function creeper(e: Entity): void {
  const c = fields(e);
  c.lastActiveTime = c.timeSinceIgnited as number;
  let t = (c.timeSinceIgnited as number) + (c.creeperState as number);
  if (t < 0) t = 0;
  const fuse = c.fuseTime as number;
  if (t >= fuse) t = fuse;
  c.timeSinceIgnited = t;
}

function counter(name: string, step: number, min = Number.NEGATIVE_INFINITY): Visual {
  return (e) => {
    const r = fields(e);
    const v = (r[name] as number) + step;
    r[name] = v < min ? min : v;
  };
}

function xpOrb(e: Entity): void {
  const o = fields(e);
  o.xpColor = (o.xpColor as number) + 1;
  o.xpOrbAge = (o.xpOrbAge as number) + 1;
}

function arrow(e: Entity): void {
  const a = fields(e);
  if ((a.arrowShake as number) > 0) a.arrowShake = (a.arrowShake as number) - 1;
}

export const remoteVisuals: Record<string, Visual> = {
  Chicken: chicken,
  Squid: squid,
  Slime: slime,
  LavaSlime: slime,
  Wolf: wolf,
  Sheep: sheep,
  VillagerGolem: ironGolem,
  Creeper: creeper,
  EnderCrystal: counter('innerRotation', 1),
  Item: counter('age', 1),
  XPOrb: xpOrb,
  PrimedTnt: counter('fuse', -1, 0),
  Arrow: arrow,
};
