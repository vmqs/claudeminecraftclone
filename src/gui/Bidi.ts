/**
 * The part of java.text.Bidi the FontRenderer needs (bidiReorder): runs of embedding levels
 * for one paragraph in DIRECTION_DEFAULT_LEFT_TO_RIGHT mode, and the visual reordering of
 * those runs. It implements the weak and neutral type rules of the Unicode bidirectional
 * algorithm without explicit embeddings, which covers chat and language names.
 */

const enum T {
  L,
  R,
  AL,
  EN,
  ES,
  ET,
  AN,
  CS,
  NSM,
  B,
  S,
  WS,
  ON,
}

function charType(c: number): T {
  if (c >= 0x30 && c <= 0x39) return T.EN;
  if (c === 0x2b || c === 0x2d) return T.ES;
  if (c === 0x23 || c === 0x24 || c === 0x25 || c === 0xb0 || c === 0xb1 || (c >= 0xa2 && c <= 0xa5) || c === 0x2030 || c === 0x20ac) return T.ET;
  if (c === 0x2c || c === 0x2e || c === 0x2f || c === 0x3a || c === 0xa0) return T.CS;
  if (c === 0x0a || c === 0x0d || c === 0x1c || c === 0x1d || c === 0x1e || c === 0x85 || c === 0x2029) return T.B;
  if (c === 0x09 || c === 0x0b || c === 0x1f) return T.S;
  if (c === 0x20 || c === 0x0c || c === 0x2028 || (c >= 0x2000 && c <= 0x200a)) return T.WS;
  if (c === 0xb2 || c === 0xb3 || c === 0xb9 || (c >= 0x06f0 && c <= 0x06f9)) return T.EN;
  if ((c >= 0x0660 && c <= 0x0669) || c === 0x066b || c === 0x066c) return T.AN;
  if ((c >= 0x0300 && c <= 0x036f) || (c >= 0x0591 && c <= 0x05bd) || c === 0x05bf || c === 0x05c1 || c === 0x05c2 || c === 0x05c4 || c === 0x05c5 || c === 0x05c7) return T.NSM;
  if ((c >= 0x0610 && c <= 0x061a) || (c >= 0x064b && c <= 0x065f) || c === 0x0670 || (c >= 0x06d6 && c <= 0x06dc) || (c >= 0x06df && c <= 0x06e4) || c === 0x06e7 || c === 0x06e8 || (c >= 0x06ea && c <= 0x06ed)) return T.NSM;
  if ((c >= 0x0590 && c <= 0x05ff) || (c >= 0x07c0 && c <= 0x085f) || (c >= 0xfb1d && c <= 0xfb4f)) return T.R;
  if ((c >= 0x0600 && c <= 0x07bf) || (c >= 0x0860 && c <= 0x08ff) || (c >= 0xfb50 && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfeff)) return T.AL;
  if (c < 0x80) {
    // ASCII punctuation and symbols that are not numbers' separators or terminators.
    if ((c >= 0x21 && c <= 0x2f) || (c >= 0x3a && c <= 0x40) || (c >= 0x5b && c <= 0x60) || (c >= 0x7b && c <= 0x7e)) return T.ON;
    if (c < 0x20 || c === 0x7f) return T.WS;
    return T.L;
  }
  if ((c >= 0xa1 && c <= 0xbf && c !== 0xaa && c !== 0xb5 && c !== 0xba) || c === 0xd7 || c === 0xf7) return T.ON;
  if ((c >= 0x2010 && c <= 0x2027) || (c >= 0x2030 && c <= 0x205e) || (c >= 0x2190 && c <= 0x2bff) || (c >= 0x3001 && c <= 0x3003)) return T.ON;
  return T.L;
}

const isRtl = (t: T) => t === T.R || t === T.AL || t === T.AN;

/** Bidi.requiresBidi: any right-to-left character or Arabic number. */
export function requiresBidi(s: string): boolean {
  for (let i = 0; i < s.length; i++) if (isRtl(charType(s.charCodeAt(i)))) return true;
  return false;
}

export interface BidiRun {
  start: number;
  limit: number;
  level: number;
}

