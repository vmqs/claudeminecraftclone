import { I18n } from '../core/I18n';
import { ItemStack } from '../item/ItemStack';

/** How a statistic's value reads on the Statistics screen (IStatType). */
export type StatType = 'simple' | 'time' | 'distance';

/** Java's DecimalFormat("########0.00"): two decimals, no grouping, ties to the even digit. */
export function formatDecimal(x: number): string {
  // A double lies exactly halfway between two hundredths only when 8x is an odd integer.
  const eighths = x * 8;
  if (Number.isInteger(eighths) && Math.abs(eighths) % 2 === 1) {
    const down = Math.floor(x * 100);
    const n = down % 2 === 0 ? down : down + 1;
    return (n / 100).toFixed(2);
  }
  return x.toFixed(2);
}

/** NumberFormat.getIntegerInstance(Locale.US): "1,234,567". */
export function formatInteger(n: number): string {
  const s = String(Math.abs(Math.trunc(n)));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return n < 0 ? `-${out}` : out;
}

/** Java's Double.toString for the plain-notation range: always at least one decimal. */
function javaDouble(x: number): string {
  return Number.isInteger(x) ? `${x}.0` : String(x);
}

function formatValue(type: StatType, v: number): string {
  if (type === 'time') {
    const s = v / 20;
    const m = s / 60;
    const h = m / 60;
    const d = h / 24;
    const y = d / 365;
    if (y > 0.5) return `${formatDecimal(y)} y`;
    if (d > 0.5) return `${formatDecimal(d)} d`;
    if (h > 0.5) return `${formatDecimal(h)} h`;
    return m > 0.5 ? `${formatDecimal(m)} m` : `${javaDouble(s)} s`;
  }
  if (type === 'distance') {
    const m = v / 100;
    const km = m / 1000;
    if (km > 0.5) return `${formatDecimal(km)} km`;
    return m > 0.5 ? `${formatDecimal(m)} m` : `${v} cm`;
  }
  return formatInteger(v);
}

/**
 * A statistic (StatBase): its id, its name (a lang key, or a function giving the already
 * formatted name of a per-block / per-item statistic), and how its value is shown.
 * Independent statistics are the ones a client counts by itself (movement, jumps, drops,
 * play time, the games and worlds counters); the others are the server's, which a multiplayer
 * guest receives through Packet200Statistic.
 */
export class StatBase {
  isIndependent = false;

  constructor(
    readonly statId: number,
    private readonly statName: string | (() => string),
    readonly type: StatType = 'simple',
  ) {}

  initIndependentStat(): this {
    this.isIndependent = true;
    return this;
  }

  isAchievement(): boolean {
    return false;
  }

  /** func_75968_a: the value as the Statistics screen shows it. */
  format(value: number): string {
    return formatValue(this.type, value);
  }

  getName(): string {
    return typeof this.statName === 'string' ? this.statName : this.statName();
  }

  toString(): string {
    return I18n.translateToLocal(this.getName());
  }
}

/** A general statistic (StatBasic): listed on the General page in registration order. */
export class StatBasic extends StatBase {}

/** A per-block or per-item statistic (StatCrafting): mined, crafted, used, depleted. */
export class StatCrafting extends StatBase {
  constructor(
    statId: number,
    name: () => string,
    private readonly itemID: number,
  ) {
    super(statId, name);
  }

  getItemID(): number {
    return this.itemID;
  }
}

/** A statistic id the registry does not know (StatPlaceholder), kept so the stats file keeps it. */
export class StatPlaceholder extends StatBase {
  constructor(statId: number) {
    super(statId, 'Unknown stat');
  }
}

/**
 * An achievement (Achievement): a statistic with a place on the achievement map (column, row),
 * an icon, the achievement it needs first, and a special (spiky) frame for the hard ones.
 */
export class Achievement extends StatBase {
  private isSpecial = false;
  private stack: ItemStack | null = null;
  /** Fills the description's %1$s (StatStringFormatKeyInv: the inventory key's name). */
  private statStringFormatter: ((text: string) => string) | null = null;

  constructor(
    statId: number,
    /** The lang key suffix: achievement.<key> and achievement.<key>.desc. */
    readonly key: string,
    readonly displayColumn: number,
    readonly displayRow: number,
    /** The icon: an item or block id (damage 0). */
    private readonly iconId: number,
    readonly parentAchievement: Achievement | null,
  ) {
    super(statId, `achievement.${key}`);
  }

  get theItemStack(): ItemStack {
    if (!this.stack) this.stack = new ItemStack(this.iconId, 1, 0);
    return this.stack;
  }

  setIndependent(): this {
    this.isIndependent = true;
    return this;
  }

  setSpecial(): this {
    this.isSpecial = true;
    return this;
  }

  getSpecial(): boolean {
    return this.isSpecial;
  }

  override isAchievement(): boolean {
    return true;
  }

  setStatStringFormatter(fmt: ((text: string) => string) | null): this {
    this.statStringFormatter = fmt;
    return this;
  }

  getDescription(): string {
    const text = I18n.translateToLocal(`achievement.${this.key}.desc`);
    if (!this.statStringFormatter) return text;
    try {
      return this.statStringFormatter(text);
    } catch (e) {
      return `Error: ${(e as Error).message}`;
    }
  }
}
