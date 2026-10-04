/**
 * The account, skin and server-address logic without a browser: skin sizes and 1.5.2's skin
 * processing, the skin registry, the MC|Skin payloads and the host's skin relay, server address
 * parsing (1.5.2's ServerAddress), the ServerConnector registry, the saved server list's
 * migration and the boot splash pick.
 * Run: node scripts/run-node-test.mjs tests/account.test.ts
 */
import { pickSplash } from '../src/client/BootSplash';
import { PlayerSkinRegistry } from '../src/client/skin/PlayerSkins';
import { processSkin, SKIN_BYTES, skinFromPixels } from '../src/client/skin/SkinImage';
import { DEFAULT_PORT, javaSplitColon, parseServerAddress, savedServerKind } from '../src/net/connect/ServerAddress';
import { connectToServerAddress, NO_DIRECT_CONNECTIONS, pingServerAddress, registerServerConnector } from '../src/net/connect/ServerConnector';
import type { Packet } from '../src/net/protocol/Packets';
import { SkinRelay, SKIN_CHANGE_TICKS, type SkinGuest } from '../src/net/server/SkinRelay';
import { decodeOwnSkin, decodePlayerSkin, encodeOwnSkin, encodePlayerSkin, SKIN_CHANNEL } from '../src/net/SkinSync';
import { ConnectError, type NetConnection } from '../src/net/transport/Transport';
import { filterUsername, isValidUsername } from '../src/net/Username';
import { check, report } from './harness';

const alphaAt = (rgba: Uint8Array, x: number, y: number) => rgba[(y * 64 + x) * 4 + 3];

/** A 64 x h image filled with one RGBA colour. */
function image(h: number, rgba: [number, number, number, number]): Uint8Array {
  const out = new Uint8Array(64 * h * 4);
  for (let i = 0; i < out.length; i += 4) out.set(rgba, i);
  return out;
}

// ---------------------------------------------------------------------- skin sizes

{
  const r = skinFromPixels(image(32, [10, 20, 30, 255]), 64, 32);
  check('64x32 is a skin', r.ok && r.rgba.length === SKIN_BYTES);
  const tall = image(64, [1, 2, 3, 255]);
  tall.fill(200, SKIN_BYTES); // the lower half differs
  const r2 = skinFromPixels(tall, 64, 64);
  check('64x64 gives its top half', r2.ok && r2.rgba.length === SKIN_BYTES && r2.rgba[SKIN_BYTES - 4] === 1 && r2.rgba[0] === 1);
  const r3 = skinFromPixels(new Uint8Array(128 * 64 * 4), 128, 64);
  check('128x64 is refused with its size', !r3.ok && r3.error.includes('64x32 or 64x64') && r3.error.includes('128x64'), JSON.stringify(r3));
  check('32x32 is refused', !skinFromPixels(new Uint8Array(32 * 32 * 4), 32, 32).ok);
  check('64x48 is refused', !skinFromPixels(new Uint8Array(64 * 48 * 4), 64, 48).ok);
  check('short data is refused', !skinFromPixels(new Uint8Array(10), 64, 32).ok);
}

// ---------------------------------------------------------------------- 1.5.2 skin processing

{
  // Fully transparent input: head and body become opaque, the hat stays see-through.
  const p = processSkin(image(32, [50, 60, 70, 0]));
  check('head made opaque', alphaAt(p, 0, 0) === 255 && alphaAt(p, 31, 15) === 255);
  check('body, arms and legs made opaque', alphaAt(p, 0, 16) === 255 && alphaAt(p, 63, 31) === 255);
  check('hat with transparency kept', alphaAt(p, 40, 8) === 0);
  // Fully opaque input: the hat area is cleared (no hat box around the head).
  const q = processSkin(image(32, [50, 60, 70, 255]));
  check('opaque hat area cleared', alphaAt(q, 32, 0) === 0 && alphaAt(q, 63, 15) === 0, String(alphaAt(q, 32, 0)));
  check('colour of a cleared hat kept', q[(0 * 64 + 40) * 4] === 50);
  check('body still opaque after clearing the hat', alphaAt(q, 40, 20) === 255);
  // A hat with one see-through pixel keeps its painted pixels.
  const hat = image(32, [9, 9, 9, 255]);
  hat[(3 * 64 + 50) * 4 + 3] = 0;
  const h = processSkin(hat);
  check('painted hat kept', alphaAt(h, 40, 8) === 255 && alphaAt(h, 50, 3) === 0);
  check('processing is idempotent', processSkin(q).every((v, i) => v === q[i]) && processSkin(h).every((v, i) => v === h[i]));
  const input = image(32, [1, 1, 1, 0]);
  processSkin(input);
  check('input not changed', input[3] === 0);
}

