#!/usr/bin/env node
// Browser benchmark: world load time, streaming and frame times in headless Chromium.
//
//   node scripts/perf/load-bench.mjs [--url http://localhost:4222/] [--seed claude] [--type default]
//        [--out dir] [--shots] [--steady 8000] [--fly 8000] [--json file]
//
// Starts `vite preview` on the --url port when nothing answers there (needs a built dist/).
// From the title screen it calls Minecraft.launchIntegratedServer like Create New World does,
// then records, in page time (performance.now):
//   world   - the player exists (Building terrain done)
//   playable - Downloading terrain closed (mc.dev.isInGame())
//   meshedN - every chunk within N of the player loaded and no section within N waiting for a mesh
// plus chunks and meshes over time, main-thread long tasks, then the frame-time breakdown
// (JS time of the loop, tick, render) standing still and flying through new terrain, and the
// JS heap. The instrumentation wraps methods from outside, so it measures any build the same way.
// With --shots it also writes fixed, frozen-clock views for before/after pixel comparisons.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const baseUrl = opt('url', 'http://localhost:4222/');
const seed = opt('seed', 'claude');
const type = opt('type', 'default');
const outDir = path.resolve(opt('out', path.join(root, 'shots/perf')));
const steadyMs = Number(opt('steady', 8000));
const flyMs = Number(opt('fly', 8000));
const jsonOut = opt('json', null);
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

