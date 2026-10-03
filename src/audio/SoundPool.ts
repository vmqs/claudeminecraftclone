import { JavaRandom } from '../core/JavaRandom';

/** One file of a pool: the sound name it answers to and its asset path. */
export class SoundPoolEntry {
  constructor(
    readonly soundName: string,
    readonly path: string,
  ) {}
}

/**
 * SoundPool: files grouped by sound name. "step/grass1.ogg" is added as "step.grass": the
 * extension goes (everything from the first dot), trailing digits are stripped when
 * `isGetRandomSound` is set, and slashes become dots. A name then plays one of its files at
 * random ("step.grass" -> grass1..grass4).
 */
export class SoundPool {
  private readonly rand = new JavaRandom();
  private readonly nameToSoundPoolEntriesMapping = new Map<string, SoundPoolEntry[]>();
  private readonly allSoundPoolEntries: SoundPoolEntry[] = [];
  numberOfSoundPoolEntries = 0;
  /** False for records ("13", "11" and "where are we now" keep their digits). */
  isGetRandomSound = true;

  /** `relative` is the path inside the pool's folder ("step/grass1.ogg"). */
  addSound(relative: string, path: string): SoundPoolEntry {
    const dot = relative.indexOf('.');
    let name = dot >= 0 ? relative.slice(0, dot) : relative;
    if (this.isGetRandomSound) while (name.length > 0 && isDigit(name.charCodeAt(name.length - 1))) name = name.slice(0, -1);
    name = name.replace(/\//g, '.');
    let list = this.nameToSoundPoolEntriesMapping.get(name);
    if (!list) this.nameToSoundPoolEntriesMapping.set(name, (list = []));
    const entry = new SoundPoolEntry(name, path);
    list.push(entry);
    this.allSoundPoolEntries.push(entry);
    this.numberOfSoundPoolEntries++;
    return entry;
  }

  /** A random file of the name, or null when the name has none. */
  getRandomSoundFromSoundPool(name: string): SoundPoolEntry | null {
    const list = this.nameToSoundPoolEntriesMapping.get(name);
    return list ? list[this.rand.nextInt(list.length)] : null;
  }

  /** A random file of the whole pool (background music). */
  getRandomSound(): SoundPoolEntry | null {
    return this.allSoundPoolEntries.length === 0 ? null : this.allSoundPoolEntries[this.rand.nextInt(this.allSoundPoolEntries.length)];
  }

  /** Every entry of a name (no random roll). */
  getEntries(name: string): readonly SoundPoolEntry[] {
    return this.nameToSoundPoolEntriesMapping.get(name) ?? [];
  }

  getSoundNames(): string[] {
    return [...this.nameToSoundPoolEntriesMapping.keys()];
  }
}

function isDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}
