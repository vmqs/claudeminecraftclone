import type { ResourceManager } from '../assets/ResourceManager';
import type { GameSettings } from '../client/GameSettings';
import { JavaRandom } from '../core/JavaRandom';
import { MathHelper } from '../core/MathHelper';
import type { Entity } from '../entity/Entity';
import type { EntityLiving } from '../entity/EntityLiving';
import { decodeMus } from './MusCodec';
import { SoundPool, type SoundPoolEntry } from './SoundPool';

const f = Math.fround;

/** paulscode's default channel split: 28 normal sources (+ 4 streaming ones). */
const NORMAL_CHANNELS = 28;
/** paulscode clamps every pitch to this range. */
const MIN_PITCH = 0.5;
const MAX_PITCH = 2.0;
/** A one-shot whose data arrives later than this (first decode, slow network) is dropped. */
const MAX_START_DELAY_MS = 1000;
/** Decoded sound cache budget (bytes of PCM); least recently used buffers go first. */
const CACHE_BUDGET = 64 * 1024 * 1024;
/** Folders preloaded once the audio context exists: the sounds every session needs at once. */
const PRELOAD = /^sound3\/(step|dig|random|liquid|damage)\//;

/** A playing (or loading) source on one of the 28 normal channels. */
interface Voice {
  /** "sound_N" for one-shots, "entity_<id>" for looping entity sounds. */
  readonly name: string;
  readonly priority: boolean;
  readonly gain: GainNode;
  readonly panner: PannerNode | null;
  src: AudioBufferSourceNode | null;
  /** Gain without the pause (entity sounds are paused by muting). */
  volume: number;
  paused: boolean;
  done: boolean;
}

/** Background music or a jukebox record: a streamed media element. */
interface StreamVoice {
  readonly audio: HTMLAudioElement;
  readonly gain: GainNode;
  readonly panner: PannerNode | null;
  node: MediaElementAudioSourceNode | null;
  objectUrl: string | null;
  /** True until the media element has started (or failed). */
  pending: boolean;
  stopped: boolean;
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

/** One entry of the debug log (`mc.sndManager.debugLog`) used by the tests. */
export interface SoundDebugEvent {
  /** requested: asked to play; started: a source started; missing: no such name; dropped: no free channel or too late; failed: no data. */
  kind: 'requested' | 'started' | 'missing' | 'dropped' | 'failed' | 'music' | 'record' | 'stopped';
  name: string;
  path?: string;
  volume?: number;
  pitch?: number;
  x?: number;
  y?: number;
  z?: number;
  time: number;
}

interface CacheEntry {
  promise: Promise<AudioBuffer | null>;
  bytes: number;
  lastUse: number;
}

/**
 * SoundManager over Web Audio, following 1.5.2 SoundManager + paulscode SoundSystem:
 *  - sounds by name from three pools (sound3/, music/ + newmusic/, streaming/);
 *  - playSound: positional, linear fall-off to silence at 16 * max(1, volume) blocks, the
 *    volume clamped to 1 (times the sound volume), the pitch to 0.5-2; louder than 1 makes it a
 *    priority source that is never stolen when all 28 channels are busy;
 *  - playSoundFX: non-positional (GUI) at a quarter of the volume;
 *  - looping entity sounds (minecarts), the only sounds pause/resume/stopAllSounds touch;
 *  - background music every 12000-24000 ticks (first after 0-12000) while in a world, and
 *    jukebox records at the jukebox (heard within 64 blocks), including the obfuscated .mus
 *    records, which stop the music;
 *  - the listener follows the player's eyes and look direction every frame.
 * The audio context starts on the first user gesture (browsers block it before). Missing or
 * undecodable files are skipped silently. `debugLog` records what was asked and started.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Set once a user gesture (or the autoplay policy) let the context run. */
  private unlocked = false;
  private readonly soundPoolSounds = new SoundPool();
  private readonly soundPoolStreaming = new SoundPool();
  private readonly soundPoolMusic = new SoundPool();
  private latestSoundID = 0;
  private readonly rand = new JavaRandom();
  private ticksBeforeMusic = this.rand.nextInt(12000);
  private readonly voices: Voice[] = [];
  private readonly entitySounds = new Map<string, Voice>();
  private bgMusic: StreamVoice | null = null;
  private streaming: StreamVoice | null = null;
  private readonly scheduled: ScheduledSound[] = [];
  private readonly cache = new Map<string, CacheEntry>();
  private cacheBytes = 0;
  private preloaded = false;
  loaded = false;
  /** Recent sound events, newest last (at most 256), for tests and debugging. */
  readonly debugLog: SoundDebugEvent[] = [];

