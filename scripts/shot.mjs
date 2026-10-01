#!/usr/bin/env node
// Headless-Chromium screenshot harness. Runs scenario steps against `vite preview` (or a
// running dev server) and writes PNGs. See docs/TESTING.md.
//
//   node scripts/shot.mjs scripts/scenarios/spawn.json [--out shots] [--url http://localhost:4173/]
//        [--server preview|none] [--size 854x480] [--keep]
//
// A scenario is a JSON array of steps:
//   {"goto": "?dev=1&autostart=1&seed=1"}       load the page (query appended to the base URL)
//   {"waitFor": "mc.dev.isInGame()", "timeout": 120000}   poll a JS expression in the page
//   {"eval": "mc.dev.setTime(6000)"}            run JS in the page (`mc` is window.mc)
//   {"ticks": 20}                               run game ticks immediately
//   {"wait": 500}                               wait milliseconds (real time)
//   {"key": "F3"}                               press a key (Playwright key name)
//   {"type": "text"}                            type text
//   {"click": [x, y]} / {"move": [x, y]}        mouse click / move in page pixels
//   {"shot": "spawn_noon.png"}                  screenshot the page
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const valued = new Set(['--out', '--url', '--server', '--size']);
const scenarioArg = args.find((a, i) => !a.startsWith('--') && !(i > 0 && valued.has(args[i - 1])));
if (!scenarioArg) {
  console.error('usage: node scripts/shot.mjs <scenario.json> [--out dir] [--url base] [--server preview|none] [--size WxH]');
  process.exit(2);
}
const scenarioPath = existsSync(scenarioArg) ? scenarioArg : path.join(root, 'scripts/scenarios', `${scenarioArg}.json`);
const steps = JSON.parse(readFileSync(scenarioPath, 'utf8'));
const outDir = path.resolve(opt('out', path.join(root, 'shots')));
const serverMode = opt('server', 'preview');
const baseUrl = opt('url', 'http://localhost:4173/');
const [vw, vh] = opt('size', '854x480').split('x').map(Number);
mkdirSync(outDir, { recursive: true });

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  for (const d of readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
    const p = path.join(base, d, 'chrome-linux', 'chrome');
    if (existsSync(p)) return p;
  }
  return undefined;
}

async function waitForServer(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

let server = null;
if (serverMode === 'preview' && !(await waitForServer(baseUrl, 300))) {
  if (!existsSync(path.join(root, 'dist/index.html'))) {
    console.error('dist/ is missing: run `npm run build` first');
    process.exit(1);
  }
  server = spawn(path.join(root, 'node_modules/.bin/vite'), ['preview', '--port', '4173', '--strictPort'], { cwd: root, stdio: 'ignore' });
  if (!(await waitForServer(baseUrl, 20000))) {
    console.error('vite preview did not start');
    server.kill();
    process.exit(1);
  }
}

const browser = await chromium.launch({
  executablePath: findChromium(),
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning' || flag('verbose')) console.log(`[page:${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400) console.log(`[http ${r.status()}] ${r.url()}`);
  });
  for (const step of steps) {
    const t0 = Date.now();
    if (step.goto !== undefined) {
      await page.goto(new URL(step.goto, baseUrl).toString());
      await page.waitForFunction(() => document.getElementById('game')?.dataset.ready === '1', null, { timeout: 60000 });
    } else if (step.waitFor) {
      await page.waitForFunction(step.waitFor, null, { timeout: step.timeout ?? 120000, polling: 250 });
    } else if (step.eval) {
      const r = await page.evaluate(step.eval);
      if (r !== undefined) console.log(`  eval -> ${JSON.stringify(r)}`);
    } else if (step.ticks) {
      await page.evaluate((n) => window.mc.dev.ticks(n), step.ticks);
    } else if (step.wait) {
      await page.waitForTimeout(step.wait);
    } else if (step.key) {
      await page.keyboard.press(step.key);
    } else if (step.type) {
      await page.keyboard.type(step.type, { delay: 30 });
    } else if (step.click) {
      await page.mouse.click(step.click[0], step.click[1]);
    } else if (step.move) {
      await page.mouse.move(step.move[0], step.move[1]);
    } else if (step.shot) {
      const file = path.join(outDir, step.shot);
      await page.screenshot({ path: file });
      console.log(`  wrote ${path.relative(root, file)}`);
    }
    console.log(`${JSON.stringify(step)} (${Date.now() - t0} ms)`);
  }
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await browser.close();
  if (server && !flag('keep')) server.kill();
}
process.exit(failed ? 1 : 0);
