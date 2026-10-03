/**
 * FrameBudget (budgets that follow the frame interval) and IdleTasks (background work spread
 * over frames, round robin, flush on demand).
 *
 *   node scripts/run-node-test.mjs tests/frame-budget.test.ts
 */
import { FrameBudget } from '../src/client/FrameBudget';
import { IdleTasks } from '../src/client/IdleTasks';
import { check, report } from './harness';

// The budget grows with the time between frames the game loop does not use (a slow GPU), not
// with a slow game loop; a covered world gets a share of the whole frame.
let t = 0;
const frames = (n: number, interval: number, loop: number, hidden = false) => {
  for (let i = 0; i < n; i++) {
    FrameBudget.beginFrame((t += interval), hidden);
    FrameBudget.endFrame(t + loop);
  }
};
frames(40, 1000 / 60, 5);
check('60 fps stays near the base budget', FrameBudget.ms(4) < 5 && FrameBudget.ms(8) === 8, String(FrameBudget.ms(4)));
frames(40, 120, 10);
check('a GPU-bound frame lends its idle time', Math.abs(FrameBudget.ms(4) - 40) < 1, String(FrameBudget.ms(4)));
frames(40, 120, 118);
check('a CPU-bound frame gets the base only', FrameBudget.ms(4) === 4, String(FrameBudget.ms(4)));
frames(40, 2000, 10);
check('the share is capped', FrameBudget.ms(4) === 40, String(FrameBudget.ms(4)));
frames(40, 1000 / 60, 3, true);
check('a covered world gets a share of the frame', Math.abs(FrameBudget.ms(4) - 5.83) < 0.1 && FrameBudget.ms(12) === 12, String(FrameBudget.ms(4)));
frames(40, 400, 3, true);
check('... capped too', FrameBudget.ms(4) === 50, String(FrameBudget.ms(4)));

// IdleTasks: a long task is sliced, others still get turns, finished tasks drop out.
let a = 0;
let b = 0;
IdleTasks.add('a', (deadline) => {
  do a++;
  while (performance.now() < deadline && a < 50);
  return a < 50;
});
IdleTasks.add('b', () => {
  b++;
  return b < 3;
});
for (let i = 0; i < 10; i++) IdleTasks.run(0);
check('every task gets turns with no time left', a > 0 && b === 3, `a=${a} b=${b}`);
check('finished tasks are removed', !IdleTasks.has('b'));
IdleTasks.add('c', () => {
  throw new Error('boom');
});
const quiet = console.error;
let logged = 0;
console.error = () => void logged++;
IdleTasks.flush();
console.error = quiet;
check('a throwing task is logged and dropped', logged === 1, String(logged));
check('flush runs everything to the end', a === 50 && !IdleTasks.has('a') && !IdleTasks.has('c'), `a=${a}`);
report();