/** The level runs of `s` (getRunCount / getRunStart / getRunLimit / getRunLevel). */
export function bidiRuns(s: string): BidiRun[] {
  const n = s.length;
  const types: T[] = new Array<T>(n);
  for (let i = 0; i < n; i++) types[i] = charType(s.charCodeAt(i));
  let para = 0;
  for (const t of types) {
    if (t === T.L) break;
    if (t === T.R || t === T.AL) {
      para = 1;
      break;
    }
  }
  const sor = para & 1 ? T.R : T.L;
  // W1: non-spacing marks take the type of the previous character.
  for (let i = 0; i < n; i++) if (types[i] === T.NSM) types[i] = i === 0 ? sor : types[i - 1];
  // W2: European numbers after Arabic letters become Arabic numbers. W3: AL -> R.
  let lastStrong = sor;
  for (let i = 0; i < n; i++) {
    const t = types[i];
    if (t === T.L || t === T.R || t === T.AL) lastStrong = t;
    else if (t === T.EN && lastStrong === T.AL) types[i] = T.AN;
  }
  for (let i = 0; i < n; i++) if (types[i] === T.AL) types[i] = T.R;
  // W4: a single separator between two numbers of the same kind joins them.
  for (let i = 1; i < n - 1; i++) {
    const a = types[i - 1];
    const b = types[i + 1];
    if (types[i] === T.ES && a === T.EN && b === T.EN) types[i] = T.EN;
    else if (types[i] === T.CS && a === b && (a === T.EN || a === T.AN)) types[i] = a;
  }
  // W5: terminators next to European numbers become numbers.
  for (let i = 0; i < n; i++) {
    if (types[i] !== T.ET) continue;
    let j = i;
    while (j < n && types[j] === T.ET) j++;
    const touches = (i > 0 && types[i - 1] === T.EN) || (j < n && types[j] === T.EN);
    for (let k = i; k < j; k++) types[k] = touches ? T.EN : T.ON;
    i = j - 1;
  }
  // W6: remaining separators are neutral. W7: European numbers after L are L.
  for (let i = 0; i < n; i++) if (types[i] === T.ES || types[i] === T.CS) types[i] = T.ON;
  lastStrong = sor;
  for (let i = 0; i < n; i++) {
    const t = types[i];
    if (t === T.L || t === T.R) lastStrong = t;
    else if (t === T.EN && lastStrong === T.L) types[i] = T.L;
  }
  // N1/N2: neutrals between characters of one direction take it, others the paragraph's.
  const strongDir = (t: T): T | null => (t === T.L ? T.L : t === T.R || t === T.EN || t === T.AN ? T.R : null);
  for (let i = 0; i < n; i++) {
    if (strongDir(types[i]) !== null) continue;
    let j = i;
    while (j < n && strongDir(types[j]) === null) j++;
    const before = i === 0 ? sor : strongDir(types[i - 1])!;
    const after = j === n ? sor : strongDir(types[j])!;
    const dir = before === after ? before : sor;
    for (let k = i; k < j; k++) types[k] = dir;
    i = j - 1;
  }
  const levels = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const t = types[i];
    if (para === 0) levels[i] = t === T.R ? 1 : t === T.AN || t === T.EN ? 2 : 0;
    else levels[i] = t === T.L || t === T.EN || t === T.AN ? 2 : 1;
  }
  const runs: BidiRun[] = [];
  for (let i = 0; i < n; ) {
    let j = i + 1;
    while (j < n && levels[j] === levels[i]) j++;
    runs.push({ start: i, limit: j, level: levels[i] });
    i = j;
  }
  if (runs.length === 0) runs.push({ start: 0, limit: 0, level: para });
  return runs;
}

/** Bidi.reorderVisually: reverses sequences of runs from the highest level down to the lowest odd one. */
export function reorderVisually<O>(levels: number[], objects: O[]): void {
  let max = 0;
  let minOdd = 255;
  for (const l of levels) {
    if (l > max) max = l;
    if (l & 1 && l < minOdd) minOdd = l;
  }
  const order = levels.slice();
  for (let level = max; level >= minOdd && level > 0; level--) {
    for (let i = 0; i < order.length; ) {
      if (order[i] < level) {
        i++;
        continue;
      }
      let j = i;
      while (j < order.length && order[j] >= level) j++;
      for (let a = i, b = j - 1; a < b; a++, b--) {
        [objects[a], objects[b]] = [objects[b], objects[a]];
        [order[a], order[b]] = [order[b], order[a]];
      }
      i = j;
    }
  }
}