  constructor(
    private readonly options: GameSettings,
    private readonly resources: ResourceManager,
  ) {
    this.soundPoolStreaming.isGetRandomSound = false;
  }

  /**
   * Indexes the sound files (Minecraft.installResource) and arms the context start. Under an
   * autoplay-permissive browser the context runs at once; otherwise on the first gesture.
   */
  init(): void {
    for (const p of this.resources.listSounds()) {
      const slash = p.indexOf('/');
      const folder = p.slice(0, slash).toLowerCase();
      const rest = p.slice(slash + 1);
      if (folder === 'sound3') this.soundPoolSounds.addSound(rest, p);
      else if (folder === 'streaming') this.soundPoolStreaming.addSound(rest, p);
      else if (folder === 'music' || folder === 'newmusic') this.soundPoolMusic.addSound(rest, p);
    }
    const unlock = () => {
      const ctx = this.ensureContext();
      if (!ctx) return;
      this.unlocked = true;
      if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    };
    for (const ev of ['pointerdown', 'mousedown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { capture: true });
    // With autoplay allowed (kiosk, automation) the context runs without a gesture.
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'running') this.unlocked = true;
    else if (ctx) {
      ctx.onstatechange = () => {
        if (ctx.state === 'running') this.unlocked = true;
      };
    }
    this.loaded = true;
  }

  /** The context, created on demand (suspended until a gesture in most browsers). */
  private ensureContext(): AudioContext | null {
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        this.ctx = new Ctor({ latencyHint: 'interactive' });
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
      } catch {
        this.ctx = null;
        return null;
      }
    }
    if (!this.preloaded && this.ctx.state === 'running') this.preloadCommonSounds();
    return this.ctx;
  }

  /** True when sounds can actually be heard now (the original's `loaded`). */
  private isRunning(): boolean {
    const ctx = this.ctx;
    if (!ctx || !this.loaded) return false;
    if (ctx.state === 'running') {
      this.unlocked = true;
      if (!this.preloaded) this.preloadCommonSounds();
      return true;
    }
    // Resuming after a gesture: sources started now play as soon as the context runs.
    return this.unlocked;
  }

  /** Decodes the step, dig, random, liquid and damage sounds in the background. */
  private preloadCommonSounds(): void {
    this.preloaded = true;
    const paths = this.resources.listSounds().filter((p) => PRELOAD.test(p));
    let i = 0;
    const next = (): void => {
      if (i >= paths.length) return;
      void this.load(paths[i++]).then(next, next);
    };
    for (let k = 0; k < 4; k++) next();
  }

  // ------------------------------------------------------------------ data

  /** Fetches and decodes a sound file once (null when missing or undecodable). */
  private load(path: string): Promise<AudioBuffer | null> {
    const hit = this.cache.get(path);
    if (hit) {
      hit.lastUse = performance.now();
      return hit.promise;
    }
    const entry: CacheEntry = { promise: Promise.resolve(null), bytes: 0, lastUse: performance.now() };
    entry.promise = (async () => {
      const ctx = this.ctx;
      if (!ctx) return null;
      try {
        const data = await this.fetchSoundData(path);
        if (!data) return null;
        const buf = await ctx.decodeAudioData(data.buffer.byteLength === data.byteLength ? data.buffer : data.slice().buffer);
        entry.bytes = buf.length * buf.numberOfChannels * 4;
        this.cacheBytes += entry.bytes;
        this.trimCache(path);
        return buf;
      } catch {
        return null;
      }
    })();
    this.cache.set(path, entry);
    return entry.promise;
  }

  /** The raw file (".mus" records already de-obfuscated), or null. */
  private async fetchSoundData(path: string): Promise<Uint8Array<ArrayBuffer> | null> {
    let raw: ArrayBuffer | null;
    try {
      raw = await this.resources.getArrayBuffer(path);
    } catch {
      return null;
    }
    if (!raw) return null;
    if (path.toLowerCase().endsWith('.mus')) return decodeMus(raw, path) as Uint8Array<ArrayBuffer>;
    return new Uint8Array(raw);
  }

  private trimCache(keep: string): void {
    if (this.cacheBytes <= CACHE_BUDGET) return;
    const entries = [...this.cache.entries()].filter(([p, e]) => p !== keep && e.bytes > 0).sort((a, b) => a[1].lastUse - b[1].lastUse);
    for (const [p, e] of entries) {
      if (this.cacheBytes <= CACHE_BUDGET * 0.75) break;
      this.cache.delete(p);
      this.cacheBytes -= e.bytes;
    }
  }

  private log(ev: Omit<SoundDebugEvent, 'time'>): void {
    this.debugLog.push({ ...ev, time: performance.now() });
    if (this.debugLog.length > 256) this.debugLog.splice(0, this.debugLog.length - 256);
  }

  // ------------------------------------------------------------------ channels

  /**
   * Finds room on the 28 normal channels: finished voices are dropped first, then the oldest
   * non-priority voice is stopped (paulscode steals channels round-robin). False when every
   * channel holds a priority source.
   */
  private allocateChannel(name: string): boolean {
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i];
      // A source name is reused: the old source of that name goes (paulscode removes it).
      if (v.done || v.name === name) {
        if (!v.done) this.stopVoice(v);
        this.voices.splice(i, 1);
      }
    }
    if (this.voices.length < NORMAL_CHANNELS) return true;
    const victim = this.voices.findIndex((v) => !v.priority);
    if (victim < 0) return false;
    this.stopVoice(this.voices[victim]);
    this.voices.splice(victim, 1);
    return true;
  }

  private stopVoice(v: Voice): void {
    v.done = true;
    try {
      v.src?.stop();
    } catch {
      // never started
    }
    v.gain.disconnect();
    if (v.name.startsWith('entity_') && this.entitySounds.get(v.name) === v) this.entitySounds.delete(v.name);
  }

  private makePanner(ctx: AudioContext, x: number, y: number, z: number, range: number): PannerNode {
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    // paulscode's linear attenuation: full volume at the listener, silent at `range`.
    p.distanceModel = 'linear';
    p.refDistance = 0;
    p.maxDistance = Math.max(range, 1e-3);
    p.rolloffFactor = 1;
    p.coneInnerAngle = 360;
    p.coneOuterAngle = 360;
    setPannerPosition(p, x, y, z);
    return p;
  }

  /**
   * Starts a buffer on a new channel. `pos` null means non-positional (GUI). The voice holds
   * the channel while the data loads.
   */
  private startVoice(
    entry: SoundPoolEntry,
    name: string,
    volume: number,
    pitch: number,
    pos: [number, number, number] | null,
    range: number,
    priority: boolean,
    loop: boolean,
  ): Voice | null {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return null;
    if (!this.allocateChannel(name)) {
      this.log({ kind: 'dropped', name: entry.soundName, path: entry.path });
      return null;
    }
    const gain = ctx.createGain();
    gain.gain.value = clamp01(volume);
    const panner = pos ? this.makePanner(ctx, pos[0], pos[1], pos[2], range) : null;
    if (panner) {
      gain.connect(panner);
      panner.connect(master);
    } else {
      gain.connect(master);
    }
    const voice: Voice = { name, priority, gain, panner, src: null, volume: clamp01(volume), paused: false, done: false };
    this.voices.push(voice);
    const requested = performance.now();
    void this.load(entry.path).then((buf) => {
      if (voice.done) return;
      if (!buf) {
        this.log({ kind: 'failed', name: entry.soundName, path: entry.path });
        this.stopVoice(voice);
        return;
      }
      if (!loop && performance.now() - requested > MAX_START_DELAY_MS) {
        this.log({ kind: 'dropped', name: entry.soundName, path: entry.path });
        this.stopVoice(voice);
        return;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = loop;
      src.playbackRate.value = clampPitch(pitch);
      src.connect(gain);
      src.onended = () => {
        if (voice.src === src) voice.done = true;
        gain.disconnect();
      };
      voice.src = src;
      if (voice.paused) gain.gain.value = 0;
      src.start();
      this.log({ kind: 'started', name: entry.soundName, path: entry.path, volume: voice.volume, pitch: clampPitch(pitch), x: pos?.[0], y: pos?.[1], z: pos?.[2] });
    });
    return voice;
  }

  // ------------------------------------------------------------------ one-shots

  /** Positional sound ("step.grass", "random.click", "mob.zombie.say", ...). */
  playSound(name: string, x: number, y: number, z: number, volume: number, pitch: number): void {
    if (!this.loaded || this.options.soundVolume === 0) return;
    const entry = this.soundPoolSounds.getRandomSoundFromSoundPool(name);
    if (!entry) {
      this.log({ kind: 'missing', name });
      return;
    }
    if (volume <= 0) return;
    this.log({ kind: 'requested', name, path: entry.path, volume, pitch, x, y, z });
    if (!this.isRunning()) return;
    this.latestSoundID = (this.latestSoundID + 1) % 256;
    let range = 16;
    if (volume > 1) range *= volume;
    const priority = volume > 1;
    if (volume > 1) volume = 1;
    this.startVoice(entry, 'sound_' + this.latestSoundID, f(volume * this.options.soundVolume), pitch, [f(x), f(y), f(z)], range, priority, false);
  }

  /** Non-positional UI sound at a quarter of the volume (button clicks, portal whoosh). */
  playSoundFX(name: string, volume: number, pitch: number): void {
    if (!this.loaded || this.options.soundVolume === 0) return;
    const entry = this.soundPoolSounds.getRandomSoundFromSoundPool(name);
    if (!entry) {
      this.log({ kind: 'missing', name });
      return;
    }
    if (volume > 1) volume = 1;
    volume = f(volume * 0.25);
    this.log({ kind: 'requested', name, path: entry.path, volume, pitch });
    if (!this.isRunning()) return;
    this.latestSoundID = (this.latestSoundID + 1) % 256;
    this.startVoice(entry, 'sound_' + this.latestSoundID, f(volume * this.options.soundVolume), pitch, null, 0, false, false);
  }

  /** Queues a positional sound that starts after `ticks` frames (func_92070_a, far thunder). */
  playSoundWithDelay(name: string, x: number, y: number, z: number, volume: number, pitch: number, ticks: number): void {
    this.scheduled.push({ name, x, y, z, volume, pitch, ticks });
  }

  /**
   * Counts the delayed sounds down (func_92071_g). Called once per rendered frame while the
   * game is not paused, as in the original, so the delay is really in frames.
   */
  updateScheduledSounds(): void {
    for (let i = 0; i < this.scheduled.length; i++) {
      const s = this.scheduled[i];
      if (--s.ticks > 0) continue;
      this.playSound(s.name, s.x, s.y, s.z, s.volume, s.pitch);
      this.scheduled.splice(i--, 1);
    }
  }

  // ------------------------------------------------------------------ listener

  /** Listener at the entity's eyes, facing its look direction (setListener). */
  setListener(e: EntityLiving | null, pt: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.loaded || this.options.soundVolume === 0 || !e) return;
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
      l.positionX.value = f(x);
      l.positionY.value = f(y);
      l.positionZ.value = f(z);
      l.forwardX.value = fx;
      l.forwardY.value = fy;
      l.forwardZ.value = fz;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(f(x), f(y), f(z));
      l.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  // ------------------------------------------------------------------ music and records

  private isStreamPlaying(v: StreamVoice | null): boolean {
    return !!v && !v.stopped && (v.pending || (!v.audio.paused && !v.audio.ended));
  }

  /** Background music: a random track of music/ and newmusic/ once the countdown runs out. */
  playRandomMusicIfReady(): void {
    if (!this.loaded || this.options.musicVolume === 0 || !this.isRunning()) return;
    if (this.isStreamPlaying(this.bgMusic) || this.isStreamPlaying(this.streaming)) return;
    if (this.ticksBeforeMusic > 0) {
      this.ticksBeforeMusic--;
      return;
    }
    const entry = this.soundPoolMusic.getRandomSound();
    if (!entry) return;
    this.ticksBeforeMusic = this.rand.nextInt(12000) + 12000;
    this.stopStream(this.bgMusic);
    this.bgMusic = this.startStream(entry, this.options.musicVolume, null);
    this.log({ kind: 'music', name: entry.soundName, path: entry.path, volume: this.options.musicVolume });
  }

  /**
   * Plays a record at a jukebox (or, with null, stops it): a streaming source heard within 64
   * blocks at half the sound volume. It stops the background music, which then waits for the
   * record to end.
   */
  playStreaming(name: string | null, x: number, y: number, z: number): void {
    if (!this.loaded || (this.options.soundVolume === 0 && name !== null)) return;
    if (this.streaming) {
      this.stopStream(this.streaming);
      this.streaming = null;
      this.log({ kind: 'stopped', name: 'streaming' });
    }
    if (name === null) return;
    const entry = this.soundPoolStreaming.getRandomSoundFromSoundPool(name);
    if (!entry) {
      this.log({ kind: 'missing', name });
      return;
    }
    if (!this.isRunning()) return;
    if (this.isStreamPlaying(this.bgMusic)) {
      this.stopStream(this.bgMusic);
      this.bgMusic = null;
    }
    this.streaming = this.startStream(entry, f(0.5 * this.options.soundVolume), [f(x), f(y), f(z)]);
    this.log({ kind: 'record', name, path: entry.path, volume: f(0.5 * this.options.soundVolume), x, y, z });
  }

  /** Streams a file through a media element (fetched and de-obfuscated first for .mus). */
  private startStream(entry: SoundPoolEntry, volume: number, pos: [number, number, number] | null): StreamVoice | null {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return null;
    const audio = new Audio();
    audio.preload = 'auto';
    const gain = ctx.createGain();
    gain.gain.value = clamp01(volume);
    const panner = pos ? this.makePanner(ctx, pos[0], pos[1], pos[2], 16 * 4) : null;
    if (panner) {
      gain.connect(panner);
      panner.connect(master);
    } else gain.connect(master);
    const voice: StreamVoice = { audio, gain, panner, node: null, objectUrl: null, pending: true, stopped: false };
    const fail = () => {
      voice.pending = false;
      if (!voice.stopped) this.log({ kind: 'failed', name: entry.soundName, path: entry.path });
      this.stopStream(voice);
    };
    audio.onended = () => this.stopStream(voice);
    audio.onerror = fail;
    void (async () => {
      let url: string | null;
      if (entry.path.toLowerCase().endsWith('.mus')) {
        const data = await this.fetchSoundData(entry.path);
        if (!data || voice.stopped) return fail();
        voice.objectUrl = URL.createObjectURL(new Blob([data], { type: 'audio/ogg' }));
        url = voice.objectUrl;
      } else {
        url = this.resources.resolve(entry.path);
      }
      if (!url || voice.stopped) return fail();
      try {
        voice.node = ctx.createMediaElementSource(audio);
        voice.node.connect(gain);
      } catch {
        // Fall back to the element's own output (no positional fall-off).
        audio.volume = clamp01(volume);
      }
      audio.src = url;
      try {
        await audio.play();
        voice.pending = false;
        this.log({ kind: 'started', name: entry.soundName, path: entry.path, volume });
      } catch {
        fail();
      }
    })();
    return voice;
  }

  private stopStream(v: StreamVoice | null): void {
    if (!v || v.stopped) return;
    v.stopped = true;
    v.pending = false;
    v.audio.pause();
    v.audio.removeAttribute('src');
    try {
      v.audio.load();
    } catch {
      // nothing loaded
    }
    v.node?.disconnect();
    v.gain.disconnect();
    if (v.objectUrl) URL.revokeObjectURL(v.objectUrl);
    if (this.bgMusic === v) this.bgMusic = null;
    if (this.streaming === v) this.streaming = null;
  }

  /**
   * The Music and Sound sliders: music off stops the music and the record; otherwise both
   * (records included, an original quirk) take the music volume.
   */
  onSoundOptionsChanged(): void {
    if (!this.loaded) return;
    if (this.options.musicVolume === 0) {
      this.stopStream(this.bgMusic);
      this.stopStream(this.streaming);
    } else {
      for (const v of [this.bgMusic, this.streaming]) if (v) setStreamVolume(v, this.options.musicVolume);
    }
  }

  // ------------------------------------------------------------------ entity loops

  /** Starts a looping sound that follows the entity, unless one already plays for it. */
  playEntitySound(name: string | null, e: Entity, volume: number, pitch: number, priority = false): void {
    if (!this.loaded || (this.options.soundVolume === 0 && name !== null)) return;
    const key = 'entity_' + e.entityId;
    const existing = this.entitySounds.get(key);
    if (existing && !existing.done) {
      this.updateSoundLocation(e);
      return;
    }
    if (existing) this.entitySounds.delete(key);
    if (name === null) return;
    const entry = this.soundPoolSounds.getRandomSoundFromSoundPool(name);
    if (!entry) {
      this.log({ kind: 'missing', name });
      return;
    }
    if (volume <= 0 || !this.isRunning()) return;
    const range = volume > 1 ? 16 * volume : 16;
    const voice = this.startVoice(entry, key, f(Math.min(1, volume) * this.options.soundVolume), pitch, [f(e.posX), f(e.posY), f(e.posZ)], range, priority, true);
    if (voice) this.entitySounds.set(key, voice);
  }

  updateSoundLocation(e: Entity, at: Entity = e): void {
    const v = this.entitySounds.get('entity_' + e.entityId);
    if (!v) return;
    if (v.done) this.entitySounds.delete('entity_' + e.entityId);
    else if (v.panner) setPannerPosition(v.panner, f(at.posX), f(at.posY), f(at.posZ));
  }

  isEntitySoundPlaying(e: Entity | null): boolean {
    if (!e || !this.loaded) return false;
    const v = this.entitySounds.get('entity_' + e.entityId);
    return !!v && !v.done;
  }

  stopEntitySound(e: Entity | null): void {
    if (!e || !this.loaded) return;
    const v = this.entitySounds.get('entity_' + e.entityId);
    if (v) this.stopVoice(v);
    this.entitySounds.delete('entity_' + e.entityId);
  }

  setEntitySoundVolume(e: Entity | null, volume: number): void {
    if (!e || !this.loaded || this.options.soundVolume === 0) return;
    const v = this.entitySounds.get('entity_' + e.entityId);
    if (!v || v.done) return;
    v.volume = clamp01(volume * this.options.soundVolume);
    if (!v.paused) v.gain.gain.value = v.volume;
  }

  setEntitySoundPitch(e: Entity | null, pitch: number): void {
    if (!e || !this.loaded || this.options.soundVolume === 0) return;
    const v = this.entitySounds.get('entity_' + e.entityId);
    if (v?.src) v.src.playbackRate.value = clampPitch(pitch);
  }

  /** Pauses the looping entity sounds (the pause menu); one-shots and music play on. */
  pauseAllSounds(): void {
    for (const v of this.entitySounds.values()) {
      v.paused = true;
      v.gain.gain.value = 0;
    }
  }

  resumeAllSounds(): void {
    for (const v of this.entitySounds.values()) {
      v.paused = false;
      v.gain.gain.value = v.volume;
    }
  }

  /**
   * Stops the looping entity sounds (world change). As in the original, one-shots, delayed
   * sounds and the background music carry on; the record is stopped with playStreaming(null).
   */
  stopAllSounds(): void {
    for (const v of [...this.entitySounds.values()]) this.stopVoice(v);
    this.entitySounds.clear();
  }

  /** Quitting the game (sndSystem.cleanup): everything stops. */
  closeMinecraft(): void {
    this.stopAllSounds();
    for (const v of this.voices) if (!v.done) this.stopVoice(v);
    this.voices.length = 0;
    this.scheduled.length = 0;
    this.stopStream(this.bgMusic);
    this.stopStream(this.streaming);
  }

  // ------------------------------------------------------------------ inspection

  /** Whether a sound name exists in the sound pool ("step.grass"). */
  hasSound(name: string): boolean {
    return this.soundPoolSounds.getEntries(name).length > 0;
  }

  /** State for tests: context, channels, cache and music. */
  getDebugInfo(): Record<string, unknown> {
    return {
      context: this.ctx?.state ?? 'none',
      unlocked: this.unlocked,
      channels: this.voices.filter((v) => !v.done).length,
      entitySounds: this.entitySounds.size,
      cachedFiles: this.cache.size,
      cachedBytes: this.cacheBytes,
      ticksBeforeMusic: this.ticksBeforeMusic,
      music: this.isStreamPlaying(this.bgMusic) ? this.bgMusic!.audio.currentSrc : null,
      record: this.isStreamPlaying(this.streaming) ? this.streaming!.audio.currentSrc || 'pending' : null,
      sounds: this.soundPoolSounds.numberOfSoundPoolEntries,
      music_tracks: this.soundPoolMusic.numberOfSoundPoolEntries,
      records: this.soundPoolStreaming.getSoundNames(),
    };
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clampPitch(p: number): number {
  return p < MIN_PITCH ? MIN_PITCH : p > MAX_PITCH ? MAX_PITCH : p;
}

function setStreamVolume(v: StreamVoice, volume: number): void {
  if (v.node) v.gain.gain.value = clamp01(volume);
  else v.audio.volume = clamp01(volume);
}

function setPannerPosition(p: PannerNode, x: number, y: number, z: number): void {
  if (p.positionX) {
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
  } else p.setPosition(x, y, z);
}
