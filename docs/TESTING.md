# Testing

## Checks on every commit

```sh
npm run typecheck     # tsc --noEmit (strict)
npm run build         # fetch-assets, typecheck, vite build -> dist/
```

## Running the game

```sh
npm run dev           # http://localhost:5173/  (one dev server at a time)
npm run build && npx vite preview --port 4173
```

URL parameters (any combination):

| Parameter | Effect |
|---|---|
| `?dev=1` | exposes the `Minecraft` instance as `window.mc`, with helpers on `mc.dev` |
| `?autostart=1&seed=<s>&type=<default\|flat\|largeBiomes>` | skips the menus and creates a world (`seed` is a number or text, as in Create World); `&structures=0` turns structures off, `&bonus=1` adds the bonus chest, `&preset=<superflat string>` picks a Superflat preset |
| `?hotbar=1` | fills the hotbar like the reference captures (stone, grass, dirt, cobblestone, planks, log, glass, torch, diamond sword when it exists) |
| `?time=<ticks>` | sets the world time once the player exists (6000 = noon, 18000 = midnight) |
| `?pos=x,y,z[,yaw,pitch]` | teleports the player (feet position) once the player exists |
| `?fly=1` | starts flying |
| `?mode=survival\|hardcore\|adventure\|creative` | the autostart world's game mode (Creative when absent; Hardcore without cheats) |
| `?mobs=0` | natural mob spawning off (gamerule `doMobSpawning`) and the first ticks' mobs removed, so captures are not pushed or attacked while chunks load |
| `?preserve=1` | creates the WebGL context with `preserveDrawingBuffer` |
| `?relay=ws://host:port` | with `?dev=1` only: multiplayer signalling through a self-hosted trystero WebSocket relay instead of the public ones (repeatable or comma separated; host and guests need the same one) |
| `?signal=nostr,torrent` | which public signalling routes multiplayer uses (default both) |
| `?net=memory` | multiplayer over an in-memory transport inside one page (development only) |
| `?splash=1\|2` | which boot splash picture start-up shows (otherwise a coin flip) |

