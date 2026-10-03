/**
 * FrameBudget (budgets that follow the frame interval) and IdleTasks (background work spread
 * over frames, round robin, flush on demand).
 *
 *   node scripts/run-node-test.mjs tests/frame-budget.test.ts
 */
import { FrameBudget } from '../src/client/FrameBudget';
import { IdleTasks } from '../src/client/IdleTasks';
import { check, report } from './harness';

// 60 fps: the base budget applies; 2 fps: a quarter of the frame, capped; covered world: half.
let t = 0;
for (let i = 0; i < 30; i++) FrameBudget.beginFrame((t += 1000 / 60), false);
check('60 fps stays near the base budget', Math.abs(FrameBudget.ms(4) - 4.17) < 0.05 && FrameBudget.ms(8) === 8, String(FrameBudget.ms(4)));
for (let i = 0; i < 30; i++) FrameBudget.beginFrame((t += 120), false);
check('slow frames get a share of the interval', Math.abs(FrameBudget.ms(4) - 30) < 1, String(FrameBudget.ms(4)));
for (let i = 0; i < 30; i++) FrameBudget.beginFrame((t += 2000), false);
check('the share is capped', FrameBudget.ms(4) === 40, String(FrameBudget.ms(4)));
FrameBudget.beginFrame((t += 1000 / 60), true);
check('a covered world allows more', FrameBudget.ms(4) > 40, String(FrameBudget.ms(4)));

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
