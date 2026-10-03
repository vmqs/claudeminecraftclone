#!/usr/bin/env node
// Two players in one headless Chromium (two browser contexts, so nothing is shared but the
// network): the host opens a world to LAN, the guest joins with the room code through the
// multiplayer screens, both place blocks, chat and look at each other; screenshots of each step.
//
//   node scripts/mp-test.mjs [--out shots/mp] [--port 4400] [--relay-port 4401] [--public]
//
// Signalling: by default a local trystero WebSocket relay (started here on --relay-port), so the
// test needs no internet; the game data still goes over real WebRTC data channels between the
// two contexts. --public uses the public Nostr/BitTorrent relays instead (needs internet access
// from the browser). Needs `npm run build` first; starts `vite preview` on --port.
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
const usePublic = args.includes('--public');
const outDir = path.resolve(opt('out', path.join(root, 'shots/mp')));
const port = Number(opt('port', '4400'));
const relayPort = Number(opt('relay-port', '4401'));
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
  console.error('dist/ is missing: run `npm run build` first');
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
let host = null;
let guest = null;
let diag = async () => undefined;

try {
  if (!(await waitForServer(base, 20000))) throw new Error('vite preview did not start');
  if (!usePublic) {
    relay = createWsRelayServer({ port: relayPort });
    await relay.ready;
  }
  const net = usePublic ? '' : `&relay=ws://localhost:${relayPort}`;
  browser = await chromium.launch({
    executablePath: findChromium(),
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
      // Plain host candidates instead of mDNS names, which a sandbox cannot resolve.
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  });
  const open = async (label, query) => {
    const ctx = await browser.newContext({ viewport: { width: 854, height: 480 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('console', (m) => {
      const t = m.text();
      if (m.type() === 'error' || m.type() === 'warning' || t.includes('[lan]')) console.log(`[${label}:${m.type()}] ${t}`);
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
  const t0 = Date.now();
  const log = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);
  // Both sides' view of the session, printed when a step does not go as expected.
  diag = async () => {
    for (const [label, page] of [['host', host], ['guest', guest]]) {
      if (!page) continue;
      const d = await page
        .evaluate(() => {
          const mc = window.mc;
          const st = mc.dev.net.state();
          const players = mc.theWorld ? mc.theWorld.playerEntities.map((p) => ({ name: p.username, x: +p.posX.toFixed(2), y: +p.posY.toFixed(2), z: +p.posZ.toFixed(2) })) : [];
          return { ...st, players: st.players, worldPlayers: players, chat: mc.dev.net.chat(8) };
        })
        .catch((e) => String(e));
      console.log(`  [diag ${label}] ${JSON.stringify(d)}`);
    }
  };

  // ---------------------------------------------------------------- host
  host = await open('host', `?dev=1&autostart=1&seed=lan&type=flat&mode=creative&mobs=0&time=6000&pos=8.5,4,8.5,0,30${net}`);
  await host.evaluate(() => {
    window.mc.gameSettings.renderDistance = 3;
  });
  await host.waitForFunction(() => window.mc.dev.isInGame() && window.mc.dev.pendingSections(1) === 0, null, { timeout: 240000, polling: 500 });
  log('host in game');
  // The pause menu's Open to LAN screen, with the name field.
  await host.evaluate(() => window.mc.dev.screen('sharetolan'));
  await host.waitForTimeout(800);
  await shot(host, '01_host_open_to_lan.png');
  await host.evaluate(() => window.mc.displayGuiScreen(null));
  const code = await host.evaluate(() => window.mc.dev.net.host('Alice', 'creative', true));
  check('host opened the world to LAN', /^[A-Z2-9]{8}$/.test(code), code);
  await host.waitForTimeout(800);
  await host.evaluate(() => window.mc.dev.screen('pause'));
  await host.waitForTimeout(800);
  await shot(host, '02_host_pause_room_code.png');
  await host.evaluate(() => window.mc.displayGuiScreen(null));

  // ---------------------------------------------------------------- guest: the multiplayer screens
  guest = await open('guest', `?dev=1${net}`);
  await guest.evaluate(() => {
    window.mc.gameSettings.renderDistance = 3;
    window.mc.username = 'Bob';
  });
  await guest.evaluate(() => window.mc.dev.screen('multiplayer'));
  await guest.waitForTimeout(1000);
  await shot(guest, '03_guest_multiplayer.png');
  // Direct Connect with the room code typed like a player would.
  await guest.evaluate(() => window.mc.dev.screen('directconnect'));
  await guest.waitForTimeout(500);
  await guest.keyboard.type(`${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase(), { delay: 40 });
  await guest.waitForTimeout(500);
  await shot(guest, '04_guest_direct_connect.png');
  await guest.evaluate((c) => window.mc.dev.net.join(c, 'Bob'), code);
  await guest.waitForTimeout(200);
  await shot(guest, '05_guest_connecting.png');
  await guest.waitForFunction(() => window.mc.netHandler?.state === 'play' || window.mc.dev.net.state().screen === 'disconnected', null, { timeout: 90000, polling: 250 });
  const joined = await guest.evaluate(() => window.mc.dev.net.state());
  check('guest connected and logged in', joined.role === 'guest' && joined.guestState === 'play', JSON.stringify(joined));
  if (joined.guestState !== 'play') {
    // No link (e.g. --public without internet access): the guest is back on the menus with the reason.
    await shot(guest, '06_guest_could_not_connect.png');
    throw new Error(`the guest could not join: ${joined.screen}`);
  }
  log('guest logged in');
  await guest.waitForTimeout(300);
  await shot(guest, '06_guest_downloading_terrain.png');
  await guest.waitForFunction(() => window.mc.dev.isInGame() && window.mc.dev.pendingSections(1) === 0, null, { timeout: 240000, polling: 500 });
  log('guest in game');

  // ---------------------------------------------------------------- face each other
  // Positions are the host's call: the host moves itself and teleports the guest (like /tp Bob).
  await host.evaluate(() => window.mc.dev.tp(8.5, 4, 8.5, 0, 10));
  await host.evaluate(() => window.mc.lanServer.handlers.find((h) => h.username === 'Bob').player.setPlayerLocation(8.5, 4, 14.5, 180, 10));
  const placedOk = await host
    .waitForFunction(() => window.mc.theWorld.playerEntities.some((p) => p.username === 'Bob' && Math.abs(p.posZ - 14.5) < 0.2), null, { timeout: 30000, polling: 250 })
    .then(() => true, () => false);
  const seen = await guest
    .waitForFunction(() => window.mc.dev.net.state().otherPlayers.some((p) => p.name === 'Alice' && Math.abs(p.z - 8.5) < 0.2), null, { timeout: 30000, polling: 250 })
    .then(() => true, () => false);
  if (!placedOk || !seen) await diag();
  const gs = await guest.evaluate(() => window.mc.dev.net.state());
  check('guest sees the host player', gs.otherPlayers.some((p) => p.name === 'Alice'), JSON.stringify(gs.otherPlayers));
  const hs = await host.evaluate(() => window.mc.theWorld.playerEntities.map((p) => p.username));
  check('host sees the guest player', hs.includes('Bob'), hs.join(','));
  check('TAB list on both', gs.players.map((p) => p.name).sort().join(',') === 'Alice,Bob', JSON.stringify(gs.players));

  // ---------------------------------------------------------------- blocks
  // The guest takes glass into its hotbar through the creative inventory packet and places it
  // on the ground between the players; the host places a stone pillar.
  await guest.evaluate(() => {
    const mc = window.mc;
    const { ItemStack } = mc.dev.lib;
    mc.thePlayer.inventory.mainInventory[0] = new ItemStack(20, 64, 0);
    mc.playerController.sendSlotPacket(new ItemStack(20, 64, 0), 36);
    mc.dev.select(0);
  });
  await guest.waitForTimeout(500);
  await guest.evaluate(() => window.mc.dev.look(180, 60));
  await guest.waitForTimeout(300);
  const target = await guest.evaluate(() => {
    const m = window.mc.objectMouseOver;
    return m ? { x: m.blockX, y: m.blockY, z: m.blockZ, side: m.sideHit, entity: !!m.entityHit } : null;
  });
  await guest.evaluate(() => window.mc.dev.click(1, 2));
  const placed = target && !target.entity && target.side === 1 ? { x: target.x, y: target.y + 1, z: target.z } : null;
  check('guest aimed at the ground', !!placed, JSON.stringify(target));
  if (placed) {
    await host.waitForFunction((p) => window.mc.theWorld.getBlockId(p.x, p.y, p.z) === 20, placed, { timeout: 20000, polling: 250 }).catch(() => undefined);
    const hid = await host.evaluate((p) => window.mc.theWorld.getBlockId(p.x, p.y, p.z), placed);
    check('guest block appears on the host', hid === 20, `id ${hid} at ${JSON.stringify(placed)}`);
  }
  await host.evaluate(() => {
    const w = window.mc.theWorld;
    for (let y = 4; y < 7; y++) w.setBlock(11, y, 11, 1, 0, 3);
  });
  await guest.waitForFunction(() => window.mc.theWorld.getBlockId(11, 6, 11) === 1, null, { timeout: 20000, polling: 250 }).catch(() => undefined);
  check('host blocks appear on the guest', (await guest.evaluate(() => window.mc.theWorld.getBlockId(11, 6, 11))) === 1);

  // ---------------------------------------------------------------- chat (typed like a player)
  await guest.evaluate(() => window.mc.dev.look(180, 10));
  await guest.keyboard.press('t');
  await guest.waitForFunction(() => window.mc.currentScreen !== null, null, { timeout: 10000 });
  await guest.keyboard.type('hello from Bob', { delay: 20 });
  await guest.keyboard.press('Enter');
  await host.waitForFunction(() => window.mc.dev.net.chat(20).some((l) => l.includes('<Bob> hello from Bob')), null, { timeout: 20000, polling: 250 }).catch(() => undefined);
  const hostChat = await host.evaluate(() => window.mc.dev.net.chat(20));
  check('guest chat on the host', hostChat.some((l) => l.includes('<Bob> hello from Bob')), hostChat.join(' | '));
  await host.keyboard.press('t');
  await host.waitForFunction(() => window.mc.currentScreen !== null, null, { timeout: 10000 });
  await host.keyboard.type('hi Bob, welcome', { delay: 20 });
  await host.keyboard.press('Enter');
  await guest.waitForFunction(() => window.mc.dev.net.chat(20).some((l) => l.includes('<Alice> hi Bob, welcome')), null, { timeout: 20000, polling: 250 }).catch(() => undefined);
  const guestChat = await guest.evaluate(() => window.mc.dev.net.chat(20));
  check('host chat on the guest', guestChat.some((l) => l.includes('<Alice> hi Bob, welcome')), guestChat.join(' | '));
  check('join message on the guest', guestChat.some((l) => l.includes('Bob joined the game')), guestChat.join(' | '));

  // ---------------------------------------------------------------- nameplates
  await host.evaluate(() => window.mc.dev.look(0, 10));
  await guest.evaluate(() => window.mc.dev.look(180, 10));
  await host.waitForFunction(() => window.mc.dev.pendingSections(2) === 0, null, { timeout: 60000, polling: 500 }).catch(() => undefined);
  await guest.waitForFunction(() => window.mc.dev.pendingSections(2) === 0, null, { timeout: 60000, polling: 500 }).catch(() => undefined);
  await host.waitForTimeout(1500);
  await shot(host, '07_host_sees_bob.png');
  await shot(guest, '08_guest_sees_alice.png');
  const tags = await guest.evaluate(() => {
    const mc = window.mc;
    const alice = mc.theWorld.loadedEntityList.find((e) => e.username === 'Alice');
    return alice ? { always: alice.getAlwaysRenderNameTag(), name: alice.getEntityName(), dist: Math.sqrt(alice.getDistanceSqToEntity(mc.thePlayer)) } : null;
  });
  check('host nameplate shown to the guest', !!tags && tags.always && tags.name === 'Alice' && tags.dist < 64, JSON.stringify(tags));
  // TAB list overlay on the guest.
  await guest.keyboard.down('Tab');
  await guest.waitForTimeout(1500);
  await shot(guest, '09_guest_tab_list.png');
  await guest.keyboard.up('Tab');
  // Sneaking hides the nameplate behind walls and dims it (RenderLiving's sneak rule).
  await guest.evaluate(() => window.mc.dev.key(42, true));
  await host.waitForFunction(() => window.mc.theWorld.playerEntities.some((p) => p.username === 'Bob' && p.isSneaking()), null, { timeout: 15000, polling: 250 }).catch(() => undefined);
  check('guest sneaking seen by the host', await host.evaluate(() => window.mc.theWorld.playerEntities.some((p) => p.username === 'Bob' && p.isSneaking())));
  await host.waitForTimeout(1200);
  await shot(host, '10_host_sees_bob_sneaking.png');
  await guest.evaluate(() => window.mc.dev.key(42, false));

  // ---------------------------------------------------------------- the host leaves
  await host.evaluate(() => window.mc.dev.net.leave());
  await guest.waitForFunction(() => window.mc.dev.net.state().screen === 'disconnected', null, { timeout: 30000, polling: 250 }).catch(() => undefined);
  const after = await guest.evaluate(() => ({ role: window.mc.dev.net.state().role, screen: window.mc.dev.net.state().screen }));
  check('guest sees the disconnect screen when the host leaves', after.role === 'none' && after.screen === 'disconnected', JSON.stringify(after));
  await guest.waitForTimeout(800);
  await shot(guest, '11_guest_disconnected.png');
  log('done');
} catch (e) {
  console.error(e);
  await diag().catch(() => undefined);
  check('test ran to the end', false, String(e));
} finally {
  await cleanup();
}
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length > 0 ? 1 : 0);