`mc.dev` helpers (see `src/client/DevTools.ts`): `isInGame()`, `pendingSections(radius)`,
`tp(x, y, z, yaw?, pitch?)`, `look(yaw, pitch)`, `setTime(t)`, `select(slot)`, `fillHotbar(ids?)`,
`setFlying(on)`, `ticks(n)` (runs game ticks synchronously), `weather(kind, ramp?)` (`'clear'`,
`'rain'` or `'thunder'`; without `ramp` the fades are skipped), `key(code, down)`,
`press(code, holdTicks)`, `mouse(button, down)`, `click(button, holdTicks)`, `target()`,
`newEntity(name, ...ctorArgs)` / `spawn(name, ...ctorArgs)` (an EntityList name, or `'Egg'` /
`'FishHook'` for the two unsaved classes; the world is passed first and `'@p'` stands for the
player, e.g. `spawn('Arrow', '@p', 2)` or `spawn('FishHook', '@p')`), `entities(name?)`,
and `lib` (`Block`, `Item`, `ItemStack`, `EntityList`, `DamageSource`, `EntityDamageSource`). Setting `mc.timer.timerSpeed = 0` freezes
game time (and partial ticks) for a capture while `mc.dev.ticks(n)` still advances it.
`mc.dev.survival` (`src/client/SurvivalDevTools.ts`): `state()` (mode, health, food, saturation,
exhaustion, air, armour, xp, mining progress, bed...), `setMode(m)`, `setHealth(h)`,
`setFood(level, saturation?)`, `exhaust(n)`, `damage(sourceName, n)`, `vulnerable()` (ends spawn
protection), `armor(slot, id)`, `xp(points, levels?)`, `inventory()`, `drops(radius?)`,
`clearDrops()`.
`mc.dev.sky` (`src/render/sky/SkyDevTools.ts`): `pin(time?)` freezes the clock like the reference
harness's `freeze` (partial tick 0, `mc.dev.ticks(n)` still steps) and pins cloud ticks, torch
flicker, fog brightness, vignette and arm sway; `unfreeze()`; `strike(x, z)` (lightning bolt);
`setBiome(id)` for every loaded column (12 Ice Plains = snow, 2 Desert = no rain);
`fill(id, y0, y1, radius?)`; `helmet(id | null)` (86 = pumpkin).
`mc.dev.player` (`src/client/PlayerDevTools.ts`): `armor(slot, id, color?)` (slot 0 boots ... 3
helmet), `use(ticksLeft)` (a bow drawn n ticks: `72000 - n`), `effect(id, seconds, amplifier?)`,
`bed(x, y, z, dir)` (foot block), `sleepIn(x, y, z)` (right-clicks the bed), `otherPlayer(name, x,
y, z, yaw, {held, armor, color, sneak, use, bed})` (an `EntityOtherPlayerMP` posed like the
reference harness's `otherplayer`), `clearOthers()`, `state()` (sleep timer, bed, effects, FOV).
`mc.dev.sky.pin` also settles the eased FOV (`EntityRenderer.settleFovModifier`).
`mc.dev.account` (`src/client/AccountDevTools.ts`): `testSkinDataUrl(w?, h?, hue?)` (a
recognisable test skin as a PNG data URL; other sizes test the refusal), `uploadSkin(dataUrl)`
(what Upload Skin... does with a chosen file, through the open Account Manager when there is
one), `setRemoteSkin(name, dataUrl | null)`, `localPixel(x, y)` / `remotePixel(name, x, y)`,
`state()` (name, skin, saved skin, other players' skins, the boot splash shown), `screen()`
(the open screen among `mainmenu`, `accountmanager`, `options`, `multiplayer`,
`directconnect`, `roomcode`, `addserver`, `connecting`, `disconnected`, `splash`) and
`showBootSplash(i)` (stops the game loop and draws the boot splash as start-up does). Debug
screens for `mc.dev.screen(name)`: `accountmanager`, `roomcode`, `splash1`, `splash2`.
Key codes are LWJGL codes (`src/client/Keyboard.ts`, e.g. W = 17, space = 57, left shift = 42).
A key or button must stay down for at least one tick to be seen by the player, which is what
`press` and `click` do.

Under automation (`navigator.webdriver`) the game treats itself as focused even without Pointer
Lock, so `mc.dev` input works headless.

## Screenshot harness

```sh
npm run build
node scripts/shot.mjs title                  # scripts/scenarios/title.json
node scripts/shot.mjs spawn --out shots      # spawn at noon, F3, selection outline
node scripts/shot.mjs interact               # walk, fly, break and place, with assertions in the log
node scripts/shot.mjs effects                # every particle type, spawn rules, sounds, records and music (asserts)
node scripts/shot.mjs inventory              # E, slot tooltip, pick up and put back a stack
node scripts/shot.mjs dynamics               # fluids over time, falling blocks, fire, trees, leaf decay, snow (counts in the log)
node scripts/shot.mjs renderblocks           # every render type, tile-entity renderers, fluids, end portal, 3D item icons (vanilla captures in ref/extra/renderblocks*)
node scripts/shot.mjs mobshostile            # the 14 hostile mobs and variants; Creative players are ignored at night (asserts)
node scripts/shot.mjs mobspassive            # the 12 passive mobs and variants, milking, shearing, taming, trading window (log)
node scripts/shot.mjs chat                   # chat line, /time, /give @p, /help, Tab completion, /kill
node scripts/shot.mjs flat                   # a Superflat world (bedrock, dirt, dirt, grass; spawn y=4)
node scripts/shot.mjs entities               # items, arrows, orbs, paintings, frames, TNT, boat, minecarts, player damage rules (checks in the log)
node scripts/shot.mjs survival               # survival HUD (full, damaged, hurt flash, air, hardcore), crack overlay,
                                             # timed mining, eating, fall damage, drowning, death, respawn,
                                             # inventory, /gamemode, /xp, hardcore deletion (asserts)
node scripts/shot.mjs sky                    # sky, fog, clouds, render distances, rain, thunder and a bolt,
                                             # snow, desert, underwater, lava, in-wall and pumpkin overlays
node scripts/shot.mjs worldgen               # seeds "claude"/123456789 vs the reference spawn, cave, biomes, village; flat and large biomes
node scripts/shot.mjs player                 # F5 back/front, bow and sword poses, a posed line-up of players,
                                             # the effect list, night vision, blindness, sleeping in a bed
                                             # (Leave Bed, skip to morning, bed spawn), nausea, a boat (checks)
node scripts/shot.mjs account                # title, Account Manager (Steve, refused size, custom skin,
                                             # drag, name checks), Options, both splashes and the real
                                             # boot splash, Multiplayer with an old room entry and an
                                             # unreachable server, Direct Connect failing, Room Code,
                                             # Open to LAN, then a world: another player's skin, F5,
                                             # the arm and the inventory in the custom skin (asserts)
node scripts/shot.mjs path/to/scenario.json --url http://localhost:5173/ --server none
```

The harness starts `vite preview` on the port of `--url` (default `http://localhost:4173/`) when
nothing answers there (and stops it at the end unless `--keep`), so an agent assigned another
preview port passes e.g. `--url http://localhost:4175/`. It launches the Chromium in
`/opt/pw-browsers` with SwiftShader WebGL and runs the steps at 854x480 (`--size WxH` to change),
the size of the reference captures.

Scenario steps (JSON array):

| Step | Meaning |
|---|---|
| `{"goto": "?dev=1&autostart=1&seed=1"}` | load the page and wait for boot |
| `{"waitFor": "mc.dev.isInGame()", "timeout": 120000}` | poll a JS expression |
| `{"eval": "mc.dev.setTime(6000)"}` | run JS in the page; the result is logged |
| `{"ticks": 20}` | run game ticks immediately |
| `{"wait": 500}` | wait in real time |
| `{"key": "F3"}` | press a key through Playwright |
| `{"type": "text"}` | type text |
| `{"click": [x, y]}`, `{"move": [x, y]}` | mouse click or move, in page pixels |
| `{"down": [x, y]}`, `{"up": [x, y]}` | press / release the left button; lists (GuiSlot) poll the button while rendering, so hold it across a `wait` |
| `{"shot": "name.png"}` | write a screenshot into the output directory (default `shots/`) |

SwiftShader renders on the CPU, so expect 1 to 5 fps in the harness while terrain streams in
(the GPU path dominates; a frame's JavaScript takes a few milliseconds). Wait for
`mc.dev.pendingSections(r) === 0` before capturing. After a key that opens or closes a screen
(T, /, E, Enter, Escape), wait for the screen state (`{"waitFor": "mc.currentScreen !== null"}`)
before typing: at these frame rates several key events can land in one tick, and the ones that
arrive before the screen opens act as game keys, exactly as they would in the original
(`scripts/scenarios/chat.json` shows the pattern).

The `sky` scenario stands at (8.5, 4, 8.5) on a Superflat world with Normal render distance, so
its shots line up pixel for pixel with vanilla captures of the same scenes (Superflat presets
`2;7,2x3,2;1`, `...;12`, `...;2`, water `2;7,2x3,2,5x9;1`, lava `2;7,2x3,2,3x11;1`); compare with
ImageMagick (`compare -metric AE -fuzz 3%`) after masking the hand and hotbar. Sky, clouds, fog and
the rain colours match to within a colour step; rain streaks differ by the renderer's tick count.

## Logic checks without a browser

Simulation code imports no DOM, so it can run under Node. Bundle a script that imports the
modules it needs (start with `import './src/block/Blocks'` so blocks are registered) and run it:

```sh
npx rolldown check.ts --format esm --platform node -o check.mjs && node check.mjs
```

Checks that live in the repository are in `tests/` and run with
`node scripts/run-node-test.mjs tests/crafting.test.ts tests/items.test.ts tests/placement.test.ts tests/survival.test.ts`
(recipes and smelting, the item registry with names/potions/enchantments, item placement
against an in-memory world, and the survival rules against a real `World`: game modes, mining
times and drops, hunger, damage, eating, death and respawn). `tests/renderblocks.test.ts` renders every render type, metadata value and item;
`tests/containers.test.ts` drives the creative grid and every container (furnace, workbench, chest,
dispenser, hopper, brewing, enchanting, anvil); `tests/mobshostile.test.ts` and
`tests/mobspassive.test.ts` run every mob in a real `World` (Creative targeting rules, spawners,
breeding, taming, villages). `tests/dynamics.test.ts` runs dynamic block behaviour (fluid flow
shapes, falling blocks, leaf decay, saplings, fire, crops, weather, melting, portals) against a
real `World` built from flat chunks by `tests/dynamicsWorld.ts` (`makeWorld`, `addFakePlayer`
so random ticks run, `tick`). The `dynamics` scenario pours water and lava, drops sand and gravel,
burns a wooden house, grows trees with bone meal, lets leaves decay and snows on a cold biome; its
fluid shots line up with vanilla captures of the same block list (flat world, seed `claude`,
camera at (7.5, 12, 70), yaw 0, pitch 40). The `items` and `item-icons` scenarios exercise items in the game.

This is how tile-entity lifecycle, explosions, spawning and the RenderBlocks rewrite were
checked: the rewrite was compared byte for byte with the previous implementation over random
`ChunkCache` snapshots (all render settings, rotations, overridden bounds and textures) and every
block's item render. Keep such scripts outside the repository unless they become real tests.

## Multiplayer

```sh
node scripts/run-node-test.mjs tests/netprotocol.test.ts tests/nettransport.test.ts tests/netsession.test.ts tests/netskins.test.ts tests/account.test.ts
npm run build && node scripts/mp-test.mjs --out shots/mp
```

`tests/netprotocol.test.ts` round-trips every packet, frames and chunk data, and checks the
limits (oversized frames, strings, lists and NBT, truncated and fuzzed input, packets from the
wrong side), the item tag whitelist, the frozen Handshake and KickDisconnect bytes, room codes,
room keys and usernames. `tests/nettransport.test.ts` feeds trystero's (patched) action wire
layer: unknown action types, oversized and too many unfinished messages. `tests/netsession.test.ts` builds a host `World` from flat
chunks with a `LanServer` and joins guests over `MemoryTransport` (each guest a real
`NetClientHandler` + `WorldClient`): login and chunk streaming (blocks and light), movement
both ways and the long-jump correction, sneaking, placing and breaking both ways (prediction,
multi-block changes, reach), survival digging timing, chat, commands, `/tell` and `/tp` by name, `@p` from a guest,
a tracked mob (movement, metadata, attack, hurt and death), dropped items, a chest window
(contents, clicks, closing), game mode changes, death and respawn, a second guest, name clashes,
version mismatch, invalid names, malformed / unknown / oversized / server-only packets, NaN
positions and packet floods, leaving, coming back with the same inventory and place, and the
host closing the room; and what the multiplayer review found: closing the own inventory, mobs
through whole-chunk resends, boat steering, light for late joiners, render distance, creative
items with bad tags or technical ids, a throwing entity, speed hacks, a creative nuker, signs,
the bed teleport, dead guests, rejoin tokens, a second login, Hardcore deaths and the host's
/kick, /ban, /pardon and /whitelist. Guests walk (`walkTo`) rather than jump: the host corrects
moves longer than a player can make in a tick.

`scripts/mp-test.mjs` is the one browser test: `vite preview` on port 4400 and a trystero
WebSocket relay on 4401 (`--port`, `--relay-port`), then two contexts of one headless Chromium.
The host (`Alice`) uploads a skin (shots of it in third person, on the arm and in the
inventory) and opens a Superflat world to LAN; the guest types the name `Bob` and uploads a
64x64 skin in the Account Manager, then goes through Multiplayer and Room Code with the room
code typed in lower case; both place blocks the other sees, chat by typing, look at each
other's nameplates and skins (checked pixel for pixel), open the TAB list, sneak, and finally
the host quits and the guest lands on the disconnect screen. It prints PASS/FAIL per check (with both
sides' state on a failure) and writes `01_host_open_to_lan.png` ... `11_guest_disconnected.png`.
Signalling is local, but the game data goes over real WebRTC data channels. `--public` uses the
public Nostr/BitTorrent relays instead, which needs a browser that can reach them (the sandbox
used for development intercepts TLS, so only the local relay works there).

`tests/account.test.ts` checks skin sizes and 1.5.2's skin processing, the skin registry, the
`MC|Skin` payloads and the host's relay (rate limit, newcomers, leaving), 1.5.2's server address
parsing, the connector registry (a plain address is refused), the saved list's migration of old
room codes and the 50/50 boot splash; `tests/netskins.test.ts` runs skins through a real LAN
game with two guests.

`mc.dev.net` (`src/client/NetDevTools.ts`): `host(name?, mode?, cheats?)` opens the world to
LAN and resolves with the room code; `join(code, name?)` opens Room Code's connecting screen;
`connect(address)` Direct Connect's; `state()` returns the role, room code, player list, guest state, loaded chunks and
entities, other players' positions, bytes and the network screen (`'connecting'`,
`'downloading'`, `'disconnected'`); `chat(n)` the last chat lines; `leave()`. The debug screens
`multiplayer`, `directconnect`, `roomcode`, `accountmanager`, `sharetolan` and `pause` open
with `mc.dev.screen(name)`.

## Audio

Headless Chromium has no speakers, but the harness allows autoplay, so the audio context runs and
sounds really decode and start. `mc.sndManager.debugLog` lists the recent events (`requested`,
`started`, `missing`, `dropped`, `failed`, `music`, `record`, `stopped`, with name, file, volume,
pitch and position) and `mc.sndManager.getDebugInfo()` the context state, channels in use, cache,
music countdown and the record pools; `scripts/scenarios/effects.json` asserts on them. With the
game clock frozen (`mc.timer.timerSpeed = 0`) particles can be spawned and advanced tick by tick
with `mc.dev.ticks(n)` for deterministic captures.

## Comparing with the original

Reference captures of the real 1.5.2 client with the bundled Faithful pack (854x480, GUI scale
auto) are produced outside the repository; the useful ones are the title screen, spawn at noon
with and without F3, the block outline while looking down, the loading screens, the pause and
options menus, and HUD captures at each GUI scale. World generation is a port of 1.5.2's,
so the same seed gives the same terrain: the reference spawn, cave, water and biome positions of
seeds "claude" and 123456789 are checked by `scripts/scenarios/worldgen.json`.
