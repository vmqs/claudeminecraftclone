import { Block } from '../block/Block';

let nextTickEntryID = 0;

/** A scheduled block update (WorldServer.scheduleBlockUpdate). */
export class NextTickListEntry {
  scheduledTime = 0;
  priority = 0;
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

/** TreeSet + HashSet pair of the original as a binary heap plus a position index. */
export class TickScheduler {
  private heap: NextTickListEntry[] = [];
  private byPos = new Map<string, NextTickListEntry[]>();

  get size(): number {
    return this.heap.length;
  }

  contains(e: NextTickListEntry): boolean {
    return this.byPos.get(NextTickListEntry.posKey(e.xCoord, e.yCoord, e.zCoord))?.some((o) => o.sameAs(e)) ?? false;
  }

  add(e: NextTickListEntry): boolean {
    if (this.contains(e)) return false;
    const k = NextTickListEntry.posKey(e.xCoord, e.yCoord, e.zCoord);
    let list = this.byPos.get(k);
    if (!list) this.byPos.set(k, (list = []));
    list.push(e);
    const h = this.heap;
    h.push(e);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p].compare(h[i]) <= 0) break;
      [h[p], h[i]] = [h[i], h[p]];
      i = p;
    }
    return true;
  }

  peek(): NextTickListEntry | undefined {
    return this.heap[0];
  }

  poll(): NextTickListEntry | undefined {
    const h = this.heap;
    if (h.length === 0) return undefined;
    const top = h[0];
    const last = h.pop()!;
    if (h.length > 0) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && h[l].compare(h[m]) < 0) m = l;
        if (r < h.length && h[r].compare(h[m]) < 0) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        i = m;
      }
    }
    const k = NextTickListEntry.posKey(top.xCoord, top.yCoord, top.zCoord);
    const list = this.byPos.get(k);
    if (list) {
      const idx = list.indexOf(top);
      if (idx >= 0) list.splice(idx, 1);
      if (list.length === 0) this.byPos.delete(k);
    }
    return top;
  }

  /** Removes entries inside a chunk (when it unloads) and returns them. */
  removeInChunk(cx: number, cz: number): NextTickListEntry[] {
    const keep: NextTickListEntry[] = [];
    const removed: NextTickListEntry[] = [];
    for (const e of this.heap) ((e.xCoord >> 4) === cx && (e.zCoord >> 4) === cz ? removed : keep).push(e);
    if (removed.length === 0) return removed;
    this.heap = [];
    this.byPos.clear();
    for (const e of keep) this.add(e);
    return removed;
  }
}
