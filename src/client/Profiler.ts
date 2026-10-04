/** One row of profiling data: share of the parent, share of the whole frame, section name. */
export class ProfilerResult {
  constructor(
    readonly name: string,
    /** Percent of the parent section (field_76332_a). */
    readonly sectionPercent: number,
    /** Percent of "root" (field_76330_b). */
    readonly globalPercent: number,
  ) {}

  /** The pie slice colour (func_76329_a). */
  getColor(): number {
    let h = 0;
    for (let i = 0; i < this.name.length; i++) h = (Math.imul(31, h) + this.name.charCodeAt(i)) | 0;
    return (h & 0xaaaaaa) + 0x444444;
  }

  /** Larger shares first, then by name descending (ProfilerResult.compareTo). */
  static compare(a: ProfilerResult, b: ProfilerResult): number {
    if (b.sectionPercent < a.sectionPercent) return -1;
    if (b.sectionPercent > a.sectionPercent) return 1;
    return b.name < a.name ? -1 : b.name > a.name ? 1 : 0;
  }
}

/**
 * Nested timing sections ("root.tick.level", ...) for the F3 profiler chart and /debug
 * (Profiler). Times accumulate in nanoseconds and decay by 0.1% every time they are read.
 */
export class Profiler {
  profilingEnabled = false;
  private readonly sectionList: string[] = [];
  private readonly timestampList: number[] = [];
  private profilingSection = '';
  private readonly profilingMap = new Map<string, number>();

  clearProfiling(): void {
    this.profilingMap.clear();
    this.profilingSection = '';
    this.sectionList.length = 0;
    this.timestampList.length = 0;
  }

  startSection(name: string): void {
    if (!this.profilingEnabled) return;
    if (this.profilingSection.length > 0) this.profilingSection += '.';
    this.profilingSection += name;
    this.sectionList.push(this.profilingSection);
    this.timestampList.push(performance.now() * 1e6);
  }

  endSection(): void {
    if (!this.profilingEnabled || this.timestampList.length === 0) return;
    const now = performance.now() * 1e6;
    const start = this.timestampList.pop()!;
    this.sectionList.pop();
    const d = now - start;
    this.profilingMap.set(this.profilingSection, (this.profilingMap.get(this.profilingSection) ?? 0) + d);
    if (d > 100000000) console.log(`Something's taking too long! '${this.profilingSection}' took aprox ${d / 1e6} ms`);
    this.profilingSection = this.sectionList.length > 0 ? this.sectionList[this.sectionList.length - 1] : '';
  }

  endStartSection(name: string): void {
    this.endSection();
    this.startSection(name);
  }

  getNameOfLastSection(): string {
    return this.sectionList.length === 0 ? '[UNKNOWN]' : this.sectionList[this.sectionList.length - 1];
  }

  /** The children of `section`, the first entry being the section itself (getProfilingData). */
  getProfilingData(section: string): ProfilerResult[] | null {
    if (!this.profilingEnabled) return null;
    const name = section;
    let root = this.profilingMap.get('root') ?? 0;
    const self = this.profilingMap.get(section) ?? -1;
    const out: ProfilerResult[] = [];
    let prefix = section;
    if (prefix.length > 0) prefix += '.';
    const isChild = (k: string) => k.length > prefix.length && k.startsWith(prefix) && k.indexOf('.', prefix.length + 1) < 0;
    let total = 0;
    for (const [k, v] of this.profilingMap) if (isChild(k)) total += v;
    const childSum = Math.fround(total);
    if (total < self) total = self;
    if (root < total) root = total;
    for (const [k, v] of this.profilingMap) {
      if (isChild(k)) out.push(new ProfilerResult(k.substring(prefix.length), (v * 100) / total, (v * 100) / root));
    }
    for (const [k, v] of this.profilingMap) this.profilingMap.set(k, Math.trunc((v * 999) / 1000));
    if (Math.fround(total) > childSum) out.push(new ProfilerResult('unspecified', ((Math.fround(total) - childSum) * 100) / total, ((Math.fround(total) - childSum) * 100) / root));
    out.sort(ProfilerResult.compare);
    out.unshift(new ProfilerResult(name, 100, (total * 100) / root));
    return out;
  }
}
