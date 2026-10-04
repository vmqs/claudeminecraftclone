#!/usr/bin/env node
// Player models between two players in one headless Chromium (two browser contexts, so nothing
// is shared but the network): the host wears John Marston (a built-in model, sent by id), the
// guest imports a test model in its Account Manager (an OBJ with its MTL and PNG; the file is
// sent through the host by hash), each sees the other's model, then the guest switches to the
// Roblox Noob. Also the host's first-person hand and inventory preview in its model.
//
//   node scripts/mp-models.mjs [--out shots/mp-models] [--port 4242] [--relay-port 5242]
//
// Signalling goes through a local trystero WebSocket relay (started here); the game data uses
// real WebRTC data channels between the two contexts. Needs a build (npx vite build) first.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createWsRelayServer } from '@trystero-p2p/ws-relay/server';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const outDir = path.resolve(opt('out', path.join(root, 'shots/mp-models')));
const port = Number(opt('port', '4242'));
const relayPort = Number(opt('relay-port', '5242'));
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
      if ((await fetch(url)).ok) return true;
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` -> ${detail}` : ''}`);
};

const base = `http://localhost:${port}/`;
if (!existsSync(path.join(root, 'dist/index.html'))) {
  console.error('dist/ is missing: run `npx vite build` first');
  process.exit(1);
}
const preview = spawn(path.join(root, 'node_modules/.bin/vite'), ['preview', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
let relay = null;
let browser = null;
const cleanup = async () => {
  try {
    await browser?.close();
  } catch {
    /* gone */
  }
  try {
    await relay?.close();
  } catch {
    /* gone */
  }
  preview.kill();
};
process.on('SIGINT', () => void cleanup().then(() => process.exit(130)));

try {
  if (!(await waitForServer(base, 20000))) throw new Error('vite preview did not start');
  relay = createWsRelayServer({ port: relayPort });
  await relay.ready;
  const net = `&relay=ws://localhost:${relayPort}`;
  browser = await chromium.launch({
    executablePath: findChromium(),
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns'],
  });
  const open = async (label, query) => {
    const ctx = await browser.newContext({ viewport: { width: 854, height: 480 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('console', (m) => {
      const t = m.text();
      if (m.type() === 'error' || m.type() === 'warning' || t.includes('[lan]') || t.includes('[models]')) console.log(`[${label}:${m.type()}] ${t}`);
    });
    page.on('pageerror', (e) => console.log(`[${label}:pageerror] ${e.message}`));
    await page.goto(new URL(query, base).toString());
    await page.waitForFunction(() => document.getElementById('game')?.dataset.ready === '1', null, { timeout: 90000 });
    return page;
  };
  const shot = async (page, name) => {
    const file = path.join(outDir, name);
    await page.screenshot({ path: file });
    console.log(`  wrote ${path.relative(root, file)}`);
  };

  // ---------------------------------------------------------------- host: John Marston
  const host = await open('host', `?dev=1&autostart=1&seed=lan&type=flat&mode=creative&mobs=0&time=6000&pos=8.5,4,8.5,0,30&hotbar=1${net}`);
  await host.evaluate(() => {
    window.mc.gameSettings.renderDistance = 3;
  });
  await host.waitForFunction(() => window.mc.dev.isInGame() && window.mc.dev.pendingSections(1) === 0, null, { timeout: 300000, polling: 500 });
  const hostReady = await host.evaluate(() => window.mc.dev.models.select('john_marston').then(() => window.mc.dev.models.whenReady()));
  check('host wears John Marston', hostReady);
  // The empty hand in first person is John's arm; the inventory shows John.
  await host.evaluate(() => {
    const mc = window.mc;
    mc.thePlayer.inventory.mainInventory[0] = null;
    mc.dev.select(0);
    mc.dev.look(0, 10);
    mc.dev.ticks(10);
  });
  await host.waitForTimeout(1500);
  await shot(host, 'mpm_01_host_john_hand.png');
  await host.evaluate(() => window.mc.dev.press(18, 1));
  await host.waitForTimeout(2500);
  check('inventory open', await host.evaluate(() => window.mc.currentScreen !== null));
  await shot(host, 'mpm_02_host_inventory.png');
  await host.evaluate(() => window.mc.displayGuiScreen(null));
  const code = await host.evaluate(() => window.mc.dev.net.host('Alice', 'creative', true));
  check('host opened the world to LAN', /^[A-Z2-9]{8}$/.test(code), code);

  // ---------------------------------------------------------------- guest: an imported model
  const guest = await open('guest', `?dev=1${net}`);
  await guest.evaluate(() => {
    window.mc.gameSettings.renderDistance = 3;
  });
  await guest.evaluate(() => window.mc.dev.screen('accountmanager'));
  await guest.waitForTimeout(500);
  await guest.keyboard.press('Control+A');
  await guest.keyboard.type('Bob', { delay: 40 });
  const imported = await guest.evaluate(() => window.mc.dev.models.testModelFiles('#20a040').then((f) => window.mc.dev.models.importFiles(f)));
  check('guest imported a model', imported.ok === true && String(imported.key).startsWith('data:'), JSON.stringify(imported));
  await guest.evaluate(() => window.mc.dev.models.whenReady());
  await guest.waitForTimeout(1200);
  await shot(guest, 'mpm_03_guest_account_imported.png');
  await guest.keyboard.press('Enter');
  await guest.waitForTimeout(300);
  await guest.evaluate((c) => window.mc.dev.net.join(c), code);
  await guest.waitForFunction(() => window.mc.netHandler?.state === 'play' || window.mc.dev.net.state().screen === 'disconnected', null, { timeout: 90000, polling: 250 });
  const joined = await guest.evaluate(() => window.mc.dev.net.state());
  check('guest logged in', joined.guestState === 'play', JSON.stringify(joined));
  if (joined.guestState !== 'play') throw new Error('the guest could not join');
  await guest.waitForFunction(() => window.mc.dev.isInGame() && window.mc.dev.pendingSections(1) === 0, null, { timeout: 300000, polling: 500 });

  // ---------------------------------------------------------------- face each other
  await host.evaluate(() => window.mc.dev.tp(8.5, 4, 8.5, 0, 10));
  await host.evaluate(() => window.mc.lanServer.handlers.find((h) => h.username === 'Bob').player.setPlayerLocation(8.5, 4, 12.5, 180, 10));
  await host.waitForFunction(() => window.mc.theWorld.playerEntities.some((p) => p.username === 'Bob' && Math.abs(p.posZ - 12.5) < 0.2), null, { timeout: 30000, polling: 250 }).catch(() => undefined);
  await guest.waitForFunction(() => window.mc.dev.net.state().otherPlayers.some((p) => p.name === 'Alice' && Math.abs(p.z - 8.5) < 0.2), null, { timeout: 30000, polling: 250 }).catch(() => undefined);
  // Models: Bob's file reaches the host (32 KiB pieces per tick); Alice's built-in by id.
  const key = imported.key;
  const hostHas = await host
    .waitForFunction((k) => window.mc.dev.models.state().remote.Bob === k, key, { timeout: 60000, polling: 250 })
    .then(() => host.evaluate((k) => window.mc.dev.models.whenReady(k), key), () => false);
  check('the host sees Bob in his imported model', hostHas === true, JSON.stringify(await host.evaluate(() => window.mc.dev.models.state())));
  const guestHas = await guest
    .waitForFunction(() => window.mc.dev.models.state().remote.Alice === 'builtin:john_marston', null, { timeout: 60000, polling: 250 })
    .then(() => guest.evaluate(() => window.mc.dev.models.whenReady('john_marston')), () => false);
  check('the guest sees Alice as John Marston', guestHas === true, JSON.stringify(await guest.evaluate(() => window.mc.dev.models.state())));
  await host.evaluate(() => window.mc.dev.look(0, 10));
  await guest.evaluate(() => window.mc.dev.look(180, 10));
  await host.waitForTimeout(2000);
  await shot(host, 'mpm_04_host_sees_bob_imported.png');
  await shot(guest, 'mpm_05_guest_sees_alice_john.png');

  // ---------------------------------------------------------------- Bob switches to the Noob
  await guest.evaluate(() => window.mc.dev.models.select('roblox_noob'));
  const noob = await host
    .waitForFunction(() => window.mc.dev.models.state().remote.Bob === 'builtin:roblox_noob', null, { timeout: 60000, polling: 250 })
    .then(() => host.evaluate(() => window.mc.dev.models.whenReady('roblox_noob')), () => false);
  check('a model change reaches the host', noob === true, JSON.stringify(await host.evaluate(() => window.mc.dev.models.state().remote)));
  await host.waitForTimeout(2000);
  await shot(host, 'mpm_06_host_sees_bob_noob.png');
  // The guest in third person sees its own model too.
  await guest.evaluate(() => {
    window.mc.gameSettings.thirdPersonView = 2;
  });
  await guest.waitForTimeout(2000);
  await shot(guest, 'mpm_07_guest_own_noob_front.png');

  await host.evaluate(() => window.mc.dev.net.leave());
  await guest.waitForFunction(() => window.mc.dev.net.state().screen === 'disconnected', null, { timeout: 30000, polling: 250 }).catch(() => undefined);
  check('guest forgot the host model after leaving', (await guest.evaluate(() => Object.keys(window.mc.dev.models.state().remote).length)) === 0);
} catch (e) {
  console.error(e);
  check('test ran to the end', false, String(e));
} finally {
  await cleanup();
}
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length > 0 ? 1 : 0);