// ---------------------------------------------------------------------- registry

{
  const reg = new PlayerSkinRegistry();
  const released: Uint8Array[] = [];
  reg.releaseListeners.push((s) => released.push(s));
  let changes = 0;
  reg.localListeners.push(() => changes++);
  const me = { username: 'Alice' };
  const other = { username: 'Bob' };
  reg.localPlayer = () => me;
  check('Steve by default', reg.skinFor(me) === null && reg.skinFor(other) === null);
  reg.setLocal(image(32, [1, 2, 3, 255]));
  const first = reg.local!;
  check('local skin processed', first !== null && alphaAt(first, 40, 8) === 0 && reg.localVersion === 1 && changes === 1);
  check('local player wears it', reg.skinFor(me) === first);
  check('another player with the local name does not', reg.skinFor({ username: 'Alice' }) === null);
  reg.setLocal(image(32, [1, 2, 3, 255]));
  check('same pixels: no change', reg.local === first && reg.localVersion === 1);
  reg.setRemote('Bob', image(32, [4, 5, 6, 255]));
  check('remote skin by name', reg.skinFor(other)?.[0] === 4);
  reg.setRemote('Bob', new Uint8Array(5));
  check('invalid remote data ignored', reg.skinFor(other)?.[0] === 4);
  const bob = reg.getRemote('Bob')!;
  reg.setRemote('Bob', null);
  check('remote reset releases the texture', reg.skinFor(other) === null && released.includes(bob));
  reg.setRemote('Carl', image(32, [7, 7, 7, 255]));
  reg.clearRemote();
  check('clearRemote forgets everyone', reg.remoteNames().length === 0);
  reg.setLocal(null);
  check('reset to Steve', reg.local === null && released.includes(first) && reg.localVersion === 2);
}

// ---------------------------------------------------------------------- MC|Skin payloads

{
  const skin = processSkin(image(32, [8, 9, 10, 255]));
  check('own skin round trip', decodeOwnSkin(encodeOwnSkin(skin))?.length === SKIN_BYTES);
  check('own Steve is empty', encodeOwnSkin(null).length === 0 && decodeOwnSkin(new Uint8Array(0)) === null);
  check('own skin of a wrong size is not a skin', decodeOwnSkin(new Uint8Array(SKIN_BYTES - 1)) === undefined && decodeOwnSkin(new Uint8Array(SKIN_BYTES * 2)) === undefined);
  const named = decodePlayerSkin(encodePlayerSkin('Bob_2', skin));
  check('named skin round trip', named?.name === 'Bob_2' && named.rgba?.length === SKIN_BYTES && named.rgba[0] === 8);
  const steve = decodePlayerSkin(encodePlayerSkin('Bob', null));
  check('named Steve', steve?.name === 'Bob' && steve.rgba === null);
  const bad = encodePlayerSkin('Bob', skin);
  check('truncated named skin refused', decodePlayerSkin(bad.subarray(0, bad.length - 1)) === null);
  check('invalid name refused', decodePlayerSkin(encodePlayerSkin('a b', null)) === null && decodePlayerSkin(encodePlayerSkin('§cX', null)) === null);
  check('length past the end refused', decodePlayerSkin(new Uint8Array([20, 65, 66])) === null && decodePlayerSkin(new Uint8Array([])) === null);
}

// ---------------------------------------------------------------------- the host's relay

