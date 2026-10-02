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
| `?autostart=1&seed=<s>&type=<default\|flat\|largeBiomes>` | skips the menus and creates a world (`seed` is a number or text, as in Create World) |
| `?hotbar=1` | fills the hotbar like the reference captures (stone, grass, dirt, cobblestone, planks, log, glass, torch, diamond sword when it exists) |
| `?time=<ticks>` | sets the world time once the player exists (6000 = noon, 18000 = midnight) |
| `?pos=x,y,z[,yaw,pitch]` | teleports the player (feet position) once the player exists |
| `?fly=1` | starts flying |
| `?preserve=1` | creates the WebGL context with `preserveDrawingBuffer` |

`mc.dev` helpers (see `src/client/DevTools.ts`): `isInGame()`, `pendingSections(radius)`,
`tp(x, y, z, yaw?, pitch?)`, `look(yaw, pitch)`, `setTime(t)`, `select(slot)`, `fillHotbar(ids?)`,
`setFlying(on)`, `ticks(n)` (runs game ticks synchronously), `weather(kind, ramp?)` (`'clear'`,
`'rain'` or `'thunder'`; without `ramp` the fades are skipped), `key(code, down)`,
`press(code, holdTicks)`, `mouse(button, down)`, `click(button, holdTicks)`, `target()`.
`mc.dev.sky` (`src/render/sky/SkyDevTools.ts`): `pin(time?)` freezes the clock like the reference
harness's `freeze` (partial tick 0, `mc.dev.ticks(n)` still steps) and pins cloud ticks, torch
flicker, fog brightness, vignette and arm sway; `unfreeze()`; `strike(x, z)` (lightning bolt);
`setBiome(id)` for every loaded column (12 Ice Plains = snow, 2 Desert = no rain);
`fill(id, y0, y1, radius?)`; `helmet(id | null)` (86 = pumpkin).
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
node scripts/shot.mjs inventory              # E, slot tooltip, pick up and put back a stack
node scripts/shot.mjs chat                   # chat line, /time, /give @p, /help, Tab completion, /kill
node scripts/shot.mjs flat                   # a Superflat world (bedrock, dirt, dirt, grass; spawn y=4)
node scripts/shot.mjs sky                    # sky, fog, clouds, render distances, rain, thunder and a bolt,
                                             # snow, desert, underwater, lava, in-wall and pumpkin overlays
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

This is how tile-entity lifecycle, explosions, spawning and the RenderBlocks rewrite were
checked: the rewrite was compared byte for byte with the previous implementation over random
`ChunkCache` snapshots (all render settings, rotations, overridden bounds and textures) and every
block's item render. Keep such scripts outside the repository unless they become real tests.

## Comparing with the original

Reference captures of the real 1.5.2 client with the bundled Faithful pack (854x480, GUI scale
auto) are produced outside the repository; the useful ones are the title screen, spawn at noon
with and without F3, the block outline while looking down, the loading screens, the pause and
options menus, and HUD captures at each GUI scale. World generation is approximate (see
`ARCHITECTURE.md`), so compare composition, colours, lighting and GUI layout rather than the
exact terrain.
