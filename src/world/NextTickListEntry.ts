import { Block } from '../block/Block';

let nextTickEntryID = 0;

/** A scheduled block update (WorldServer.scheduleBlockUpdate). */
export class NextTickListEntry {
  scheduledTime = 0;
  priority = 0;
  /** Scheduled by the world itself (generation, random ticks), not by a player action. */
  natural = false;
  readonly tickEntryID = nextTickEntryID++;

  constructor(
    readonly xCoord: number,
    readonly yCoord: number,
    readonly zCoord: number,
    readonly blockID: number,
  ) {}

  /** Same position and associated block (equals() of the original). */
  sameAs(o: NextTickListEntry): boolean {
    return this.xCoord === o.xCoord && this.yCoord === o.yCoord && this.zCoord === o.zCoord && Block.isAssociatedBlockID(this.blockID, o.blockID);
  }

  compare(o: NextTickListEntry): number {
    if (this.scheduledTime !== o.scheduledTime) return this.scheduledTime < o.scheduledTime ? -1 : 1;
    if (this.priority !== o.priority) return this.priority - o.priority;
    return this.tickEntryID - o.tickEntryID;
  }

  static posKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }
}

/** Coordinates up to this far out get numeric index keys; beyond, string keys (rare). */
const NEAR = 1 << 21;

/** A numeric key for a block position, or null outside +-2^21 (x, z). */
function posIndex(x: number, y: number, z: number): number | null {
  if (x < -NEAR || x >= NEAR || z < -NEAR || z >= NEAR) return null;
  return ((x + NEAR) * (NEAR * 2) + (z + NEAR)) * 256 + (y & 255);
}

type Slot = NextTickListEntry | NextTickListEntry[];

/**
 * TreeSet + HashSet pair of the original as a binary heap plus a position index. Entries removed
 * with their chunk are only flagged in the heap and skipped when they reach the top (the heap is
 * rebuilt once they outnumber the live ones), so unloading a chunk never rebuilds the whole
 * queue; the order entries come out in is the same.
 */
export class TickScheduler {
  private heap: NextTickListEntry[] = [];
  /** Entries in the heap that were removed with their chunk. */
  private dead = 0;
  /** Entries by position: one entry, or a list when unrelated blocks share a position. */
  private readonly byPos = new Map<number, Slot>();
  private readonly byPosFar = new Map<string, Slot>();
  private readonly removed = new WeakSet<NextTickListEntry>();

  get size(): number {
    return this.heap.length - this.dead;
  }

  private slot(e: NextTickListEntry): Slot | undefined {
    const k = posIndex(e.xCoord, e.yCoord, e.zCoord);
    return k !== null ? this.byPos.get(k) : this.byPosFar.get(NextTickListEntry.posKey(e.xCoord, e.yCoord, e.zCoord));
  }

  private setSlot(e: NextTickListEntry, v: Slot | undefined): void {
    const k = posIndex(e.xCoord, e.yCoord, e.zCoord);
    if (k !== null) {
      if (v === undefined) this.byPos.delete(k);
      else this.byPos.set(k, v);
      return;
    }
    const sk = NextTickListEntry.posKey(e.xCoord, e.yCoord, e.zCoord);
    if (v === undefined) this.byPosFar.delete(sk);
    else this.byPosFar.set(sk, v);
  }

  private unindex(e: NextTickListEntry): void {
    const v = this.slot(e);
    if (v === e) this.setSlot(e, undefined);
    else if (Array.isArray(v)) {
      const i = v.indexOf(e);
      if (i >= 0) v.splice(i, 1);
      if (v.length === 1) this.setSlot(e, v[0]);
      else if (v.length === 0) this.setSlot(e, undefined);
    }
  }

  contains(e: NextTickListEntry): boolean {
    const v = this.slot(e);
    if (v === undefined) return false;
    if (!Array.isArray(v)) return v.sameAs(e);
    for (const o of v) if (o.sameAs(e)) return true;
    return false;
  }

  add(e: NextTickListEntry): boolean {
    const v = this.slot(e);
    if (v !== undefined) {
      if (Array.isArray(v)) {
        for (const o of v) if (o.sameAs(e)) return false;
        v.push(e);
      } else {
        if (v.sameAs(e)) return false;
        this.setSlot(e, [v, e]);
      }
    } else this.setSlot(e, e);
    const h = this.heap;
    h.push(e);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p].compare(e) <= 0) break;
      h[i] = h[p];
      i = p;
    }
    h[i] = e;
    return true;
  }

  /** Removes the heap's top entry (live or not) and restores the heap order. */
  private popTop(): NextTickListEntry {
    const h = this.heap;
    const top = h[0];
    const last = h.pop()!;
    const n = h.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && h[r].compare(h[l]) < 0 ? r : l;
        if (h[c].compare(last) >= 0) break;
        h[i] = h[c];
        i = c;
      }
      h[i] = last;
    }
    return top;
  }

  /** Drops removed entries from the top so heap[0] is live. */
  private skipDead(): void {
    while (this.dead > 0 && this.heap.length > 0 && this.removed.has(this.heap[0])) {
      this.popTop();
      this.dead--;
    }
  }

  peek(): NextTickListEntry | undefined {
    this.skipDead();
    return this.heap[0];
  }

  poll(): NextTickListEntry | undefined {
    this.skipDead();
    if (this.heap.length === 0) return undefined;
    const top = this.popTop();
    this.unindex(top);
    return top;
  }

  /** The entries inside a chunk, in the order they would run (for saving), without removing them. */
  inChunk(cx: number, cz: number): NextTickListEntry[] {
    const out: NextTickListEntry[] = [];
    const dead = this.dead > 0;
    for (const e of this.heap) if (e.xCoord >> 4 === cx && e.zCoord >> 4 === cz && !(dead && this.removed.has(e))) out.push(e);
    return out.sort((a, b) => a.compare(b));
  }

  /** Removes entries inside a chunk (when it unloads) and returns them in the order they would run. */
  removeInChunk(cx: number, cz: number): NextTickListEntry[] {
    const out = this.inChunk(cx, cz);
    if (out.length === 0) return out;
    for (const e of out) {
      this.unindex(e);
      this.removed.add(e);
    }
    this.dead += out.length;
    if (this.dead > 1024 && this.dead > this.heap.length - this.dead) this.compact();
    return out;
  }

  /** Rebuilds the heap from the live entries (the order they come out in does not change). */
  private compact(): void {
    const live = this.heap.filter((e) => !this.removed.has(e));
    this.heap = live;
    this.dead = 0;
    for (let i = (live.length >> 1) - 1; i >= 0; i--) {
      const e = live[i];
      let j = i;
      for (;;) {
        const l = j * 2 + 1;
        if (l >= live.length) break;
        const r = l + 1;
        const c = r < live.length && live[r].compare(live[l]) < 0 ? r : l;
        if (live[c].compare(e) >= 0) break;
        live[j] = live[c];
        j = c;
      }
      live[j] = e;
    }
  }
}
