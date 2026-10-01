/**
 * StringTranslate / StatCollector: key -> text from lang/en_US.lang.
 * Worker-safe: the table is filled with `I18n.load(text)` by whoever has the file.
 */
const table = new Map<string, string>();

/** Minimal java.util.Formatter: %s %d %f %.Nf %n$s %n$d %%. */
export function javaFormat(fmt: string, args: readonly unknown[]): string {
  let auto = 0;
  return fmt.replace(/%(?:(\d+)\$)?(\.\d+)?([sdfx%])/g, (_m, idx: string | undefined, prec: string | undefined, conv: string) => {
    if (conv === '%') return '%';
    const arg = idx ? args[Number(idx) - 1] : args[auto++];
    switch (conv) {
      case 'd':
        return String(Math.trunc(Number(arg)));
      case 'x':
        return (Number(arg) >>> 0).toString(16);
      case 'f':
        return Number(arg).toFixed(prec ? Number(prec.slice(1)) : 6);
      default:
        return String(arg);
    }
  });
}

export const I18n = {
  /** Parses a .lang file the way StringTranslate did (lines with exactly one '=' only). */
  load(text: string): void {
    for (let line of text.split(/\r?\n/)) {
      line = line.trim();
      if (line.startsWith('#')) continue;
      const parts = line.split('=');
      // Java's split drops trailing empty strings, so "key=" has length 1 and is skipped.
      while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
      if (parts.length === 2) table.set(parts[0], parts[1]);
    }
  },

  /** Loads a table that was already parsed (e.g. transferred to a worker). */
  loadEntries(entries: Iterable<[string, string]>): void {
    for (const [k, v] of entries) table.set(k, v);
  },

  entries(): [string, string][] {
    return [...table.entries()];
  },

  translateToLocal(key: string): string {
    return table.get(key) ?? key;
  },

  translateToLocalFormatted(key: string, ...args: unknown[]): string {
    const fmt = table.get(key) ?? key;
    try {
      return javaFormat(fmt, args);
    } catch {
      return 'Format error: ' + fmt;
    }
  },

  canTranslate(key: string): boolean {
    return table.has(key);
  },

  /** translateNamedKey: `key.name` or "" */
  translateNamedKey(key: string): string {
    return table.get(key + '.name') ?? '';
  },
};

export default I18n;
