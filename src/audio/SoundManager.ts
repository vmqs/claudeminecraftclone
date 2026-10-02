import type { ResourceManager } from '../assets/ResourceManager';
import type { GameSettings } from '../client/GameSettings';
import { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import type { Entity } from '../entity/Entity';
import type { EntityLiving } from '../entity/EntityLiving';

const f = Math.fround;

/** name -> file paths, built like SoundPool.addSound ("step/grass1.ogg" -> "step.grass"). */
class SoundPool {
  readonly entries = new Map<string, string[]>();
  readonly all: string[] = [];

  constructor(private readonly randomVariants: boolean) {}

  addSound(relative: string, path: string): void {
    let name = relative.slice(0, relative.indexOf('.'));
    if (this.randomVariants) while (/\d$/.test(name)) name = name.slice(0, -1);
    name = name.replace(/\//g, '.');
    let list = this.entries.get(name);
    if (!list) this.entries.set(name, (list = []));
    list.push(path);
    this.all.push(path);
  }

  getRandomSoundFromSoundPool(name: string, rand: JavaRandom): string | null {
    const list = this.entries.get(name);
    return list ? list[rand.nextInt(list.length)] : null;
  }

  getRandomSound(rand: JavaRandom): string | null {
    return this.all.length === 0 ? null : this.all[rand.nextInt(this.all.length)];
  }
}

/** A looping sound attached to an entity (minecarts); the only kind pause/resume touches. */
interface EntitySound {
  src: AudioBufferSourceNode | null;
  gain: GainNode;
  panner: PannerNode;
  volume: number;
  paused: boolean;
}

/** A sound waiting for its delay (thunder far away: WorldClient.playSound with distance delay). */
interface ScheduledSound {
  name: string;
  x: number;
  y: number;
  z: number;
  volume: number;
  pitch: number;
  ticks: number;
}

/**
 * SoundManager over Web Audio: positional one-shots with the original's linear fall-off over
 * 16 * max(1, volume) blocks, UI sounds at a quarter volume, looping entity sounds, delayed
 * sounds, and background music after a random 0-12000 tick delay (then 12000-24000 ticks
 * between tracks). As in 1.5.2, pausing the game only pauses the looping entity sounds: one-shots,
 * UI clicks and music keep playing.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly soundPoolSounds = new SoundPool(true);
  private readonly soundPoolMusic = new SoundPool(true);
  private readonly soundPoolStreaming = new SoundPool(false);
  /** The jukebox record playing ("streaming" in the original sound system). */
  private streaming: AudioBufferSourceNode | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly rand = new JavaRandom();
  private ticksBeforeMusic = this.rand.nextInt(12000);
  private music: HTMLAudioElement | null = null;
  private musicGain: GainNode | null = null;
  private readonly playing = new Set<AudioBufferSourceNode>();
  private readonly entitySounds = new Map<number, EntitySound>();
  private readonly scheduled: ScheduledSound[] = [];
  loaded = false;

  constructor(
    private readonly options: GameSettings,
    private readonly resources: ResourceManager,
  ) {}

  /** Indexes the sound files; the AudioContext is created on the first user gesture. */
  init(): void {
    for (const p of this.resources.listSounds()) {
      if (p.startsWith('sound3/')) this.soundPoolSounds.addSound(p.slice(7), p);
      else if (p.startsWith('music/')) this.soundPoolMusic.addSound(p.slice(6), p);
      else if (p.startsWith('newmusic/')) this.soundPoolMusic.addSound(p.slice(9), p);
      else if (p.startsWith('streaming/')) this.soundPoolStreaming.addSound(p.slice(10), p);
    }
    const resume = () => this.ensureContext();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, resume, { capture: true });
    this.loaded = true;
  }

  private ensureContext(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        // Warm the cache with the sounds every session uses.
        for (const [name, list] of this.soundPoolSounds.entries) if (/^(step|dig|random)\./.test(name)) for (const p of list) void this.load(p);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private load(path: string): Promise<AudioBuffer | null> {
    let pr = this.buffers.get(path);
    if (!pr) {
      pr = (async () => {
        const ctx = this.ctx;
        if (!ctx) return null;
        const data = await this.resources.getArrayBuffer(path);
        if (!data) return null;
        try {
          return await ctx.decodeAudioData(data);
        } catch {
          return null;
        }
      })();
      this.buffers.set(path, pr);
    }
    return pr;
  }

  onSoundOptionsChanged(): void {
    if (this.music) this.music.volume = Math.max(0, Math.min(1, this.options.musicVolume));
    if (this.options.musicVolume === 0 && this.music) {
      this.music.pause();
      this.music = null;
    }
  }

  playRandomMusicIfReady(): void {
    if (!this.loaded || this.options.musicVolume === 0 || !this.ctx) return;
    if (this.music && !this.music.ended) return;
    if (this.ticksBeforeMusic > 0) {
      this.ticksBeforeMusic--;
      return;
    }
    const path = this.soundPoolMusic.getRandomSound(this.rand);
    if (!path) return;
    this.ticksBeforeMusic = this.rand.nextInt(12000) + 12000;
    const url = this.resources.resolve(path);
    if (!url) return;
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, this.options.musicVolume));
    void audio.play().catch(() => undefined);
    this.music = audio;
  }

  /** Listener at the entity's eyes, facing its look direction (setListener). */
  setListener(e: EntityLiving | null, pt: number): void {
    const ctx = this.ctx;
    if (!ctx || !e || this.options.soundVolume === 0) return;
    const pitch = f(e.prevRotationPitch + (e.rotationPitch - e.prevRotationPitch) * pt);
    const yaw = f(e.prevRotationYaw + (e.rotationYaw - e.prevRotationYaw) * pt);
    const x = e.prevPosX + (e.posX - e.prevPosX) * pt;
    const y = e.prevPosY + (e.posY - e.prevPosY) * pt;
    const z = e.prevPosZ + (e.posZ - e.prevPosZ) * pt;
    const d = f(Math.PI / 180);
    const c = MathHelper.cos(f(f(-yaw * d) - f(Math.PI)));
    const s = MathHelper.sin(f(f(-yaw * d) - f(Math.PI)));
    const fx = -s;
    const fy = -MathHelper.sin(f(f(-pitch * d) - f(Math.PI)));
    const fz = -c;
    const l = ctx.listener;
    if (l.positionX) {
      l.positionX.value = x;
      l.positionY.value = y;
      l.positionZ.value = z;
      l.forwardX.value = fx;
      l.forwardY.value = fy;
      l.forwardZ.value = fz;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(x, y, z);
      l.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  private makePanner(ctx: AudioContext, x: number, y: number, z: number, range: number): PannerNode {
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'linear';
    p.refDistance = 0;
    p.maxDistance = range;
    p.rolloffFactor = 1;
    setPannerPosition(p, x, y, z);
    return p;
  }

  private start(path: string, volume: number, pitch: number, pos: [number, number, number] | null, range: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    void this.load(path).then((buf) => {
      if (!buf || !this.ctx || !this.master) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = Math.max(0.5, Math.min(2, pitch));
      const gain = ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain);
      if (pos) {
        const p = this.makePanner(ctx, pos[0], pos[1], pos[2], range);
        gain.connect(p);
        p.connect(this.master);
      } else {
        gain.connect(this.master);
      }
      this.playing.add(src);
      src.onended = () => this.playing.delete(src);
      src.start();
    });
  }

  /**
   * Plays a record at a jukebox, stopping the previous one and the background music; null
   * just stops it. Heard up to 64 blocks away at half the sound volume.
   */
  playStreaming(name: string | null, x: number, y: number, z: number): void {
    if (!this.loaded || (this.options.soundVolume === 0 && name !== null)) return;
    this.streaming?.stop();
    this.streaming = null;
    if (name === null) return;
    const path = this.soundPoolStreaming.getRandomSoundFromSoundPool(name, this.rand);
    const ctx = this.ensureContext();
    if (!path || !ctx) return;
    if (this.music) this.music.pause();
    this.music = null;
    void this.load(path).then((buf) => {
      if (!buf || !this.master) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.value = 0.5 * this.options.soundVolume;
      const panner = this.makePanner(ctx, x, y, z, 16 * 4);
      src.connect(gain);
      gain.connect(panner);
      panner.connect(this.master);
      this.streaming?.stop();
      this.streaming = src;
      src.onended = () => {
        if (this.streaming === src) this.streaming = null;
      };
      src.start();
    });
  }

  /** Positional sound ("step.grass", "random.click", ...). */
  playSound(name: string, x: number, y: number, z: number, volume: number, pitch: number): void {
    if (!this.loaded || this.options.soundVolume === 0 || volume <= 0) return;
    const path = this.soundPoolSounds.getRandomSoundFromSoundPool(name, this.rand);
    if (!path) return;
    let range = 16;
    if (volume > 1) range *= volume;
    if (volume > 1) volume = 1;
    this.start(path, volume * this.options.soundVolume, pitch, [x, y, z], range);
  }

  /** Non-positional UI sound at a quarter of the volume. */
  playSoundFX(name: string, volume: number, pitch: number): void {
    if (!this.loaded || this.options.soundVolume === 0) return;
    const path = this.soundPoolSounds.getRandomSoundFromSoundPool(name, this.rand);
    if (!path) return;
    if (volume > 1) volume = 1;
    volume *= 0.25;
    this.start(path, volume * this.options.soundVolume, pitch, null, 0);
  }

  /** Queues a positional sound that starts after `ticks` game ticks (func_92070_a). */
  playSoundWithDelay(name: string, x: number, y: number, z: number, volume: number, pitch: number, ticks: number): void {
    this.scheduled.push({ name, x, y, z, volume, pitch, ticks });
  }

  /** Counts the delayed sounds down; called once per frame while the game is not paused. */
  updateScheduledSounds(): void {
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      const s = this.scheduled[i];
      if (--s.ticks > 0) continue;
      this.scheduled.splice(i, 1);
      this.playSound(s.name, s.x, s.y, s.z, s.volume, s.pitch);
    }
  }

  /** Starts a looping sound that follows the entity, unless one already plays for it. */
  playEntitySound(name: string, e: Entity, volume: number, pitch: number): void {
    if (!this.loaded || this.options.soundVolume === 0) return;
    if (this.entitySounds.has(e.entityId)) {
      this.updateSoundLocation(e);
      return;
    }
    const path = this.soundPoolSounds.getRandomSoundFromSoundPool(name, this.rand);
    const ctx = this.ensureContext();
    if (!path || volume <= 0 || !ctx || !this.master) return;
    const range = volume > 1 ? 16 * volume : 16;
    const gain = ctx.createGain();
    const panner = this.makePanner(ctx, e.posX, e.posY, e.posZ, range);
    gain.connect(panner);
    panner.connect(this.master);
    const v = Math.min(1, volume) * this.options.soundVolume;
    gain.gain.value = v;
    const es: EntitySound = { src: null, gain, panner, volume: v, paused: false };
    this.entitySounds.set(e.entityId, es);
    void this.load(path).then((buf) => {
      if (!buf || this.entitySounds.get(e.entityId) !== es) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = Math.max(0.5, Math.min(2, pitch));
      src.connect(gain);
      src.start();
      es.src = src;
    });
  }

  updateSoundLocation(e: Entity): void {
    const es = this.entitySounds.get(e.entityId);
    if (es) setPannerPosition(es.panner, e.posX, e.posY, e.posZ);
  }

  isEntitySoundPlaying(e: Entity): boolean {
    return this.entitySounds.has(e.entityId);
  }

  stopEntitySound(e: Entity): void {
    const es = this.entitySounds.get(e.entityId);
    if (!es) return;
    this.entitySounds.delete(e.entityId);
    es.src?.stop();
    es.gain.disconnect();
  }

  setEntitySoundVolume(e: Entity, volume: number): void {
    const es = this.entitySounds.get(e.entityId);
    if (!es) return;
    es.volume = volume * this.options.soundVolume;
    if (!es.paused) es.gain.gain.value = es.volume;
  }

  setEntitySoundPitch(e: Entity, pitch: number): void {
    const es = this.entitySounds.get(e.entityId);
    if (es?.src) es.src.playbackRate.value = Math.max(0.5, Math.min(2, pitch));
  }

  /** Pauses the looping entity sounds (opening the pause menu). */
  pauseAllSounds(): void {
    for (const es of this.entitySounds.values()) {
      es.paused = true;
      es.gain.gain.value = 0;
    }
  }

  resumeAllSounds(): void {
    for (const es of this.entitySounds.values()) {
      es.paused = false;
      es.gain.gain.value = es.volume;
    }
  }

  stopAllSounds(): void {
    for (const s of this.playing) s.stop();
    this.playing.clear();
    for (const es of this.entitySounds.values()) {
      es.src?.stop();
      es.gain.disconnect();
    }
    this.entitySounds.clear();
    this.scheduled.length = 0;
    if (this.music) this.music.pause();
    this.music = null;
    this.streaming?.stop();
    this.streaming = null;
  }
}

function setPannerPosition(p: PannerNode, x: number, y: number, z: number): void {
  if (p.positionX) {
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
  } else p.setPosition(x, y, z);
}
