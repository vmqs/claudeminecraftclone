import type { World } from './World';

const f = Math.fround;

export type WeatherKind = 'clear' | 'rain' | 'thunder';

/**
 * Weather as the 1.5.2 client sees it, next to the integrated server's cycle that World runs
 * (World.updateWeather: WorldInfo rainTime/thunderTime and the server's rain and thunder
 * strengths, which drive isRaining(), lightning, snow, ice and cauldrons).
 *
 * In 1.5.2 the client world keeps its own strengths (WorldClient.updateWeather) and learns only
 * two things from the server, through Packet70GameEvent: "rain begins" when the server's
 * isRaining() turns true (the client restarts its rain strength at 0) and "rain ends" when it
 * turns false (restart at 1). No packet carries thunder, so the rendered thunder strength stays
 * 0 and a thunderstorm looks exactly like rain apart from the bolts and their flash. Sky colour,
 * clouds, fog, the lightmap and rain rendering all read these client values.
 */
export class WeatherCycle {
  /**
   * Later versions sync thunder to the client (darker storms). Off reproduces 1.5.2; switching it
   * on makes the client follow the server's thunder flag.
   */
  static syncThunder = false;

  /** The client WorldInfo's raining flag (set by the begin/end rain events). */
  raining = false;
  /** The client WorldInfo's thundering flag (never set by 1.5.2). */
  thundering = false;
  prevRainingStrength = 0;
  rainingStrength = 0;
  prevThunderingStrength = 0;
  thunderingStrength = 0;
  private joined = false;

  constructor(private readonly world: World) {}

  /** One game tick: the server's cycle, the rain events it sends, then the client's smoothing. */
  tick(): void {
    const w = this.world;
    if (!this.joined) {
      // ServerConfigurationManager.updateTimeAndWeatherForPlayer: joining a rainy world.
      this.joined = true;
      if (w.isRaining()) this.onRainEvent(true);
    }
    const wasRaining = w.isRaining();
    w.updateWeather();
    const raining = w.isRaining();
    if (raining !== wasRaining) this.onRainEvent(raining);
    if (WeatherCycle.syncThunder) this.thundering = w.worldInfo.thundering;
    this.updateClientWeather();
  }

  /** NetClientHandler.handleGameEvent 1 (begin raining) / 2 (end raining). */
  private onRainEvent(begin: boolean): void {
    this.raining = begin;
    this.setRainStrength(begin ? 0 : 1);
  }

  /** WorldClient.updateWeather: 0.01 per tick towards the client's flags. */
  private updateClientWeather(): void {
    if (this.world.provider.hasNoSky) return;
    this.prevRainingStrength = this.rainingStrength;
    this.rainingStrength = f(this.rainingStrength + (this.raining ? 0.01 : -0.01));
    if (this.rainingStrength < 0) this.rainingStrength = 0;
    if (this.rainingStrength > 1) this.rainingStrength = 1;
    this.prevThunderingStrength = this.thunderingStrength;
    this.thunderingStrength = f(this.thunderingStrength + (this.thundering ? 0.01 : -0.01));
    if (this.thunderingStrength < 0) this.thunderingStrength = 0;
    if (this.thunderingStrength > 1) this.thunderingStrength = 1;
  }

  setRainStrength(v: number): void {
    this.prevRainingStrength = v;
    this.rainingStrength = v;
  }

  /** Rendered rain strength (0..1) at partial tick `pt`. */
  getRainStrength(pt: number): number {
    return f(this.prevRainingStrength + f(f(this.rainingStrength - this.prevRainingStrength) * pt));
  }

  /** Rendered thunder strength, weighted by the rain strength (0 in 1.5.2). */
  getWeightedThunderStrength(pt: number): number {
    return f(f(this.prevThunderingStrength + f(f(this.thunderingStrength - this.prevThunderingStrength) * pt)) * this.getRainStrength(pt));
  }

  isRaining(): boolean {
    return this.getRainStrength(1) > 0.2;
  }

  isThundering(): boolean {
    return this.getWeightedThunderStrength(1) > 0.9;
  }

  /**
   * Ends any transition at once, server and client side (both strengths jump to their targets
   * and the rain event is considered sent). For tests and captures; the game never does this.
   */
  skipTransition(): void {
    const w = this.world;
    const info = w.worldInfo;
    this.joined = true;
    w.setRainStrength(info.raining ? 1 : 0);
    w.setThunderStrength(info.thundering ? 1 : 0);
    this.raining = info.raining;
    if (WeatherCycle.syncThunder) this.thundering = info.thundering;
    this.setRainStrength(this.raining ? 1 : 0);
    const t = this.thundering ? 1 : 0;
    this.prevThunderingStrength = t;
    this.thunderingStrength = t;
  }

  // ------------------------------------------------------------------ commands

  /**
   * CommandWeather (/weather clear|rain|thunder [seconds]): sets the flags and both timers to
   * `seconds` * 20 ticks, by default a random 300-899 seconds. The strengths then ramp as usual.
   */
  static setWeather(w: World, kind: WeatherKind, seconds?: number): void {
    const ticks = (seconds ?? 300 + Math.floor(Math.random() * 600)) * 20;
    const info = w.worldInfo;
    info.rainTime = ticks;
    info.thunderTime = ticks;
    info.raining = kind !== 'clear';
    info.thundering = kind === 'thunder';
  }

  /** CommandToggleDownfall (/toggledownfall): ends or starts the rain next tick and sets thunder. */
  static toggleDownfall(w: World): void {
    w.toggleRain();
    w.worldInfo.thundering = true;
  }
}
