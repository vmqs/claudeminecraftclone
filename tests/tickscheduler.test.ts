/**
 * TickScheduler (World's scheduled block updates) against a plain sorted-list model under random
 * adds, polls, peeks, duplicate checks and chunk removals: the same entries must come out in the
 * same order, removals must return a chunk's entries in the order they would run.
 *
 *   node scripts/run-node-test.mjs tests/tickscheduler.test.ts
 */
import '../src/block/Blocks';
import { JavaRandom } from '../src/core/JavaRandom';
import { NextTickListEntry, TickScheduler } from '../src/world/NextTickListEntry';
import { check, report } from './harness';

const rand = new JavaRandom(42n);
const s = new TickScheduler();
let model: NextTickListEntry[] = [];
const ids = [8, 9, 10, 11, 12, 13, 55, 93];
let mismatches = 0;
let polled = 0;
let removed = 0;
let time = 0;
const far = (n: number) => (rand.nextInt(10) === 0 ? n * 400000 : n);
for (let step = 0; step < 60000; step++) {
  const op = rand.nextInt(100);
  if (op < 55) {
    const e = new NextTickListEntry(far(rand.nextInt(96) - 48), rand.nextInt(4) + 60, far(rand.nextInt(96) - 48), ids[rand.nextInt(ids.length)]);
    e.scheduledTime = time + rand.nextInt(20);
    e.priority = rand.nextInt(3) - 1;
    const dup = model.some((o) => o.sameAs(e));
    if (s.contains(e) !== dup) mismatches++;
    if (s.add(e) === dup) mismatches++;
    if (!dup) model.push(e);
  } else if (op < 85) {
    if (rand.nextInt(4) === 0) time++;
    model.sort((a, b) => a.compare(b));
    const want = model[0];
    if (s.peek() !== want) mismatches++;
    const got = s.poll();
    if (got !== want) mismatches++;
    if (want) {
      model.shift();
      polled++;
    }
  } else if (op < 88) {
    const cx = (far(rand.nextInt(96) - 48)) >> 4;
    const cz = (far(rand.nextInt(96) - 48)) >> 4;
    const want = model.filter((e) => e.xCoord >> 4 === cx && e.zCoord >> 4 === cz).sort((a, b) => a.compare(b));
    model = model.filter((e) => !want.includes(e));
    const got = s.removeInChunk(cx, cz);
    removed += got.length;
    if (got.length !== want.length || got.some((e, i) => e !== want[i])) mismatches++;
  }
  if (s.size !== model.length) mismatches++;
}
// A big queue mostly unloaded at once (the heap is rebuilt), then drained.
for (let i = 0; i < 6000; i++) {
  const e = new NextTickListEntry(rand.nextInt(160) - 80, 64, rand.nextInt(160) - 80, 13);
  e.scheduledTime = time + 2;
  if (s.add(e)) model.push(e);
}
for (let cx = -5; cx <= 3; cx++) {
  for (let cz = -5; cz <= 3; cz++) {
    const want = model.filter((e) => e.xCoord >> 4 === cx && e.zCoord >> 4 === cz).sort((a, b) => a.compare(b));
    model = model.filter((e) => !want.includes(e));
    const got = s.removeInChunk(cx, cz);
    if (got.length !== want.length || got.some((e, i) => e !== want[i])) mismatches++;
  }
}
model.sort((a, b) => a.compare(b));
for (const want of model) if (s.poll() !== want) mismatches++;
if (s.size !== 0 || s.poll() !== undefined) mismatches++;
check('scheduler matches the sorted model', mismatches === 0, `${mismatches} mismatches`);
check('the run exercised polls and chunk removals', polled > 10000 && removed > 100, `${polled} polled, ${removed} removed`);
report();