{
  interface FakeGuest extends SkinGuest {
    got: Packet[];
    state: 'handshake' | 'login' | 'play' | 'closed';
  }
  const guest = (username: string, state: FakeGuest['state'] = 'play'): FakeGuest => {
    const g: FakeGuest = { username, state, got: [], sendPacket: (p) => g.got.push(p) };
    return g;
  };
  const guests: FakeGuest[] = [];
  const hostRenderer = new Map<string, Uint8Array | null>();
  let hostSkin: Uint8Array | null = null;
  const relay = new SkinRelay({
    host: {
      hostName: 'Alice',
      hostSkin: () => hostSkin,
      playerSkin: (name, rgba) => hostRenderer.set(name, rgba),
    },
    broadcast: (p, except) => {
      for (const g of guests) if (g !== except && g.state === 'play') g.sendPacket(p);
    },
  });
  const skins = (g: FakeGuest) =>
    g.got.filter((p): p is Extract<Packet, { type: 'CustomPayload' }> => p.type === 'CustomPayload' && p.channel === SKIN_CHANNEL).map((p) => decodePlayerSkin(p.data));
  const bob = guest('Bob');
  const carl = guest('Carl', 'login');
  guests.push(bob, carl);
  let tick = 100;
  relay.tick(tick);
  check('a Steve host sends nothing', bob.got.length === 0);
  hostSkin = processSkin(image(32, [100, 0, 0, 255]));
  relay.tick(++tick);
  check('the host skin goes to everyone playing', skins(bob).length === 1 && skins(bob)[0]?.name === 'Alice' && skins(bob)[0]?.rgba?.[0] === 100 && carl.got.length === 0);
  relay.received(carl, encodeOwnSkin(image(32, [0, 200, 0, 255])));
  relay.tick(++tick);
  check('a skin waits for the login', !hostRenderer.has('Carl'));
  carl.state = 'play';
  relay.joined(carl);
  check('a newcomer hears the host skin', skins(carl).some((s) => s?.name === 'Alice'));
  relay.tick(++tick);
  check('the host renders the guest skin', hostRenderer.get('Carl')?.[1] === 200);
  check('the others get the guest skin', skins(bob).some((s) => s?.name === 'Carl' && s.rgba?.[1] === 200));
  check('the guest does not get its own skin back', !skins(carl).some((s) => s?.name === 'Carl'));
  check('the relayed skin is processed', alphaAt(hostRenderer.get('Carl')!, 40, 8) === 0);
  relay.received(carl, encodeOwnSkin(image(32, [0, 0, 250, 255])));
  relay.tick(++tick);
  check('changes are rate limited', hostRenderer.get('Carl')?.[2] === 0);
  tick += SKIN_CHANGE_TICKS;
  relay.tick(tick);
  check('the waiting change applies later', hostRenderer.get('Carl')?.[2] === 250);
  relay.received(carl, new Uint8Array(100));
  check('a malformed skin is rejected', relay.rejected === 1);
  const dave = guest('Dave');
  guests.push(dave);
  relay.joined(dave);
  check('a newcomer hears every guest skin', skins(dave).some((s) => s?.name === 'Carl' && s.rgba?.[2] === 250));
  carl.state = 'closed';
  relay.left(carl);
  check('a leaving guest goes back to Steve everywhere', hostRenderer.get('Carl') === null && skins(dave).some((s) => s?.name === 'Carl' && s.rgba === null));
  check('the relay forgets it', relay.skinOf(carl) === null);
  relay.received(dave, encodeOwnSkin(null));
  relay.tick((tick += SKIN_CHANGE_TICKS));
  check('Steve from a Steve guest changes nothing', !hostRenderer.has('Dave'));
}

// ---------------------------------------------------------------------- server addresses