async function up(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

let server = null;
if (!(await up(baseUrl, 300))) {
  const port = new URL(baseUrl).port || '4222';
  server = spawn(path.join(root, 'node_modules/.bin/vite'), ['preview', '--port', port, '--strictPort'], { cwd: root, stdio: 'ignore' });
  if (!(await up(baseUrl, 20000))) {
    console.error('vite preview did not start');
    server.kill();
    process.exit(1);
  }
}

const browser = await chromium.launch({
  executablePath: findChromium(),
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'],
});
const result = { url: baseUrl, seed, type, hardwareConcurrency: 0 };
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 854, height: 480 }, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    if (m.type() === 'error' || flag('verbose')) console.log(`[page:${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
  const tNav = Date.now();
  await page.goto(new URL('?dev=1', baseUrl).toString());
  await page.waitForFunction(() => document.getElementById('game')?.dataset.ready === '1', null, { timeout: 120000 });
  result.bootMs = Date.now() - tNav;
  result.hardwareConcurrency = await page.evaluate(() => navigator.hardwareConcurrency);

  // ---------------------------------------------------------------- instrumentation
  await page.evaluate(() => {
    const mc = window.mc;
    const B = (window.__bench = { t0: 0, marks: {}, timeline: [], longTasks: [], frames: [], recording: false });
    const now = () => performance.now();
    const wrap = (obj, name, key) => {
      const orig = obj[name];
      obj[name] = function (...a) {
        if (!B.recording) return orig.apply(this, a);
        const t = now();
        try {
          return orig.apply(this, a);
        } finally {
          B.cur[key] += now() - t;
        }
      };
    };
    B.cur = { loop: 0, tick: 0, render: 0, ticks: 0 };
    const loop = mc.runGameLoop;
    let lastStart = 0;
    mc.runGameLoop = function () {
      const t = now();
      B.cur = { loop: 0, tick: 0, render: 0, ticks: 0, interval: lastStart ? t - lastStart : 0 };
      lastStart = t;
      try {
        return loop.call(this);
      } finally {
        B.cur.loop = now() - t;
        if (B.recording) B.frames.push(B.cur);
      }
    };
    const tick = mc.runTick;
    mc.runTick = function () {
      const t = now();
      try {
        return tick.call(this);
      } finally {
        B.cur.tick += now() - t;
        B.cur.ticks++;
      }
    };
    wrap(mc.entityRenderer, 'updateCameraAndRender', 'render');
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) B.longTasks.push([Math.round(e.startTime - B.t0), Math.round(e.duration)]);
      }).observe({ type: 'longtask', buffered: false });
    } catch {
      // no long task API
    }
    const loaded = (r) => {
      const p = mc.thePlayer;
      return !!p && !!mc.chunkProvider && mc.chunkProvider.areaLoaded(p.posX, p.posZ, r) && mc.renderGlobal.pendingNear(p, r) === 0;
    };
    const poll = () => {
      const t = now() - B.t0;
      const m = B.marks;
      if (B.t0 > 0) {
        if (m.world === undefined && mc.thePlayer) m.world = t;
        if (m.playable === undefined && mc.dev.isInGame()) m.playable = t;
        for (const r of [1, 2, 4, 6, 8]) if (m[`meshed${r}`] === undefined && m.world !== undefined && loaded(r)) m[`meshed${r}`] = t;
        const w = mc.theWorld;
        let geo = 0;
        const rg = mc.renderGlobal;
        if (rg.withGeometry) geo = rg.withGeometry.size;
        B.timeline.push([Math.round(t), w ? w.loadedChunkCount : 0, geo]);
      }
      if (m.meshed8 === undefined) setTimeout(poll, 50);
    };
    B.start = () => {
      B.t0 = now();
      B.recording = true;
      poll();
    };
  });

  // ---------------------------------------------------------------- load
  await page.evaluate(
    ([seedText, t]) => {
      const mc = window.mc;
      const B = window.__bench;
      // As GuiCreateWorld's Create New World: the screen closes, then the integrated server starts.
      const parse = (s) => {
        if (/^[+-]?\d+$/.test(s)) return BigInt(s);
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
        return BigInt(h);
      };
      B.start();
      mc.displayGuiScreen(null);
      mc.launchIntegratedServer('bench', 'Bench', { seed: parse(seedText), terrainType: t, mapFeatures: true, gameType: 1, allowCommands: true });
    },
    [seed, type],
  );
  await page.waitForFunction(() => window.__bench.marks.playable !== undefined, null, { timeout: 600000, polling: 200 });
  await page.evaluate(() => {
    const w = window.mc.theWorld;
    w.worldInfo.gameRules.doMobSpawning = false;
  });
  await page.waitForFunction(() => window.__bench.marks.meshed8 !== undefined, null, { timeout: 600000, polling: 250 });
  const load = await page.evaluate(() => {
    const B = window.__bench;
    const r = (v) => (v === undefined ? null : Math.round(v));
    const tl = B.timeline;
    const lt = B.longTasks.filter((x) => x[0] <= B.marks.meshed8);
    return {
      marks: Object.fromEntries(Object.entries(B.marks).map(([k, v]) => [k, r(v)])),
      chunksAtMeshed8: tl.length ? tl[tl.length - 1][1] : 0,
      sectionsWithGeometry: tl.length ? tl[tl.length - 1][2] : 0,
      longTasksDuringLoad: { count: lt.length, totalMs: lt.reduce((a, x) => a + x[1], 0), max: lt.reduce((a, x) => Math.max(a, x[1]), 0) },
      timeline: tl.filter((_, i) => i % 10 === 0),
    };
  });
  result.load = load;
  console.log('load', JSON.stringify(load.marks), 'chunks', load.chunksAtMeshed8, 'long tasks', JSON.stringify(load.longTasksDuringLoad));

  // ---------------------------------------------------------------- frames
  const frameStats = async (label, ms, setup) => {
    await page.evaluate(setup ?? (() => undefined));
    await page.evaluate(() => {
      const B = window.__bench;
      B.frames = [];
      B.longTasks = [];
      B.heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
      B.heapSamples = [];
      B.heapTimer = setInterval(() => performance.memory && B.heapSamples.push(performance.memory.usedJSHeapSize), 100);
      B.t0f = performance.now();
    });
    await page.waitForTimeout(ms);
    const s = await page.evaluate(() => {
      const B = window.__bench;
      clearInterval(B.heapTimer);
      const f = B.frames.slice(1);
      const pick = (k) => f.map((x) => x[k]).sort((a, b) => a - b);
      const stat = (k) => {
        const v = pick(k);
        if (v.length === 0) return null;
        const sum = v.reduce((a, b) => a + b, 0);
        const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
        return { mean: +(sum / v.length).toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), max: +v[v.length - 1].toFixed(2) };
      };
      // Heap: allocation estimated from the rises between samples (drops are collections).
      let alloc = 0;
      let gcs = 0;
      const hs = B.heapSamples;
      for (let i = 1; i < hs.length; i++) {
        const d = hs[i] - hs[i - 1];
        if (d > 0) alloc += d;
        else if (d < -262144) gcs++;
      }
      const secs = (performance.now() - B.t0f) / 1000;
      return {
        frames: f.length,
        fps: +(f.length / secs).toFixed(1),
        loopMs: stat('loop'),
        tickMs: stat('tick'),
        renderMs: stat('render'),
        intervalMs: stat('interval'),
        longTasks: { count: B.longTasks.length, totalMs: B.longTasks.reduce((a, x) => a + x[1], 0) },
        heapAllocMBps: +(alloc / 1048576 / secs).toFixed(2),
        majorHeapDrops: gcs,
        heapMB: hs.length ? +(hs[hs.length - 1] / 1048576).toFixed(1) : null,
      };
    });
    console.log(label, JSON.stringify(s));
    return s;
  };
  result.steady = await frameStats('steady', steadyMs);
  // Fly east through new terrain at 10 blocks/s (teleporting every tick keeps it deterministic).
  result.fly = await frameStats('fly', flyMs, () => {
    const mc = window.mc;
    const p = mc.thePlayer;
    mc.dev.setFlying(true);
    const y = p.posY + 20;
    let x = p.posX;
    const z = p.posZ;
    mc.__flyTimer = setInterval(() => {
      x += 0.5;
      mc.dev.tp(x, y, z, -90, 10);
    }, 50);
  });
  await page.evaluate(() => clearInterval(window.mc.__flyTimer));

  // ---------------------------------------------------------------- shots
  if (flag('shots')) {
    const views = [
      ['spawn_view', 'mc.dev.tp(mc.theWorld.worldInfo.spawnX + 0.5, 90, mc.theWorld.worldInfo.spawnZ + 0.5, 45, 30)'],
      ['spawn_down', 'mc.dev.tp(mc.theWorld.worldInfo.spawnX + 0.5, 110, mc.theWorld.worldInfo.spawnZ + 0.5, 200, 60)'],
      ['spawn_far', 'mc.dev.tp(mc.theWorld.worldInfo.spawnX + 0.5, 75, mc.theWorld.worldInfo.spawnZ + 0.5, 300, 5)'],
    ];
    await page.evaluate(() => {
      const mc = window.mc;
      for (const e of [...mc.theWorld.loadedEntityList]) if (e.isLivingEntity && !e.isPlayerEntity) e.setDead();
      mc.dev.setFlying(true);
    });
    for (const [name, tp] of views) {
      await page.evaluate(tp);
      await page.evaluate(() => window.mc.dev.sky.pin(6000));
      await page.waitForFunction(
        () => {
          const mc = window.mc;
          const p = mc.thePlayer;
          return mc.chunkProvider.areaLoaded(p.posX, p.posZ, 6) && mc.renderGlobal.pendingNear(p, 8) === 0;
        },
        null,
        { timeout: 600000, polling: 250 },
      );
      await page.evaluate(() => window.mc.dev.ticks(1));
      await page.waitForTimeout(500);
      const file = path.join(outDir, `${name}.png`);
      await page.screenshot({ path: file });
      console.log('wrote', file);
    }
    // A mob line-up with a frozen clock (entity rendering).
    await page.evaluate(() => {
      const mc = window.mc;
      const sx = mc.theWorld.worldInfo.spawnX + 0.5;
      const sz = mc.theWorld.worldInfo.spawnZ + 0.5;
      mc.dev.tp(sx, 120, sz, 0, 20);
      const names = ['Pig', 'Cow', 'Chicken', 'Zombie', 'Skeleton', 'Creeper', 'Spider', 'Wolf', 'Enderman', 'Slime'];
      names.forEach((n, i) => {
        const e = mc.dev.spawn(n);
        if (e) {
          e.setLocationAndAngles(sx - 9 + i * 2, 118, sz + 8, 180, 0);
          e.motionX = e.motionY = e.motionZ = 0;
          e.noAI = true;
        }
      });
      mc.timer.timerSpeed = 0;
    });
    await page.evaluate(() => window.mc.dev.ticks(1));
    await page.waitForTimeout(800);
    const file = path.join(outDir, 'mobs.png');
    await page.screenshot({ path: file });
    console.log('wrote', file);
  }
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await browser.close();
  if (server) server.kill();
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(result, null, 1));
console.log(JSON.stringify({ bootMs: result.bootMs, hwc: result.hardwareConcurrency, marks: result.load?.marks }, null, 0));
process.exit(failed ? 1 : 0);