{
  const a = (s: string) => parseServerAddress(s);
  const eq = (s: string, host: string, port: number, scheme = 'tcp') => {
    const r = a(s);
    check(`address ${JSON.stringify(s)}`, r.host === host && r.port === port && r.scheme === scheme, JSON.stringify(r));
  };
  eq('localhost', 'localhost', DEFAULT_PORT);
  eq('mc.example.com:25566', 'mc.example.com', 25566);
  eq('  play.example.net  ', 'play.example.net', DEFAULT_PORT);
  eq('host:abc', 'host', DEFAULT_PORT);
  eq('host: 1234 ', 'host', 1234);
  eq('host:', 'host', DEFAULT_PORT);
  eq('[::1]', '::1', DEFAULT_PORT);
  eq('[2001:db8::7]:25570', '2001:db8::7', 25570);
  eq('2001:db8::7', '2001:db8::7', DEFAULT_PORT);
  eq('10.0.0.2:1', '10.0.0.2', 1);
  eq('wss://proxy.example:443/mc', 'proxy.example', 443, 'wss');
  eq('WS://proxy', 'proxy', DEFAULT_PORT, 'ws');
  check('":" splits into nothing (Join disabled)', javaSplitColon(':').length === 0 && javaSplitColon('a:b:').length === 2 && javaSplitColon('').length === 1);
}

// ---------------------------------------------------------------------- connectors

{
  const ac = new AbortController();
  const refused = await connectToServerAddress('mc.example.com', ac.signal).then(
    () => 'connected',
    (e: unknown) => (e instanceof ConnectError ? e.reason : String(e)),
  );
  check('a plain address is refused in a browser', refused === NO_DIRECT_CONNECTIONS, refused);
  check('the reason says why', NO_DIRECT_CONNECTIONS.startsWith('Connection refused'));
  const unknown = await connectToServerAddress('gopher://x', ac.signal).then(
    () => '',
    (e: unknown) => (e instanceof ConnectError ? e.reason : ''),
  );
  check('an unknown scheme is refused', unknown.includes('gopher'), unknown);
  const fake: NetConnection = { peerId: 'test', isOpen: true, pendingSends: 0, send() {}, close() {}, onMessage: null, onClose: null };
  let seen = '';
  registerServerConnector('test', {
    connect: (addr) => {
      seen = `${addr.host}:${addr.port}`;
      return Promise.resolve(fake);
    },
    ping: () => Promise.resolve({ motd: 'A Minecraft Server', onlinePlayers: 1, maxPlayers: 20, protocolVersion: 61, gameVersion: '1.5.2', pingMs: 12 }),
  });
  check('a registered connector connects', (await connectToServerAddress('test://box:4000', ac.signal)) === fake && seen === 'box:4000');
  check('a registered connector pings', (await pingServerAddress('test://box', ac.signal)).maxPlayers === 20);
  const noPing = await pingServerAddress('example.com', ac.signal).then(
    () => '',
    (e: unknown) => (e instanceof ConnectError ? e.reason : ''),
  );
  check("no ping: Can't reach server", noPing === "Can't reach server");
  registerServerConnector('test', null);
}

// ---------------------------------------------------------------------- saved servers, names, splash

{
  check('old room entry stays a room', savedServerKind({ ip: 'ABCD-EFGH' }) === 'room' && savedServerKind({ ip: 'abcd efgh' }) === 'room');
  check('old address entry becomes a server', savedServerKind({ ip: 'mc.example.com' }) === 'server' && savedServerKind({ ip: 'localhost:25565' }) === 'server');
  check('a saved kind wins', savedServerKind({ ip: 'ABCDEFGH', kind: 'server' }) === 'server' && savedServerKind({ ip: 'x', kind: 'room' }) === 'room');
  check('names filtered', filterUsername('a b-c_d!éé0123456789xyz') === 'abc_d0123456789x' && isValidUsername('Bob') && !isValidUsername('Bo'));
  check('splash coin flip', pickSplash(() => 0.49, '') === 0 && pickSplash(() => 0.5, '') === 1);
  check('splash forced', pickSplash(() => 0, '?splash=2') === 1 && pickSplash(() => 0.9, '?dev=1&splash=1') === 0 && pickSplash(() => 0.9, '?splash=3') === 1);
  let heads = 0;
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
  for (let i = 0; i < 10000; i++) if (pickSplash(rand, '') === 0) heads++;
  check('splash about 50/50', heads > 4800 && heads < 5200, String(heads));
}

report();
