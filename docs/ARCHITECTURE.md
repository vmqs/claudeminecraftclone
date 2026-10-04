# Architecture

This is a browser recreation of **Minecraft 1.5.2 (Java Edition)** — Survival, Hardcore, Adventure
and Creative — written in
TypeScript on raw WebGL2 and built with Vite. The goal is to *feel and look* like the original:
the same constants, physics, lighting, GUI layout, sounds, and textures.

This document is the contract every module is written against. If you change a contract, update
this file in the same commit.

## 1. Scope

In scope:
- **Survival, Hardcore and Creative** (and Adventure through `/gamemode`), as in 1.5.2. Create
  World defaults to Survival; the mode lives on the player (`EntityPlayer.gameType`, the
  server's `ItemInWorldManager`) and the client's `PlayerControllerMP` follows it. Creative: the
  player is invulnerable, flies with double-tap space, breaks blocks instantly and gets items
  from the creative inventory. Survival: health, hunger, air, armour and experience, timed
  mining with tool tiers and drops, item wear, death and respawn (see §8.1). Hardcore: Survival
  on Hard, without cheats, and death deletes the world.
- **The overworld, the Nether and the End** (§5.8): one `World` per dimension the game uses,
  nether portals (lit with fire in an obsidian frame, 80 ticks in Survival) and end portals
  travel between them through the `Teleporter`, each dimension saves into its 1.5.2 folder
  (`DIM-1`, `DIM1`), and LAN guests can be in any dimension.
- **Mobs and combat.** All overworld mobs and every spawn egg in the 1.5.2 creative inventory,
  with their AI, natural spawning, drops, and the original models and animations. The player can
  hit, shoot (bow), and explode mobs. As in 1.5.2, hostile mobs do not target a Creative player
  (`World.getClosestVulnerablePlayer` skips players whose capabilities disable damage); they
  still fight each other (iron golems, wolves); outside Creative they hunt the player. In
  Creative only out-of-world damage (`/kill`, falling into the void) kills the player, which shows
  the death screen and respawns at the bed or the world spawn.
- World generation is a **port of 1.5.2's generator**: the same seed gives the same biomes,
  terrain, caves, decoration and structures (Default, Large Biomes and Superflat with presets).
- **World saving like 1.5.2's singleplayer saves** (§5.7): worlds are stored in IndexedDB in the
  real Anvil format (level.dat, region chunks, players) and survive reloading the page; the world
  list can export a world as a .zip that opens in Minecraft 1.5.2 and import such a .zip. Options
  and key bindings are kept in `localStorage`, like `options.txt`.
- **Multiplayer like Open to LAN**, peer to peer: the host's world is authoritative, guests join
  with a room code over WebRTC (no game server), with the name and skin set in the Account
  Manager (see `docs/MULTIPLAYER.md`). Direct Connect and the server list take real server
  addresses as in 1.5.2, through a connector hook that has no browser implementation yet.
- Keyboard and mouse only (Pointer Lock).
- Deployed as a static site to GitHub Pages.

- **Achievements and statistics** as in 1.5.2 (the pause menu's Achievements map and Statistics
  screen, the "Achievement get!" toast and the open-the-inventory hint), kept per username in
  `localStorage` like the stats file (§13). We Need to Go Deeper comes from any portal trip and
  The End. from the End's exit portal; as in the 1.5.2 bytecode (EntityPlayerMP.travelToDimension),
  The End? is only given for a trip from the End to the overworld, which never happens.

Out of scope (render as static or decorative where a block exists): redstone logic, dedicated servers, enchanting, brewing, trading. (The container and crafting frameworks exist, so a
crafting table opens and works once recipes are registered, but no recipes are required.)

## 2. Fidelity rules

1. **Behaviour comes from the original.** Constants, formulas, timings, colours, layouts, and
   texture coordinates should match 1.5.2. A decompiled, MCP-named copy of the 1.5.2 client is the
   reference (see `docs/RESEARCH.md`). Name things after their MCP counterparts (`Block`,
   `RenderBlocks`, `EntityRenderer`, `GuiScreen`, `moveEntity`, `getMixedBrightnessForBlock`, …) so
   anyone can cross-reference.
2. **Write original TypeScript; do not paste decompiled Java** into the repo or its comments. Port
   behaviour and data (numbers, tables, formulas), not code text.
3. **Never commit Mojang assets** (textures, sounds, lang files, the jar, or decompiled source).
   `scripts/fetch-assets.mjs` downloads them at build time into git-ignored `public/assets/`. The
   only bundled art is the user's *Classic Faithful 32x* pack in `resourcepacks/` (license:
   `resourcepacks/FAITHFUL_LICENSE.txt`, credited in the README).
4. When the original has a quirk (fog on sky, the "1.5 lighting" curve, step-up, sneak edge-guard,
   bobbing), reproduce the quirk.

## 3. Repository layout

```
index.html                 canvas host page
scripts/fetch-assets.mjs   builds public/assets/ (vanilla layer + bundled packs + manifest.json)
scripts/decompile.sh       rebuilds the research source in .cache/src152 (never committed)
scripts/shot.mjs           headless-Chromium screenshot harness (see §12)
resourcepacks/             bundled texture pack zip(s)
src/
  main.ts                  boot: create canvas, load assets, start Minecraft
  client/                  Minecraft (main loop), Timer, GameSettings, KeyBinding, input,
                           PlayerControllerCreative, EntityPlayerSP, MovementInput, devtools
  core/                    JavaRandom, MathHelper, AxisAlignedBB, Vec3, MovingObjectPosition,
                           Facing, NBT-ish helpers, I18n (StringTranslate over lang/en_US.lang)
  assets/                  ResourceManager (layered packs), manifest types, image/text/sound loading,
                           PackImport (texture pack .zip reader, 1.6+ conversion via ModernPackMap),
                           UserPacks (imported packs in IndexedDB), PackFiles (import glue)
  render/gl/               GL facade (fixed-function emulation), Tessellator, MatrixStack, shaders
  render/texture/          TextureManager, TextureMap + Stitcher + Icon, animated textures,
                           compass and clock, dynamic lightmap texture
  render/                  RenderGlobal, WorldRenderer (16^3 sections), EntityRenderer (camera, fog,
                           lightmap, frame orchestration), RenderBlocks, ItemRenderer (first-person),
                           RenderHelper (item lighting), Frustum, sky, clouds
  render/sky/              rain and snow (RenderRainSnow), screen overlays (pumpkin, portal, fire),
                           the client-daylight light quirk, mc.dev.sky helpers, weather registrations
  render/entity/           RenderManager, Render*, models (ModelBase, ModelRenderer, ModelBox, Model*)
  render/tileentity/       chest, ender chest, sign, mob spawner, skull, piston, enchant table, beacon
  render/particle/         EffectRenderer and EntityFX subclasses
  world/                   World, Chunk, ChunkSection, ChunkProviderClient, lighting engine,
                           NextTickListEntry scheduler, Explosion, SpawnerAnimals, IBlockAccess,
                           ChunkCache (padded snapshot), tile entities
  world/gen/               runs in the world-gen worker: biomes (GenLayer*), ChunkProviderGenerate,
                           MapGenCaves/Ravine, WorldGen* features, structures, initial lighting
  workers/                 worker entry points: worldgen.worker.ts, mesher.worker.ts
  block/                   Block base, Material, StepSound, Blocks registry, Block* subclasses
  item/                    Item base, ItemStack, Items registry, ItemBlock*, CreativeTabs
  item/crafting/           CraftingManager, IRecipe, ShapedRecipes, ShapelessRecipes
  entity/                  Entity, EntityLiving, EntityCreature, EntityAnimal, EntityMob,
                           EntityPlayer, EntityItem, EntityXPOrb, projectiles, EntityFallingSand,
                           EntityTNTPrimed, mobs, DataWatcher-equivalent fields
  entity/ai/               EntityAITasks and EntityAI* tasks, PathNavigate, PathFinder, look/move helpers
  gui/                     Gui, GuiScreen, GuiButton, GuiSlider, GuiTextField, GuiSlot, FontRenderer,
                           ScaledResolution, GuiIngame (HUD + F3), GuiNewChat, every screen
  gui/inventory/           IInventory, Slot, Container, GuiContainer, ContainerPlayer and GuiInventory,
                           workbench and chest windows, crafting inventories, creative inventory, furnace/dispenser/hopper/brewing/enchanting/anvil/beacon windows
  audio/                   SoundManager (Web Audio), SoundPool, music and record scheduling
  command/                 CommandHandler, CommandBase, PlayerSelector, ServerCommandManager and the
                           commands (/help, /time, /tp, /give, /kill, /seed, /say, /me, /tell so far)
  world/storage/           saving (§5.7): NBT codec, region files, AnvilChunkLoader, level.dat,
                           IndexedDB/memory backends, SaveHandler, SaveFormat (world list),
                           WorldSaveController (autosave, Save and Quit), .zip import/export
  net/                     multiplayer: room codes, usernames, protocol/ (packets, chunk codec),
                           transport/ (WebRTC via trystero, in-memory), server/ (LanServer,
                           NetServerHandler, EntityPlayerMP, EntityTracker), client/ (WorldClient,
                           NetClientHandler, EntityClientPlayerMP, PlayerControllerGuest)
docs/                      ARCHITECTURE.md (this file), MULTIPLAYER.md, TESTING.md, RESEARCH.md
```

Modules under `block/`, `item/` (data only), `core/`, `world/gen/`, `world/ChunkCache`,
`render/RenderBlocks`, and `render/texture/Icon` **must not touch the DOM, WebGL, or audio**, because
the workers import them. Keep those imports one-way.

## 4. Conventions (same as 1.5.2)

- Axes: +X east, +Z south, +Y up. World height is 256 (sections 0–15). Sea level is 63.
- Yaw in degrees: 0 faces +Z (south), 90 faces −X (west). Pitch is positive looking down.
- Facing/side indices: 0 down (−Y), 1 up (+Y), 2 north (−Z), 3 south (+Z), 4 west (−X), 5 east (+X).
- Ticks: 20 per second through `Timer` (`ticksPerSecond = 20`, at most 10 catch-up ticks per
  frame). Rendering interpolates with `partialTicks` (`prevPosX + (posX - prevPosX) * pt`).
- IDs: block IDs 0–158 and item IDs 256+ exactly as 1.5.2 (`Item.itemsList[id]`, item ID = 256 +
  index). Metadata is 4 bits.
- Randomness: `core/JavaRandom` is a bit-exact port of `java.util.Random` (48-bit LCG, including
  `nextInt(bound)`, `nextLong`, `nextFloat`, `nextDouble`, `nextGaussian`). Use it anywhere the
  original used `Random`, so distributions match.
- `MathHelper.sin` and `cos` use the same 65536-entry float table as the original. Use
  `Math.fround` where float precision visibly matters (movement, rendering offsets).
- Packed brightness (lightmap coordinates): `skyLight << 20 | blockLight << 4` (each 0–15), the
  same as `getLightBrightnessForSkyBlocks`. The lightmap texture is sampled at
  `((packed & 0xFFFF) + 8) / 256, ((packed >> 16) + 8) / 256`.
- Colours are `0xRRGGBB` integers where the original used ints.

## 5. Runtime architecture

```
Main thread                                   Workers
-----------                                   -------
Minecraft (loop: rAF -> Timer -> runTick*n -> render)
 ├─ World (client-side, authoritative)        worldgen.worker  (1 worker, prewarmed)
 │   chunks, entities, ticks, lighting  <──── populates (decorates), computes initial
 │   requests/unloads chunks ─────────────>   sky/block light; returns only *finalized*
 │                                            chunks; terrain.worker pool (1-3) makes raw terrain
 ├─ RenderGlobal ──── section snapshots ────> mesher.worker (pool of 1-4)
 │   VBOs per section/pass  <──── vertex data ─ RenderBlocks over ChunkCache (padded 20^3)
 ├─ EntityRenderer / GL facade / GUI
 └─ SoundManager (Web Audio)
```

There is no integrated server: the client `World` is the simulation. Everything below runs on
the main thread unless marked as a worker. Multiplayer adds a `LanServer` beside the host's
`World` and replaces a guest's world with a `WorldClient` fed by the host (§5.6).

### 5.1 Chunk data

`ChunkSection` (16³) holds `blocks: Uint8Array(4096)`, `meta: Uint8Array(4096)`,
`skyLight: Uint8Array(4096)`, `blockLight: Uint8Array(4096)`, indexed `y<<8 | z<<4 | x`, plus
`nonAirCount`. `Chunk` holds `sections: (ChunkSection | null)[16]` (null = all air and full
skylight), `heightMap: Int32Array(256)` (lowest y with full skylight), `biomes: Uint8Array(256)`,
`precipitationHeight`, the tile entity map, and the entity lists.

### 5.2 World generation (worker)

The main thread (`world/ChunkProviderClient`) posts `{type:'request', cx, cz}`, `{type:'cancel'}`,
`{type:'player', cx, cz, radius}`, once per world `{type:'findSpawn'}` (answered with `spawn`) and
`{type:'findStructure', id, name, x, y, z}` for eyes of ender (answered with `structure`;
`world/gen/StructureLocator` wraps it as a promise). The worker's logic lives in
`world/gen/WorldGenServer`; `workers/worldgen.worker.ts` routes messages and schedules work.

- **Terrain workers.** `worldgen.worker.ts` starts a pool of nested `workers/terrain.worker.ts`
  (one per core beyond two, 1-3) as soon as it loads; they make raw terrain
  (`ChunkProviderGenerate.provideTerrain`: noise, surface, caves, ravines, as
  `world/gen/TerrainChunk` sections) for the chunks the next jobs need, while the world-generation
  worker populates and lights; it makes terrain itself when the terrain workers are behind or
  missing (Superflat never uses them). Terrain is a pure function of seed and position, and
  prefetched terrain is only taken into the generating world (with the structure-start part,
  `recordStructures`) when generation asks for that chunk, so what is loaded, which gates light
  updates, never depends on timing: the output is byte-identical with and without it
  (`tests/worldgen-golden.test.ts`). The worker itself is started ahead of need
  (`world/WorldGenWorkers.ts`: at boot and after leaving a world), so its modules load while the
  menus are shown.

- **Generate once, keep everything.** Like the original's region files, every chunk is generated
  and populated exactly once per world. Chunks that leave the worker's working set (the loaded
  area plus three rings) are compressed into a `GenStore` (run-length coded blocks, metadata and
  light, generated tile entities, ticks and entity descriptors) and restored when needed again, so a
  chunk that comes back is identical and structure or big-tree state never drifts.
- **Finalization.** Chunk `(x,z)` is finalized when population has run for `(x-1..x, z-1..z)`
  (the original's +8 offset rule) and its light has been computed from the populated 3x3
  neighbourhood. The main thread never receives an unfinalized chunk, and the worker never
  mutates a chunk after sending it.
- **Original order at world creation.** `createSpawnPosition` runs the spawn search exactly as
  `WorldServer.createSpawnPosition` (chunks loaded on demand, populated by `Chunk.populateChunk`'s
  rules), places the bonus chest, then loads the 25x25 spawn area in
  `MinecraftServer.initialWorldChunkLoad` order, so the spawn area is populated in the same
  order as in 1.5.2 (which matters where features of neighbouring chunks overlap). The worker
  answers `findSpawn` with the spawn point right after the search and then loads that area one
  chunk per step (terrain comes from the terrain workers). The player does not wait for all of
  it: a requested chunk is finalized while the area still loads as soon as every population
  that writes into its 3x3 neighbourhood (populations `cx-3..cx+2`, `cz-3..cz+2`) has run
  (`WorldGenServer.canFinalizeEarly`), with its light computed into the payload only
  (`finalizeChunk(cx, cz, true)`), so nothing the rest of the area generates changes. The
  spawn's 5x5 are ready at about 70% of the area. Should a later population still write into a
  sent chunk's neighbourhood (counted by `GenWorld.blockWrites`), the chunk is sent again with
  `replace: true` when the area is done (`ChunkProviderClient.replaceChunk`);
  `tests/worldgen-worker.test.ts` runs the worker under Node and checks every chunk against a
  plain spawn-area-first `WorldGenServer`, byte for byte. After that, chunks are populated on
  demand, nearest to the player first.
- **Light while populating.** `GenWorld` keeps light up to date during population like
  `World.setBlock` (column sky light in `Chunk.relightBlock`, plus `updateLightByType` where every
  chunk within 17 blocks is loaded), because flowers, grass, mushrooms, snow, ice and lake grass
  test light. The light sent with a chunk is recomputed at finalization.
- **Generators.** `ChunkProviderGenerate` (Default, Large Biomes) uses the `GenLayer` stack
  (`world/gen/layer/`, bit-exact 64-bit LCG, a tile cache in front of the river-mix layer),
  the original noise terrain, `MapGenCaves`/`MapGenRavine`, the four structure generators
  (`world/gen/structure/`), lakes, dungeons, `BiomeDecoration` and world-generation animals.
  `ChunkProviderFlat` uses `FlatGeneratorInfo` presets (`FlatPresets.ts` holds the presets list).
- **Payload.** Section arrays (transferred), height map, biomes, pending ticks, generated tile
  entities as 1.5.2 NBT (`{id:'Chest'|'Trap', Items:[{Slot,id,Count,Damage,tag?}]}`,
  `{id:'MobSpawner', EntityId, ...}`; the client creates them through
  `TileEntity.createAndLoadEntity`) and entity descriptors `{name, x, y, z, yaw, data?, init?}`
  (animals, villagers with `{Profession}`, witches, `MinecartChest` with `{Items}`), created
  through `EntityList.createEntityByName`; `data` goes to `readEntityFromNBT` when the class has
  it, and `initCreature` runs unless `init` is false.
- Generation is deterministic for `(seed, worldType, generateStructures, preset)`, except the
  bonus chest, which uses an unseeded random like the original.

`ChunkProviderClient` keeps the chunks within `RenderGlobal.renderRadius + 1` of the player
loaded, adds arriving chunks within a per-frame time budget (`client/FrameBudget`), unloads chunks two beyond the radius,
and keeps unloaded chunks in memory when they were modified or hold mobs. World creation
(`Minecraft.launchIntegratedServer`) shows "Loading world / Building terrain" until the 5x5
chunks around the spawn are present, places the player like `EntityPlayerMP` (random offset of up
to 10 blocks, on `getTopSolidOrLiquidBlock`), then shows "Downloading terrain" until the area
around the player is meshed. Its opaque background hides the world, so the world is not drawn
behind it (`GuiDownloadTerrain.coversWorld`); only the meshers are fed. `Chunk` only needs a `ChunkHost` (an `IWorld` plus light and
render-update hooks), which both the client `World` and the worker's `GenWorld` implement.

Edits made by world simulation (block ticks, fluids, leaf decay, weather, light) run inside
`World.runNaturally`; anything else marks the chunk `playerModified`. A saved world (every
single-player world and a LAN host's) has a `ChunkProviderClient.saveHandler`: chunks present in
the save are read from it instead of being generated, and every chunk is saved when it unloads
(§5.7). Without one (tests), a player-modified chunk is kept whole in memory when it unloads,
otherwise only its entities are kept, and it is re-requested from the worker when it comes back.

### 5.3 Lighting (main thread)

Incremental updates use the original's sky and block light rules: `Block.lightOpacity`,
`Block.lightValue`, skylight that falls straight down through opacity-0 blocks, and BFS increase
and decrease with the same max-of-neighbours-minus-opacity rule (`updateLightByType`). Updates stop
at unloaded chunk edges. Changed light marks the affected sections dirty for re-meshing.

### 5.4 Meshing (worker pool)

The pool has one mesher per core beyond two (at least two where there are more than two cores,
at most four), each with up to three jobs. Dispatch settles empty sections at once without a
mesher slot, then hands out the dirty sections in the frustum first, nearest first. Snapshots are
copied per chunk row run (`render/SectionSnapshotFill`), and the mesher skips full cubes whose
six neighbours are opaque cubes and remembers each cell's mixed brightness while meshing a
section (`ChunkCache.mixedBrightness`); `tests/mesher-golden.test.ts` holds the mesh bytes to
hashes recorded before those changes. Results are uploaded within the frame budget.

When a section is dirty and all 8 horizontal neighbour chunks are loaded, `RenderGlobal` copies a
**padded snapshot** (section ± 2 blocks: ids, meta, sky, and block light, plus biome IDs for the
padded 20×20 columns) and posts it to a mesher worker. The worker builds a `ChunkCache`
(`IBlockAccess`) over it and runs `RenderBlocks` for every block, producing two passes
(`getRenderBlockPass()`: 0 = opaque and cut-out, 1 = translucent such as water and ice). It returns
interleaved vertex data. Icon UVs come from the atlas layout, which is broadcast to workers after
stitching. Grass, foliage, and water colormaps are sent to workers once at init.

### 5.5 Simulation

`World.tick()` covers world time and moon phase, weather cycling (`World.clientWeather.tick()`: the
server's `updateWeather`, then the client's view of it, see §6.4), mob spawning
(`World.mobSpawner`, by default `SpawnerAnimals.findChunksForSpawning`), scheduled block updates
(`scheduleBlockUpdate`, `tickRate`; at most 1000 per tick from `TickScheduler`, a heap with a
position index whose chunk removal flags entries instead of rebuilding, and whose `inChunk(cx, cz)`
lists a chunk's entries in run order for saving), and `tickBlocksAndAmbiance`: per active chunk the mood-sound
check, the lightning roll (1 in 100000 while thundering), the ice and snow roll, and 3 random
block ticks per non-empty section, consuming `rand` and `updateLCG` in the original order.
`World.updateEntities()` ticks weather effects, entities (then removes dead ones) and tile
entities (`updateEntity`, with additions and removals deferred while iterating).

### 5.6 Multiplayer

A host keeps its single-player loop; `Minecraft.runTick` reads guest packets first
(`netHandler.processReadPackets` on a guest), ticks the world, then `lanServer.tick()` (logins,
chunk streaming, block changes, entity tracking, time, sounds and particles), and flushes at
the end. A LAN game never pauses, and ticks from a timer while its tab is hidden. Guests'
players are `EntityPlayerMP`s in the host world under server rules; the host world reports
changes through `World.netEvents` (a `WorldNetListener`) and an `IWorldAccess`. A guest's
`WorldClient` is `isRemote`: no world generation worker requests, block ticks, spawning or AI;
its entities are animated from network updates (`src/net/client/RemoteEntityTick.ts`). Details
in `docs/MULTIPLAYER.md`.

### 5.7 Saving (`src/world/storage/`)

Worlds are saved like 1.5.2's integrated server, in its file formats, into IndexedDB
(`SaveBackend`: one database, `files` keyed `[folder, path]` holding `level.dat`,
`players/<name>.dat`, `data/*.dat`, and `chunks` keyed `[folder, cx, cz]` holding each chunk's
zlib-compressed NBT exactly as a region-file sector run stores it; `MemoryBackend` for tests and
browsers without IndexedDB). `navigator.storage.persist()` is requested once.
- **NBT** (`NBT.ts`): tags stay plain objects (`TagCompound`); the binary type of each key is
  recorded in a hidden map by the typed setters (`NBT.setShort(tag, 'Fire', n)`, `setList(tag,
  key, NBTType.Double, list)`...) and by the reader, so imported tags are written back with their
  types. Untyped numbers fall back to the 1.5.2 item and enchantment key types (`Slot` byte,
  `id`/`Damage`/`lvl` short...), else int or double. New `writeEntityToNBT` / `writeToNBT` code
  must use the typed setters with the 1.5.2 types (the original's getters throw on a wrong type).
- **Chunks** (`AnvilChunkLoader.ts`): `{Level: {xPos, zPos, LastUpdate, TerrainPopulated,
  HeightMap, Sections[{Y, Blocks, Data, BlockLight, SkyLight}], Biomes, Entities, TileEntities,
  TileTicks}}`; entities through `Entity.addEntityID` (players and unsaved classes are skipped, a
  rider carries its mount under `Riding`), back through `EntityList.createEntityFromNBT`.
  Region files (`RegionFile.ts`) are only built for export and read on import.
- **Entities and tile entities**: `Entity.writeToNBT/readFromNBT` (Pos, Motion, Rotation, Fire,
  Air, UUID...) call the class's `writeEntityToNBT/readEntityFromNBT` with the 1.5.2 keys;
  `EntityPlayer` adds the inventory, ender chest, XP, food, abilities, bed and `playerGameType`.
  World-generation descriptors still pass `data` to `readEntityFromNBT`.
- **level.dat** (`WorldInfoNBT.ts`): `WorldInfo` and the single player's tag under `Player`
  (gzip NBT, `version` 19133). A world without `Player` reads `players/<username>.dat`.
- **Lifecycle** (`SaveHandler`, `WorldSaveController`, hooked from `Minecraft`): chunks are
  snapshotted when they unload or are saved, compressed a few per tick and written in batches
  (reads check the queue first, like AnvilChunkLoader's pending list); every 900 ticks and when
  the game pauses the loaded chunks and level.dat are saved without a screen; hiding the tab saves
  too; Save and Quit writes everything behind "Saving level" / "Saving chunks" before the next
  world can open. Autosave and Save and Quit only write chunks that need it (`needsSaving`:
  never saved, changed, or holding entities), unloading always writes. `session.lock` holds the
  session's start time: a second tab opening the same world takes it over and the first one stops
  saving with 1.5.2's "The save is being accessed from another location, aborting". The world's
  `data/` files (maps and `idcounts.dat`, `villages.dat`, `scoreboard.dat`, `WorldData.ts`) are
  read when it opens and written with level.dat when they changed. Player-modified chunks stay cached (compressed) so a bed can be found
  synchronously on respawn (`ChunkProviderClient.loadSavedChunkNow`). A LAN host saves its world;
  guests never save (their `WorldClient` has no save handler); guests' own player data is not
  written to `players/` (the LAN server keeps it in memory for rejoins).
- **World list** (`SaveFormat`, `GuiSelectWorld`): read once at start-up from every level.dat
  (level.dat_old as fallback), sorted by last played, then folder; rename edits `LevelName`;
  delete stops the world's saving and removes the folder; Hardcore deletion goes through it.
- **Import/export** (`WorldTransfer.ts`): Export zips `<folder>/level.dat`, `region/r.X.Z.mca`
  (and `DIM-1/region`, `DIM1/region` for the Nether and the End),
  `players/`, `data/`; Import takes the shallowest level.dat in a .zip (with or without the top
  folder), keeps only the files of a 1.5.2 save (the three dimensions' regions), checks sizes (512 MB zip, 64 MB per file, 1 GB total),
  rejects McRegion worlds and unreadable level.dat with an `ImportError` (shown by
  `GuiErrorScreen`), stores chunks as they are (gzip chunks re-deflated) and lists the world last.

### 5.8 Dimensions (`src/world/DimensionManager.ts`, `Teleporter.ts`, `WorldProvider*.ts`)

- **Providers.** `getProviderForDimension(id)` (`WorldProviders.ts`) makes `WorldProvider`
  (the overworld, 0), `WorldProviderHell` (-1: no sky and no sky light, the 0.1 light floor,
  fog 0.2/0.03/0.03 that shows close by, celestial angle 0.5, no respawning, beds explode) and
  `WorldProviderEnd` (1: no sky light, angle 0, the tunnel sky box `render/sky/DimensionSky.ts`,
  its own lightmap, entrance at 100,50,0). `new World(info, provider)`; the Nether's and the
  End's worlds share the overworld's `WorldInfo` but never move its clock or weather
  (`World.derivedInfo`, DerivedWorldInfo); `getActualHeight()` is 128 without a sky.
- **Worlds.** `DimensionManager` (single player and a LAN host; `mc.dimensions`) is
  MinecraftServer's `worldServers`: the overworld's World always exists and ticks (the clock),
  the others while a player, a LAN guest or an entity on its way is there. Every loaded
  dimension has its own `ChunkProviderClient` and world-generation worker (`init` carries
  `dimension`; `DimensionGenerators` picks the generator), its own `Teleporter`, and saves into
  the one `SaveHandler`. With nothing to keep for 100 ticks a dimension is saved and unloaded
  (its worker stops; the overworld keeps its World without chunks). `Minecraft.runTick` ticks
  every loaded world (overworld, Nether, End) and loads chunks for all of them
  (`tickChunkLoading`: the player, `extraCenters` per dimension from the LAN server, arrivals).
  Maps and the scoreboard are shared with the overworld (`shareMapStorage`, `shareScoreboard`).
- **Travel.** `Entity.onEntityUpdate`'s portal section (server side) counts the ticks in a nether
  portal (`getMaxInPortalTime`: 0, players 80, Creative 0; cooldown `getPortalCooldown` 900, players
  10) and calls `travelToDimension`, which goes through `Entity.dimensionTravel`
  (`Minecraft.onEntityTravel`). The client player's trip is `PlayerTravel` (`mc.travel`): after the
  world tick it leaves its world (`World.removePlayerEntityDangerously`), the coordinates are scaled
  (/8 into the Nether, x8 out of it, the End's entrance; `DimensionManager.arrivalPoint`), the client
  switches world behind "Downloading terrain", and once the chunks around the arrival point are
  loaded (and every saved chunk within 128 blocks, the only ones that can hold a portal;
  `arrivalReady`) `Teleporter.placeInPortal` finds the nearest portal or builds one (or the End's
  obsidian platform). Other entities leave at once and a copy arrives the same way
  (`transferEntity`). The client half of the player keeps its own portal flag (`clientInPortal`:
  swirl, `portal.trigger`). Dying anywhere respawns in the overworld; the End's exit portal shows
  `GuiWinGame` when the build has it (`PlayerTravel.winGameScreen` or `src/gui/GuiWinGame.ts`)
  and respawns keeping everything.
- **Saving.** A dimension's chunks are kept under `<folder>/DIM-1` and `<folder>/DIM1` in the
  backend (`chunkFolderOf`), read by `SaveHandler.loadDimension(dim)` before its chunks are
  requested; the player's `Dimension` tag opens the world in that dimension; export, import and
  delete cover `DIM-1/region` and `DIM1/region`.

## 6. Rendering

### 6.1 GL facade (`render/gl`)

The original renders through OpenGL 1.x fixed function: matrix stacks, `glColor`, two-light
`RenderHelper` lighting, `GL_ALPHA_TEST` at 0.1, `GL_FOG`, and the lightmap on texture unit 1.
Porting is far simpler and more faithful if we emulate that API on WebGL2.

- `GL.matrixMode/pushMatrix/popMatrix/loadIdentity/translate/rotate/scale/multMatrix/ortho` and
  `GLU.perspective`, with separate projection and model-view stacks.
- `GL.enable/disable(BLEND | DEPTH_TEST | CULL_FACE | ALPHA_TEST | FOG | LIGHTING | TEXTURE_2D | LIGHTMAP | POLYGON_OFFSET_FILL)`,
  `blendFunc`, `depthMask`, `depthFunc`, `alphaFunc(threshold)`, `color(r,g,b,a)`, `colorMask`,
  `cullFace`, `polygonOffset`, `lineWidth` (emulated with quads when needed), `clear`, `clearColor`,
  `viewport`, and `fog(mode, start, end, density, color)`.
- Lighting: `RenderHelper.enableStandardItemLighting()` and `enableGUIStandardItemLighting()`
  transform the two fixed light directions by the current model-view matrix, as the original does,
  and store them in eye space. Diffuse is 0.6, ambient 0.4, and lighting multiplies the vertex
  colour.
- `OpenGlHelper.setLightmapTextureCoords(u, v)` sets the lightmap coordinate used when a draw has
  no per-vertex brightness.
- `Tessellator` is a singleton with an immediate-mode builder: `startDrawingQuads()`,
  `startDrawing(mode)`, `setColorOpaque_F/_I`, `setColorRGBA_F/_I`, `disableColor`,
  `setBrightness`, `setNormal`, `setTextureUV`, `addVertex`, `addVertexWithUV`, `setTranslation`,
  `addTranslation`, and `draw()`. `draw()` streams into a dynamic VBO and renders with the current
  GL state. Quads become triangles through a shared index buffer.
- A single **uber-shader** handles texture, vertex colour or `glColor`, lightmap, two-light
  diffuse, alpha test, and linear or exponential fog, selected by uniforms. Terrain sections use
  the same shader with a compact static vertex format (int16 positions relative to the section,
  normalized uint16 UVs, RGBA8 colour, 2×uint8 light).

### 6.2 Textures

`TextureManager` loads by original path (`/gui/gui.png`, `/mob/pig.png`, …) through
`ResourceManager`, which looks up the selected texture pack first and then the vanilla layer.
The pack list is Default (the vanilla layer, selected on first launch), the bundled packs and the
packs the player imported; the choice is kept in `localStorage` (`mc152.texturePack`) and
`?pack=<id|name|default>` overrides it for one page load. Imported packs are .zip files read by
`assets/PackImport.ts` (no DOM): sizes, entry counts, paths and PNG headers are checked, files
1.5.2 does not use are dropped, and 1.6+ resource packs (`assets/minecraft/textures/...`) are
converted through the generated name table `assets/ModernPackMap.ts`
(`scripts/gen-pack-map.mjs` matches texture pixels across client jars; only names are kept),
including `.png.mcmeta` animations; textures whose layout changed (64x64 skins, 1.15+ chests)
are left out. `assets/UserPacks.ts` keeps them in IndexedDB (memory only where it is missing)
and the selected one is served through object URLs, so every loader works unchanged.
Filtering is NEAREST, with no mipmaps. `TextureMap` stitches `textures/blocks/*.png` ("terrain")
and `textures/items/*.png` ("items") into atlases and hands out `Icon`s via
`registerIcon(name)`. The cell size is the pack's most common sprite width; every sprite is scaled
(nearest-neighbour) to a whole number of cells, so a 16 px water strip in the 32 px Faithful pack
becomes one 32 px cell and a 64 px sprite takes 2×2 cells, and the cells are packed into a
power-of-two grid, largest first. Animated
textures use vertical strips with optional `.txt` frame sequences (`water`, `lava`, `water_flow`,
`lava_flow`, `fire_0`, `fire_1`, `portal`), and `compass` and `clock` follow game state. GUI
`drawTexturedModalRect` UVs are in 1/256 units of the texture, so HD GUI textures need no special
cases.

### 6.3 Frame (EntityRenderer.renderWorld order)

1. Update the lightmap texture (sky brightness by time, torch flicker, gamma) and the fog colour.
2. Clear to the fog colour. Apply camera transforms (view bobbing, F5 modes, FOV:
   `70 + fovSetting*40`, ×1.1 when flying, sprint multiplier).
3. Sky: dome, sunrise and sunset fan, sun, moon phases, stars, void.
4. Terrain pass 0 (alpha test), entities, tile-entity renderers, block selection outline, particles.
5. Terrain pass 1 (translucent: water and ice), weather (rain and snow), clouds (fast or fancy).
6. First-person hand and held item (own projection), then the screen overlays: water/vignette
   overlay, then the GUI.

The far plane is `256 >> renderDistance` (Far 256, Normal 128, Short 64, Tiny 32), and the loaded
radius follows `RenderGlobal`'s `renderChunksWide`. Render distance, graphics (fancy leaves and
clouds), smooth lighting, clouds, particles, view bobbing, brightness, GUI scale, and FOV all
come from `GameSettings` and behave as in 1.5.2.

### 6.4 Sky, fog and weather quirks kept from 1.5.2

- Fog distance is radial and computed per vertex (`length(eye)`, interpolated): the reference GL
  (Mesa, like NVIDIA) has `GL_NV_fog_distance`, which `setupFog` switches to `GL_EYE_RADIAL_NV`.
  Quads are split along the v1-v3 diagonal as Mesa does, which decides how per-vertex fog,
  colour and smooth light interpolate across a quad.
- The client world computes `skylightSubtracted` once at world time 0 and never again, so the
  fog brightness, the vignette and the water overlay always see daylight. Client-side light
  queries go through `withClientSkylight` (`src/render/sky/ClientWorldView.ts`).
- Rendering reads `World.clientWeather` (`src/world/WeatherCycle.ts`), not the server strengths:
  the client restarts its rain strength at 0 when the server's `isRaining()` turns true (at 1 when
  it turns false) and never learns about thunder, so storms look like rain plus bolts.
  `getSkyColor`, `getCloudColour` and `getSunBrightness` use these client values.
- `EntityLightningBolt` does the server's work (fire, `onStruckByLightning`, thunder sounds) and
  the client's (`World.lastLightningBolt` flash, drawn by `RenderLightningBolt`).

## 7. Blocks and items

`Block` mirrors the original's API surface (MCP names): static `blocksList`, `opaqueCubeLookup`,
`lightOpacity`, `lightValue`, `canBlockGrass`, and `useNeighborBrightness` tables, plus
`blockID`, `blockMaterial`, `stepSound`, `slipperiness`, `blockHardness`, `blockResistance`, the
bounds (`minX..maxZ` with `setBlockBounds`, `setBlockBoundsBasedOnState`, `setBlockBoundsForItemRender`),
`getRenderType`, `isOpaqueCube`, `renderAsNormalBlock`, `getRenderBlockPass`,
`shouldSideBeRendered`, `getBlockTexture(world,x,y,z,side)`, `getIcon(side, meta)`,
`registerIcons`, `colorMultiplier`, `getBlockColor`, `getRenderColor`, `getMixedBrightnessForBlock`,
`getCollisionBoundingBoxFromPool`, `addCollisionBoxesToList`, `getSelectedBoundingBoxFromPool`,
`collisionRayTrace`, `canPlaceBlockAt`, `canPlaceBlockOnSide`, `canBlockStay`, `onBlockPlaced`
(which returns meta), `onBlockPlacedBy`, `onBlockAdded`, `breakBlock`, `onBlockActivated`,
`onBlockClicked`, `onNeighborBlockChange`, `updateTick`, `randomDisplayTick`, `tickRate`,
`getTickRandomly`, `idDropped`, `quantityDropped`, `damageDropped`, `dropBlockAsItem`,
`onEntityCollidedWithBlock`, `velocityToAddToEntity`, `isLadder`, `getSubBlocks`,
`getCreativeTabToDisplayOn`, `getLocalizedName`, and so on. Behaviour receives a `World`. Rendering
code only sees `IBlockAccess`.

`RenderBlocks` (worker-safe) draws render types 0 (standard, with flat, smooth and partial-bounds
smooth lighting), 1 (crossed squares), 2 (torch), 4 (fluids), 13 (cactus) and 31 (logs) itself;
every other type of 1.5.2's `renderBlockByRenderType` (3, 5-12, 14-21, 23-30, 32-39) is in
`src/render/blocks/` (`RenderShapes.ts`: thin and flat shapes; `RenderStructures.ts`: box-built
shapes; dispatch table in `RenderTypes.ts`), and unknown types or chests (22) draw nothing. Every
standard face goes through one quad builder, `renderFace(side, …)`, driven by the `FACES` table
(geometry, UV layout per `uvRotate*` value, `flipTexture`, smooth-light sample order).
`renderBlockAsItem` / `renderItemIn3d` (`RenderBlockItem.ts`) follow 1.5.2 per render type; chests
as items draw the chest model through `ChestItemHook`. Tile-entity models (chests, signs, skulls,
spawner mobs, moving pistons, the enchanting book, beacon beams, end portals) are registered in
`src/render/tileentity/TileEntityRenderers.ts`.

`Item` and `ItemStack` mirror the original in the same way (`itemID`, `maxStackSize`, `getIconFromDamage`,
`getIconFromDamageForRenderPass`, `requiresMultipleRenderPasses`, `getColorFromItemStack`,
`onItemUse`, `onItemRightClick`, `onPlayerStoppedUsing`, `getMaxItemUseDuration`, `getItemUseAction`,
`hitEntity`, `getDamageVsEntity`, `getSubItems`, `getCreativeTab`, `getItemDisplayName`,
`addInformation`). `CreativeTabs` holds the 12 tabs in 1.5.2 order and position, with their icon
items. Display names come from `lang/en_US.lang` through `core/I18n`.

## 8. Entities

Entities follow `Entity → EntityLiving → EntityCreature/EntityAgeable/EntityAnimal/EntityMob/…` as
in the original, with `onUpdate`, `onLivingUpdate`, `moveEntity` (swept AABB against block
collision boxes, `stepHeight`, sneak edge-guard), `moveEntityWithHeading` (friction
`slipperiness * 0.91`, gravity 0.08, drag 0.98, water and lava), `attackEntityFrom`, `knockBack`,
`hurtTime`/`deathTime`, `onDeath` drops, and `getEyeHeight`. `EntityList` binds classes to
their 1.5.2 names and IDs (`createEntityByName`, `createEntityByID`, `entityEggs`), and
`Explosion` (`World.createExplosion` / `newExplosion`) damages and pushes entities by exposure
and removes blocks with a 1/size drop chance. AI uses `EntityAITasks` with the same
priorities and mutex bits, `PathNavigate`, and `PathFinder` (A* over `PathPoint`s, as in 1.5.2).
Rendering goes through `RenderManager → Render subclass → ModelBase` (boxes built from texture
offsets and drawn with the Tessellator), with hurt and death tinting and rotation, fancy shadows
(`misc/shadow.png`), and fire overlays.

The non-mob entities of 1.5.2 are all there: `EntityItem`, `EntityXPOrb`, `EntityArrow`, the
`EntityThrowable` family (snowball, egg, ender pearl, bottle o' enchanting, splash potion),
`EntityFireball` (large, small, wither skull), `EntityFallingSand`, `EntityTNTPrimed`,
`EntityFireworkRocket`, `EntityBoat`, the `EntityMinecart` family (rideable, chest, furnace, TNT,
hopper, spawner; `EntityMinecart.createMinecart(w, x, y, z, type)`), `EntityHanging`
(`EntityPainting` with all 26 motives, `EntityItemFrame`), `EntityFishHook`, `EntityEnderEye` and
`EntityEnderCrystal`, each with its renderer. Constructors take the 1.5.2 argument lists
(`new EntityArrow(w, shooter, velocity)`, `new EntityTNTPrimed(w, x, y, z, igniter)`, ...).

There is no client/server split, so the client's half of a few server events is replayed
explicitly, as single player did:
- `World.setEntityState(e, status)` calls `e.handleHealthUpdate(status)` (Packet38): living
  entities play the hurt (2) and death (3) sound a second time at their own pitch, tamed animals
  show hearts/smoke (7/6), fireworks burst (17), TNT minecarts light (10).
- `EntityLiving.onItemPickup` runs `EntityLiving.collectEffect` (Packet22, installed by
  `src/render/entity/EntityClientHooks.ts`): a second pop/orb sound and the `EntityPickupFX`.
- `Explosion.doExplosionB(true)` plays `random.explode` twice (server and Packet60 echo).
- Sounds that both the server entity and the client's copy play from their own update code are
  played twice through `Entity.playSoundEchoed(name, volume, pitchFn)`, each with its own random
  pitch: `fireworks.launch`, an arrow sticking in a block (`random.bowhit`), items and XP orbs
  fizzing in lava. Code that only ran on one side in 1.5.2 (entity hits, fire extinguished in
  water, server-only events) plays once. New entity code follows the same rule.

Potion effects live on `EntityLiving.activePotionsMap` as `PotionEffectLike` objects
(`src/entity/PotionEffects.ts`: `PotionId`, the swirl colour, and `PotionHooks`: `effectsOf(stack)`,
`liquidColorFromDamage`, `createEffect` and `affectEntity`). Every enchantment query of entity
code goes through one table, `EnchantmentHooks` (`src/entity/EnchantmentHooks.ts`: protection,
sharpness-type damage, knockback, fire aspect, respiration, efficiency, aqua affinity, looting,
thorns, fire and blast protection, mob gear enchanting); absent entries mean "no enchantment".
`src/entity/ItemHooksInstall.ts` connects the item, enchantment and potion code at start-up
(`installEntityClientHooks` from Minecraft): it registers the entity constructors into the item
code's `ItemEntityFactories` and fills `EnchantmentHooks` / `PotionHooks`. It finds those modules
with `import.meta.glob`, so it builds before and after they exist; its `install*` functions are
typed structurally and can be called with static imports instead.
Creative players are never targeted: `Entity.isCreativeInvulnerable()` is true for a player whose
capabilities disable damage. Mob code (AI target selection, creeper swelling, skeleton and blaze
shooting, wolf anger) should test it wherever the original tests `capabilities.disableDamage`.
World-generation entities come in as `EntityDescriptor`s through `EntityList.fromDescriptor`,
which passes optional `data` to the entity's `readEntityFromNBT`; `init: false` skips
`initCreature` (structure mobs, loot carts).

The player's damage follows 1.5.2: Creative players only take void and `/kill` damage; mob damage
(`isDifficultyScaled`) is 0 / half+1 / full / x1.5 by difficulty; sword blocking halves blockable
damage; worn `ItemArmor` gives its points and wears by a quarter of the damage; every hit and
melee swing costs exhaustion through `EntityPlayer.addExhaustion` (into the player's `FoodStats`,
see §8.1); hurting the player or being hit by it sends its tame wolves
(EntityList name 'Wolf', duck-typed: isTamed/getOwnerName/isSitting/setSitting/setTarget) after
the other party; a dead player drops 7 XP per level (at most 100). Minecarts loop `minecart.base`
and, while the local player rides, `minecart.inside` through `SoundUpdaterMinecart`
(`EntityMinecart.soundUpdaterFactory`).

`EntityPlayerSP` uses the original movement: `landMovementFactor 0.1`,
`jumpMovementFactor 0.02`, sprint (double-tap forward), Creative flight (double-tap jump, vertical
speed ±0.15×3, flySpeed 0.05), sneaking at 0.3× with the edge guard, step height 0.5, eye height
1.62, and a 0.6×1.8 box. `PlayerControllerMP` (`src/client/`, extending the creative-only
`PlayerControllerCreative`): in Creative left click breaks instantly, and holding it breaks again
after a 5-tick delay, reach 5; right click places or uses with a 4-tick repeat; middle click picks
the block (and only Creative conjures it).

### 8.1 Survival

Single player ran a client and an integrated server; here both halves act on the one `World`
and the one player entity, each exactly once, keeping the server's rules (so a host can later run
them for remote players) and the client's view:
- **Mining** (`PlayerControllerMP`): `Block.getPlayerRelativeBlockHardness` (float maths: hardness,
  `ItemTool.getStrVsBlock`, `canHarvestBlock` /30 vs /100, haste/fatigue, ×0.2 under water or in
  the air) accumulates per tick; at 1 the block breaks (`onBlockHarvested`, held-tool wear,
  `Block.harvestBlock` drops when the player can harvest), then 5 ticks pass. Reach 4.5. The crack
  overlay is `RenderGlobal.blockDamage` (`src/render/BlockDamageOverlay.ts`, destroy_0..9 over the
  block via `RenderBlocks.renderBlockUsingTexture`); dig sounds are `BlockMiningSounds`.
- **Player** (`EntityPlayer`): `FoodStats` (`src/entity/FoodStats.ts`: 20 food, saturation,
  exhaustion, regeneration at 18+, starvation by difficulty), exhaustion from moving (per-tick
  distance), leaving the ground (0.2, the integrated server's rule, also for sprint jumps),
  attacking, being hurt and harvesting; 60 ticks of spawn protection; `CombatTracker` death
  messages; sprinting needs food > 6. Damage, air, fall, fire, armour and knockback are
  `EntityLiving`'s. The client's quirks are kept: the local player's `attackedAtYaw` stays 0 and
  the HUD's `prevHealth` is 0.
- **Death and respawn**: `EntityPlayer.onDeath` drops everything (unless keepInventory);
  `Minecraft.respawnPlayer` → `PlayerSpawning.respawn` (`src/entity/PlayerSpawning.ts`):
  `clonePlayer`, the same game mode, the bed or forced spawn via `verifyRespawnCoordinates`
  ("tile.bed.notValid" otherwise). Hardcore's Delete world ends on the 1.5.2 kick screen.
- **Modes**: `EnumGameType` (`src/world/EnumGameType.ts`), `EntityPlayer.setGameType` (used by
  `/gamemode`) → `EntityPlayer.gameTypeListener` → `PlayerControllerMP.setGameType`. The world's
  difficulty is the options' (`GameSettings` listener `onSettingsSaved`), Hard in Hardcore.
  Leaving a world saves the player into level.dat (`EntityPlayer.writeToNBT`, §5.7).

## 9. GUI

`ScaledResolution` uses the original algorithm: grow the scale while
`w/(s+1) >= 320 && h/(s+1) >= 240`, capped by `guiScale` (0 = auto). Every screen renders through
the GL facade in GUI space (`ortho(0, w, h, 0, 1000, 3000)` with a translate of −2000), so 3D item
icons work naturally. `FontRenderer` measures glyph widths from the *vanilla* `font/default.png`, as
the original did (it read the font image from the jar), and draws with the selected pack's image. It
supports shadows (offset 1, colour ×0.25), `§` colour and format codes, and unicode fallback
through `font/glyph_XX.png` and `glyph_sizes.bin`. Screens: main menu (rotating panorama, logo,
random splash, version string), select world (saved worlds, §5.7, with Import/Export in the
header), create world (with "More World
Options": seed, structures, world type Default, Superflat, or Large Biomes, cheats, bonus chest),
options, video settings, controls (scrolling, with the sprint, zoom and hotbar keys, Sprint
Hold/Toggle and Reset Keys), sounds, language (English), texture packs (Default, bundled Faithful,
imported packs: "Open texture pack folder" picks .zip files, dropping them on the page works too,
imported rows have a delete button), pause menu (with the achievement map and the Statistics screen; the achievement toast is drawn over every frame), loading screens, chat with commands, the creative inventory (12 tabs, search,
scroll, survival-inventory tab with the destroy slot), the HUD (hotbar, crosshair, selected item
name fade, chat lines, "Now playing"), the death screen, and the F3 debug screen with the original
text lines. Added for this port: the boot splash (one of two pictures from `public/splash/`,
stretched over the window, `src/client/BootSplash.ts`, in place of the Mojang logo), the Account
Manager (title screen under Multiplayer, and Options; name, skin preview and upload,
`src/gui/GuiAccountManager.ts`) and the Room Code screen (Multiplayer, beside Direct Connect).

Shared widgets: `GuiButton`, `GuiTextField` (selection, Ctrl+A/C/X/V), `GuiSlot` (scrolling
lists). Container windows extend `GuiContainer`, which draws the slots, the cursor stack and
tooltips and implements every 1.5.2 click (shift-click, number keys, middle-click clone, Q,
drag-spreading, double-click collect) through `PlayerControllerCreative.windowClick` and
`Container.slotClick`. The inventory key opens `GuiInventory`, which becomes `GuiContainerCreative` in Creative. Chat goes `GuiChat` → `EntityPlayerSP.sendChatMessage` →
`command/CommandServer.handleChat`, which runs `/commands` through `ServerCommandManager` and
prints everything else as `<Player> text` in `GuiNewChat`.

## 10. Audio

`SoundManager` (`src/audio/`) uses Web Audio and follows 1.5.2 `SoundManager` on paulscode.
Sounds are addressed like the original through `SoundPool`s: "step.grass" picks a random
`sound3/step/grass[1-4].ogg` (trailing digits stripped, slashes become dots), "random.click",
"mob.zombie.say"; records keep their digits ("13", "11"). `playSound(name, x, y, z, volume,
pitch)` fades linearly to silence at `16 * max(1, volume)` blocks (a `PannerNode` with the
linear model), clamps the volume to 1 (times the Sound slider) and the pitch to 0.5-2, and
uses one of 28 channels (a source louder than 1 is a priority source that is never stolen; the
oldest other one is). World sounds (`World.playSoundEffect` / `playSoundAtEntity`) arrive like
`Packet62LevelSound`: position in 1/8 blocks, pitch in 1/63 steps, only within range of the
viewer. The listener follows the player's eyes every frame. `playSoundFX` is for the GUI
(quarter volume, not positional). Music plays a random `music/` or `newmusic/` track while in a
world after a random delay of 0-12000 ticks, then waits 12000-24000 ticks between tracks (there
is no menu music in 1.5.2). Jukebox records (`World.playRecord` -> `playStreaming`) play from
`streaming/` at the jukebox (64-block range, half the sound volume) and stop the music; besides
`13.ogg` and `cat.ogg` the records only exist as obfuscated `.mus` files, which the asset script
fetches and `MusCodec` decodes. Changing either slider applies the music volume to the music and
the record (an original quirk); music off stops both. Music and records stream through media
elements; sounds are decoded on demand into an LRU cache, and the step/dig/random/liquid/damage
folders are preloaded. The audio context starts on the first user gesture. Missing or broken
files are skipped. Looping entity sounds (`playEntitySound`, keyed by entity id) are the only
sounds the pause menu pauses and `stopAllSounds` (world change) stops; `closeMinecraft` stops
everything. `sndManager.debugLog` / `getDebugInfo()` expose what was requested and started.
Survival mining (PlayerControllerMP) plays the block's step sound every fourth damage tick at
`(volume + 1) / 8`, pitch `* 0.5`: use `BlockMiningSounds` (`src/audio/BlockSounds.ts`) —
`onDamageTick(mc.sndManager, block.stepSound, x, y, z)` each tick, `reset()` on a new block or
break — next to `effectRenderer.addBlockHitEffects`.

## 11. Input

`KeyboardEvent.code` maps to LWJGL key codes, so `KeyBinding` defaults and the Controls screen
match 1.5.2 (forward W=17, left A=30, back S=31, right D=32, jump SPACE=57, sneak LSHIFT=42, drop
Q=16, inventory E=18, chat T=20, playerlist TAB=15, command /=53, attack −100, use −99, pick −98).
Additions to 1.5.2's bindings (all rebindable and saved like the others): **Sprint** (I; sprints
under the double-tap-forward conditions, without needing the ground; the Controls screen's
"Sprint: Hold/Toggle" option, `toggleSprint` in the options, decides whether it is held or
toggled, and a toggled sprint starts again whenever it can), **Zoom** (C; OptiFine's zoom: while
held with no screen open the world and hand FOV are a quarter and the smooth camera is on,
restored on release, `client/Zoom.ts`) and **Hotbar Slot 1-9** (1-9; used for the HUD selection and
the container hover-swap). Options saved before they existed load with their defaults.
Mouse look uses Pointer Lock and the original sensitivity curve (`f = s*0.6+0.2; d = f*f*f*8;
yaw += dx*d*0.15`, with invert-mouse support). Losing pointer lock opens the pause menu. F1, F2
(saves a PNG download), F3, F3+H, F3+A, F5, F8 (smooth camera), and F11 work. Browser defaults
for F5, F3, F11, Tab, Space, and `/` are suppressed while the game has focus.

## 12. Testing and dev hooks

See `docs/TESTING.md` for details.

- `?dev=1` exposes `window.mc`, the `Minecraft` instance, with automation helpers on `mc.dev`
  (`src/client/DevTools.ts`).
- `?autostart=1&seed=<s>&type=<default|flat|largeBiomes>` skips the menus straight into a new
  world; `?hotbar=1`, `?time=<t>`, `?pos=x,y,z[,yaw,pitch]` and `?fly=1` set up the scene.
- `scripts/shot.mjs` drives headless Chromium (`/opt/pw-browsers`, SwiftShader WebGL) against
  `vite preview` or `vite dev`. It runs JSON scenarios (`scripts/scenarios/`: load, wait for a
  condition, evaluate JS, run ticks, press keys, capture) and writes PNGs, which can be compared
  with reference screenshots of the original game.
- `npm run typecheck` and `npm run build` must stay green on every commit.
- Multiplayer: `tests/netprotocol.test.ts`, `tests/nettransport.test.ts` and
  `tests/netsession.test.ts` (Node, in-memory transport) and `scripts/mp-test.mjs` (two browser
  contexts over WebRTC and a local relay); `mc.dev.net` hosts, joins and reports the session;
  `?dev=1&relay=`, `?signal=` and `?net=memory` choose the transport.
  `scripts/patch-trystero.mjs` (postinstall, dev, build) limits what trystero buffers per peer.

## 13. Extension points

Where later subsystems plug in. Registries that workers also need are imported by
`src/block/Blocks.ts` (the mesher and world-generation workers import it); main-thread-only
registries are imported once by `src/client/Minecraft.ts`.

| Area | How to extend |
|---|---|
| Blocks | Subclass `Block` (`src/block/`), construct it in `src/block/Blocks.ts`, add icons in `registerIcons`. Behaviour hooks: `updateTick`, `randomDisplayTick`, `onBlockActivated`, `onNeighborBlockChange`, `onBlockDestroyedByExplosion`, `canDropFromExplosion`, `isUpdateTickImmediate`, `fillWithRain`, `initializeBlock` (run for every block by `finishBlockRegistry`; the fire's burn tables). Schedule ticks with `World.scheduleBlockUpdate`. Features that blocks grow at run time (sapling trees, huge mushrooms) are created by 1.5.2 class name through `WorldGenRegistry.create('WorldGenTaiga2', true)` (`src/world/WorldGenRegistry.ts`), which `src/world/BlockDynamicsInstall.ts` (imported by Minecraft.ts) fills from `src/world/gen/**/WorldGen*.ts` with `import.meta.glob`. `Entity.setInPortal()` marks an entity in a nether portal; `Entity.travelToDimension(dim)` moves it (§5.8). |
| Block rendering | Add a `case` to `RenderBlocks.renderBlockByRenderType` or call `RenderBlocks.renderers.set(type, (rb, block, x, y, z) => …)` from a module that `Blocks.ts` imports. Build faces with `setRenderBounds` / `overrideBlockBounds` + `renderStandardBlock` or `renderFace(side, x, y, z, icon)`, `uvRotate*` and `flipTexture`. Every 1.5.2 render type is mapped in `RENDER_TYPES` (`src/render/blocks/RenderTypes.ts`: thin and flat shapes in `RenderShapes.ts`, box-built shapes in `RenderStructures.ts`; types 0, 1, 2, 4, 13 and 31 stay in `RenderBlocks.ts`). Items in 3D: `RenderBlocks.renderItemIn3d` and `renderBlockAsItem` (`src/render/blocks/RenderBlockItem.ts`; chest items through `ChestItemHook.render`). `RenderBlocks.anaglyphEnable` / `aoLevel` follow the settings on the main thread; the mesher gets them through `MesherSettings`. |
| Tile entities | Subclass `TileEntity` (`src/world/tileentity/`), `TileEntity.addMapping(cls, '<1.5.2 id>')` in `TileEntities.ts`, and a `BlockContainer` whose `createNewTileEntity` returns it. Special renderers: `TileEntityRenderer.instance.register(cls, renderer)` in `src/render/tileentity/TileEntityRenderers.ts` (registered: sign, mob spawner, piston, chest, ender chest, enchanting table, end portal, beacon, skull; models in `TileEntityModels.ts`, `ModelBook` shared with `GuiEnchantment`). Worn skulls draw through `RenderBiped.skullRenderer`; the spawner cage's mob through `TileEntityMobSpawnerRenderer.renderSpawnerMob(logic, …)` (`MobSpawnerBaseLogic.getEntityForRenderer`, any EntityList mob). World generation can place them through `IWorld.setBlockTileEntity`; they travel to the client as NBT. |
| Items | Subclass `Item` in `src/item/`, register in `Items.ts` (one line per item in 1.5.2 order; block items come from `registerBlockItems()`, the tail of Block's static block, which skips blocks that do not exist yet). Hooks: `onItemUse`, `onItemRightClick`, `onEaten` (finished by `EntityPlayer.onItemUseFinish`), `itemInteractionForEntity` (via `ItemStack.interactWith`), `getArmorInfo` / `getArmorColor` (armour), `getRecordName` / `getRecordTitle` (records), `getContainerItem`, `onCreated`, `doesContainerItemLeaveCraftingGrid`, `getEnchantKind` (what enchantments fit). Entities items create are built by calling the class bound in EntityList with the 1.5.2 constructor arguments (`new EntityPotion(world, thrower, stack)`, `new EntityPainting(world, x, y, z, dir)`, `new EntityArrow(world, shooter, velocity)`...; thrown eggs and fishing hooks through `EntityList.getClassForDebug('Egg' / 'FishHook')`), so entity classes must implement those overloads; `ItemEntityFactories` (`src/item/ItemEntitySpawning.ts`) can override one kind with an exact factory. `src/item/ItemBindings.ts` (imported by main.ts) links modules of other areas: eyes of ender use the asynchronous `StructureLocator.findClosestStructure` (`StructureSearch.locate`; `ChunkProviderClient` installs the worker-backed provider), and `src/entity/ItemHooksInstall.ts` fills the entity code's `PotionHooks`. Item frames should call `stack.setItemFrame(frame)` on the displayed copy so maps show the frame marker. Bone meal calls the block's `markOrGrowMarked` / `fertilizeMushroom` / `fertilizeStem` / `fertilize`; dye/saddle call `getSheared`/`setFleeceColor` / `getSaddled`/`setSaddled`. Held-item icons per pass: `getItemIconForEntity` (`src/item/ItemIcons.ts`). Creative lists: `CreativeTabs.displayAllReleventItems` (adds the tab's enchanted books), `getAllCreativeItems()` for the search tab. `Item.itemRand` is the shared item RNG. |
| Crafting | All 229 recipes of 1.5.2 are registered by `src/item/crafting/Recipes.ts` the first time `CraftingManager.getInstance()` is used; more with `addRecipe(output, ['##', '##'], { '#': Block })`, `addShapelessRecipe(output, ...ingredients)`, `addRecipeObject(recipe)` (`IRecipe` over any `CraftingGrid`). The list sorts itself like `RecipeSorter`. Smelting: `FurnaceRecipes.smelting().getSmeltingResult(id)` / `getExperience(resultId)`; fuel: `getItemBurnTime(stack)` (`src/item/crafting/FurnaceRecipes.ts`). |
| Potions and enchantments | `src/potion/` (`Potion.potionTypes`, `PotionEffect`, `PotionHelper` damage-value -> effects / colour / names and `applyIngredient`); entities receive effects through `applyPotionEffect(entity, effect)` / `clearPotionEffects(entity)`, which call `addPotionEffect` / `clearActivePotions` once EntityLiving has them. `PotionBindings` installs `PotionHooks.effectsFromDamage / liquidColorFromDamage / createEffect / affectEntity` for splash potions and particle colours. `ItemStack.damageItem` rolls Unbreaking per point (`attemptDamageItem`). `src/enchantment/` (`Enchantment.enchantmentsList`, `EnchantmentHelper` levels, modifiers and random enchanting; stacks carry `ench` / `StoredEnchantments` lists of `{id, lvl}`). |
| Containers and GUIs | `IInventory` (or `InventoryBasic`), a `Container` subclass (`addSlotToContainer`, `transferStackInSlot`, `canInteractWith`, `canMergeSlot`), a `GuiContainer` subclass (`drawGuiContainerBackgroundLayer`, `drawGuiContainerForegroundLayer`). Open it from `EntityPlayerSP.displayGUI*` (hooks declared on `EntityPlayer`: chest, hopper, enchantment, anvil, workbench, furnace, dispenser, sign, brewing stand, beacon, merchant, book). `GuiInventory` swaps itself for `GuiContainerCreative` in Creative (`initGui`/`updateScreen`, keyed on `playerController.isInCreativeMode()`); creative edits of the player's window go through `playerController.sendSlotPacket(stack, slot)` (slots 1-44, Creative only, like `handleCreativeSetSlot`). Every container screen of 1.5.2 exists in `src/gui/inventory/` and opens from the `EntityPlayerSP.displayGUI*` overrides (the `BlockGuiHooks` fallback); `addPlayerSlots` lays out the shared player rows; `InventoryEffectRenderer` lists potion effects beside survival/creative windows (reads `getActivePotionEffects()` when the living entity provides it). Potion rules for the brewing stand (`TileEntityBrewingStand.brewingRules`) and beacon effects (`TileEntityBeacon.applyEffect`) are installed by `src/gui/inventory/ContainerBindings.ts` (imported from `main.ts`). Pick block: `src/client/PickBlock.ts` (blocks, and entities in Creative). Held maps: `ItemRenderer.mapItemRenderer` (`src/render/MapItemRenderer.ts`). Armour slot backgrounds: `SlotArmor.emptySlotIcons`. Lists: subclass `GuiSlot`. |
| Entities | Class in `src/entity/`, `EntityList.addMapping(cls, '<name>', id)` in `src/entity/Entities.ts` (eggs come from the `entityEggs` table), renderer via `RenderManager.instance.register(cls, render)` in `src/render/entity/EntityRenderers.ts` (renderers needing item-atlas sprites override `Render.updateItemIcons`). Client echoes: `World.setEntityState` → `handleHealthUpdate`, `EntityLiving.collectEffect`. Hooks for other code: `EnchantmentHooks`, `PotionHooks`, `EntityPlayer.addExhaustion` / `getFoodStats`, `EntityMinecart.soundUpdaterFactory`, `EntityItemFrame.getItemFrame(stack)`, `EntityFireworkRocket.explosionEffect` (or `World.makeFireworks`), `HopperTransfer.chestInventory`; `BlockSand.createFallingEntity` is installed by `EntityFallingSand`. Mob bases: `EntityCreature`, `EntityAgeable`, `EntityAnimal`, `EntityMob`, `EntityTameable`, `EntityGolem`, `EntityWaterMob`, `EntityAmbientCreature`, `EntityFlying`; AI tasks extend `EntityAIBase` (`src/entity/ai/`, one copy of each 1.5.2 task shared by hostile and passive mobs; a task's Java class argument is `'player'` or a predicate, e.g. `EntityAINearestAttackableTarget(owner, 'player' | pred, range, chance, sight, nearbyOnly?, selector?)`, `EntityAIAttackOnCollide(owner, [pred,] speed, longMemory)` or `.forClass`, `EntityAIArrowAttack(host, speed, interval, range)` or `(…, minInterval, maxInterval, range)`; `EntityAITarget.isSuitableTarget` skips Creative players through `isCreativeInvulnerable()` except for revenge and calls `canAttackClass('Player' | EntityList name)`). Mob classes register in `src/entity/HostileMobs.ts` / `PassiveMobs.ts` (imported by `Entities.ts`), renderers in `HostileMobRenderers.ts` / `PassiveMobRenderers.ts` (imported by `EntityRenderers.ts`). Monsters mark themselves with `Entity.isIMob` (`IMob.mobSelector` for golems). Held items: `renderHeldItem(r, e, held, model, inUse, full3DOffset?, tintPasses?)` in `RenderBiped.ts` (players tint passes, biped mobs do not; skeletons pass their func_82422_c offset). Villages: `World.villageCollectionObj` (`findNearestVillage`, `addVillagerPosition`) and `World.villageSiegeObj`, ticked by `World.tick`. Trading: `EntityPlayer.displayGUIMerchant` opens `GuiMerchant` (`src/gui/merchant/`, installed on `EntityPlayerSP` by `MerchantGui.ts`). Factories for classes `World` cannot import: `World.itemDropFactory` (set by `EntityItem`), `EntityLiving.experienceOrbFactory`, `World.lightningBoltFactory`. |
| Spawning | Biome lists by `EntityList` name (`BiomeGenBase.getSpawnableList`, `editSpawns`), `SpawnRules` for the per-mob `getCanSpawnHere` data, `World.mobSpawner` (default `SpawnerAnimals.findChunksForSpawning`), world-generation animals in `WorldGenSpawning`. |
| Particles | Every 1.5.2 name is registered in `src/render/particle/ParticleRegistry.ts`; add more with `RenderGlobal.particleFactories.set(name, (w, x, y, z, vx, vy, vz) => fx)` (culled beyond 16 blocks and by the particle setting), `unculledParticleFactories` (always created) or `particlePrefixFactories` (name families such as `iconcrack_`/`tilecrack_`) from `ParticleFactories.ts`. `EffectRenderer.addEffect(fx)` for direct effects (`EffectRenderer.instance`), `addBlockDestroyEffects` / `addBlockHitEffects` for blocks, `EntityRainFX` (or the factory `RenderGlobal.particleFactories.get('rain')`, an internal name for EntityRenderer.addRainParticles, not a vanilla spawnParticle name) for rain splashes, and `World.makeFireworks(x, y, z, vx, vy, vz, fireworksTag)` (func_92088_a) for a firework rocket's explosion. |
| Sounds and world effects | `World.playSoundEffect` / `playSound` / `playSoundAtEntity`, `World.playAuxSFX(type, …)` (cases in `RenderGlobal.playAuxSFX`), `World.playRecord`, `World.broadcastSound`, `SoundManager.playEntitySound` for loops. |
| Weather | `World.updateWeather` (the server's rain and thunder cycles, `isRaining()` for gameplay), `World.clientWeather` (`WeatherCycle`: what is rendered; `WeatherCycle.setWeather(world, 'clear' \| 'rain' \| 'thunder', seconds?)` and `WeatherCycle.toggleDownfall(world)` back `/weather` and `/toggledownfall`), `World.weatherEffects` + `addWeatherEffect` (rendered before entities), `World.lightningBoltFactory` (set in `src/render/sky/SkyRegistry.ts`) for the strike in `tickBlocksAndAmbiance`. Rain splashes use the `rain` and `smoke` particle factories directly (like `new EntityRainFX`), the sound `ambient.weather.rain`; bolts play `ambient.weather.thunder` and `random.explode`. Sky, fog, clouds and the lightmap read `clientWeather.getRainStrength` / `getWeightedThunderStrength`. |
| Explosions | `World.createExplosion` / `newExplosion`; entities can veto blocks with `getBlockExplosionResistance` / `canExplosionDestroyBlock`. |
| Commands | Subclass `CommandBase` (`src/command/`), register it in the `ServerCommandManager` constructor or with `ServerCommandManager.addCommand(() => new CommandX())` before a world starts. `getServer()` gives the worlds, players and `sendChatMsg`; results go through `CommandBase.notifyAdmins`; target selectors through `CommandBase.getPlayer` / `PlayerSelector`. Command blocks: `TileEntityCommandBlock.executor` is installed by `installCommandBlockExecutor` (`src/command/CommandBlockExecutor.ts`, from `ServerCommandManager`); `isCommandBlock(sender)` tells command-block senders apart (`/testfor`, `commandBlockOutput`); `EntityPlayerSP.displayGUIEditSign` opens `GuiCommandBlock` for them. |
| Chat | `EntityPlayer.addChatMessage(langKey)`, `sendChatToPlayer(text)`, `Minecraft.ingameGUI.getChatGUI().printChatMessage(text)`. |
| World generation | `ChunkGenerator` implementations in `src/world/gen/` (chosen by `WorldGenServer`), `BiomeSource` (`WorldChunkManager` over the GenLayer stack, `SingleBiomeSource` for Superflat), `WorldGenerator` features from `ChunkProviderGenerate.populate` / `BiomeDecoration`, structures as `MapGenStructure` + `StructureStart` + `StructureComponent` pieces in `src/world/gen/structure/`, chest/dispenser/spawner contents through `ChestLoot` (`putTileEntityTag`), entities through `spawnGenEntity`. Superflat presets: `FlatGeneratorInfo`, `FLAT_PRESETS` (`src/gui/FlatPresets.ts`, built from `FlatGeneratorInfo` in Java HashMap order). Raw terrain can come from the nested `terrain.worker.ts` (`ChunkGenerator.provideTerrain` / `recordStructures`, `TerrainChunk`); `WorldGenServer` owns the spawn search and the stepwise 25x25 spawn area. World options: `WorldSettings.generatorOptions` / `bonusChest` (kept on `WorldInfo` so a resumed world's worker regenerates the same spawn chunks), passed to `new ChunkProviderClient(world, seed, type, features, { generatorOptions, bonusChest })`. Generated entities arrive as descriptors through `EntityList.fromDescriptor`, tile entities as NBT through `TileEntity.createAndLoadEntity`. Stronghold queries: `StructureLocator.findClosestStructure`. Code here must stay worker-safe (`IWorld`, no DOM or GL). |
| Players | Sleeping: `EntityPlayer.sleepInBedAt` (the 1.5.2 refusals, `lieDownInBed` for a client copy), `wakeUpPlayer(immediately, updateWorld, setSpawn)`, `getSleepTimer` / `isPlayerFullyAsleep`, the bed spawn (`getBedLocation`, `setSpawnChunk`, `EntityPlayer.verifyRespawnCoordinates`, applied on respawn by `PlayerSpawning.respawn`, after `loadChunksAroundBed` in `src/client/BedRespawn.ts` puts kept chunks back); `World.updateAllPlayersSleepingFlag` skips the night once every player slept 100 ticks. Remote players: `EntityOtherPlayerMP` (network interpolation via `setPositionAndRotation2`, item use from the eating flag, `setCurrentItemOrArmor` for equipment). Container screens that list the active effects extend `InventoryEffectRenderer` (`src/gui/inventory/`; `GuiInventory` and `GuiContainerCreative` do, as in 1.5.2; effects listed in Java HashMap order by `hashMapOrder`). FOV: `EntityPlayerSP.getFOVMultiplier` (flying, speed potions and sprint, bow draw), eased by `EntityRenderer`; `settleFovModifier` for captures. Beacons apply effects through `TileEntityBeacon.applyEffect` (installed in `ItemBindings.ts`). |
| Dimensions | Generators: `DimensionGenerators.register(dim, (o) => generator)` (`src/world/gen/DimensionGenerators.ts`, worker-safe; call it from a module the worker imports) or, without a registration, the classes found by file name: `src/world/gen/nether/ChunkProviderHell.ts` exporting `ChunkProviderHell` and `src/world/gen/end/ChunkProviderEnd.ts` exporting `ChunkProviderEnd`, built as `new Cls(seed, { seed, worldType, mapFeatures, generatorOptions })` (any `ChunkGenerator`; until they exist placeholder generators stand in). The worker's `GenWorld.provider` and lighting follow the dimension (`providerInfoFor`: no sky light where `hasNoSky`). Rules by dimension: `world.provider` (`dimensionId`, `isHellWorld`, `hasNoSky`, `isSurfaceWorld()`, `canRespawnHere()`, `getEntrancePortalLocation()`, `doesXZShowFog`). Worlds: `mc.dimensions` (`getWorld(dim)`, `load(dim)`, `worlds()`, `teleporter(dim)`, `arrivalPoint`, `transferEntity`); travel: `entity.travelToDimension(dim)` (end portals call it with 1; from the End with 1 it is the exit portal), `mc.travel` (the client player's trips, `showWinScreen`), `PlayerTravel.winGameScreen = () => new GuiWinGame()` (else `src/gui/GuiWinGame.ts` exporting `GuiWinGame` is used; closing it respawns), `mc.respawnPlayer(keepEverything)`. `BlockEndPortal.bossDefeated` lets end portals stay outside the overworld. Compass and clock needles: `src/render/texture/TextureCompassClock.ts` (they spin outside surface worlds). Dev hooks: `mc.dev.dims`. |
| Saving | Saved entity classes override `writeEntityToNBT` / `readEntityFromNBT` (call `super`, use the typed `NBT.set*` helpers with the 1.5.2 key types, `src/world/storage/NBT.ts`); tile entities `writeToNBT` / `readFromNBT`. Non-entity world data that must persist registers a file in `worldDataFiles` (`src/world/storage/WorldData.ts`: `'data/<name>.dat' → { load(world, bytes), save(world) → bytes | null }`, gzip NBT `{data: {...}}` like WorldSavedData): it is read when the world opens and written with level.dat when `save` returns bytes; export and import carry `players/` and `data/` along. The open world's save: `mc.saveController.handler` (`saveAll`, `saveLevel`), the list: `SaveFormat.instance` (`listeners` for changes). |
| Statistics and achievements | Count with `player.addStat(id, amount)` / `player.triggerAchievement(id)` using the 1.5.2 ids in `src/stats/StatIds.ts` (`StatIds.jump`, `StatIds.mineBlock(id)`, `craftItem`, `useItem`, `breakItem`, `AchievementIds.*`; no imports, so block and item code the workers load may use it). `EntityPlayer.addStat` is a no-op; `EntityPlayerSP` sends to `ClientStats` (`src/stats/ClientStats.ts`: the stat file, the parent rule, the toast), `EntityClientPlayerMP` keeps only independent statistics and takes the host's through Packet200 (`incrementStat`), `EntityPlayerMP` sends its non-independent ones to its guest. `StatList` (`resolve(id)`: per-block / per-item ids through their tables, so grass counts as dirt), `AchievementList` (positions, icons, parents), `StatFileWriter` (per lower-cased username in `localStorage`, saved every few seconds after a change, on leaving a world and when the page hides; follows `mc.username`). Screens: `GuiAchievements`, `GuiStats`, the toast `GuiAchievement` (drawn by a frame listener that `installStats` adds). Client-side counters (worlds, games, joins, quits) go through `ClientStats.readStat`. |
| Dev hooks | `src/client/DevTools.ts` (`?dev=1` → `window.mc.dev`), scenarios in `scripts/scenarios/`. |
| Accounts and skins | The name is `Minecraft.username` (`src/net/Username.ts` stores it). Skins: `PlayerSkins` (`src/client/skin/PlayerSkins.ts`; `local` for the player the user controls, `setRemote(name, rgba)` for others, `skinFor(player)`); 64x32 RGBA processed by `processSkin` (`SkinImage.ts`); textures and binding in `src/render/entity/SkinTextures.ts` (`bindPlayerSkin(engine, player)` wherever a player model is drawn; RenderPlayer and ItemRenderer use it). Over the network: `MC\|Skin` (`src/net/SkinSync.ts`, host relay `src/net/server/SkinRelay.ts`). |
| Server connections | `registerServerConnector(scheme, { connect, ping? })` (`src/net/connect/ServerConnector.ts`): Direct Connect, Add Server and the list's ping use the connector of the address's scheme (`tcp` for a plain `host[:port]`, parsed by `ServerAddress.ts` like 1.5.2); the connection it returns carries `Packets.ts` frames into the usual guest login. See `docs/MULTIPLAYER.md`. |
| Key bindings and options | A new `KeyBinding(desc, code)` in `GameSettings`, appended to `keyBindings`, is saved (`key_<desc>`), listed by the scrolling `GuiControls`, flagged red on clashes and covered by Reset Keys (`keyCodeDefault`); read it with `isPressed()` / `pressed` in the tick or `GameSettings.isKeyDown`. English names for keys 1.5.2's lang lacks: `client/ControlsText.ts` (`translateOr`). Hotbar keys: `gameSettings.keyBindsHotbar[i]`; the sprint key reaches the player as `MovementInput.sprint`; the zoom state is `EntityRenderer.zoom.active`. |
| Texture packs | `ResourceManager.packs` (bundled, then imported), `selectedPack`, `selectPack(id)` (async: an imported pack's files load from IndexedDB first; `onPackChanged` listeners then reload), `addUserPack(ImportedPack)`, `removeUserPack(id)`; `readTexturePack(name, zipBytes, modernMap)` (`assets/PackImport.ts`, worker-safe) checks and converts a .zip, `importTexturePackFile/Bytes` (`assets/PackFiles.ts`) do both. Regenerate the 1.6+ name table with `node scripts/gen-pack-map.mjs`. |
| Background work and budgets | `IdleTasks.add(name, (deadline) => moreToDo)` (`src/client/IdleTasks.ts`) runs work in slices after each frame (and each background tick of a hidden LAN game) until the frame's budget is used, round robin; `IdleTasks.flush()` finishes everything (leaving a world). This is the hook for incremental saving: serialize a few dirty chunks per slice instead of stalling a frame. `FrameBudget.ms(base)` (`src/client/FrameBudget.ts`) is the per-frame milliseconds for one kind of background work: the base on a CPU-bound frame, more when the main thread waits for the GPU, a share of the frame while a loading screen hides the world. Performance tools: `mc.dev.perf` (`src/client/PerfDevTools.ts`), `scripts/perf/`, `docs/PERFORMANCE.md`. |
| Multiplayer | New packets: add a schema to `PACKETS` (`src/net/protocol/Packets.ts`; give it a direction for `allowedFrom` and keep fields bounded), handle it in `NetServerHandler.handle` (validate everything a guest sends) or `NetClientHandler`. World events reach guests through `World.netEvents` (`WorldNetListener`: block and tile entity changes, animations, statuses, pick-ups, explosions, block events, lightning, beds, player sounds) and the `IWorldAccess` the `LanServer` adds (sounds, particles, aux effects, crack progress); wrap client-only effects in `World.localEffectsOnly`. New entity classes: tracking range/interval, spawn data and networked metadata slots in `src/net/EntityNetData.ts` (`trackingParams`, `spawnData` / `createFromSpawn`, the metadata tables), guest-side animation state in `src/net/client/RemoteEntityVisuals.ts`. Rules that only the authoritative side may run check `world.isRemote` (blocks, tile entities, entities) or `EntityPlayer.isClientSide()` (players; true for guests and for `EntityOtherPlayerMP`). Windows: `Container.crafters` (`ICrafting`: `EntityPlayerMP` mirrors slots and progress bars); new window kinds get an id in `src/net/WindowTypes.ts` and a case in `EntityPlayerMP.displayGUI*` / `NetClientHandler`'s OpenWindow. Controllers: `mc.playerController` is a `PlayerControllerGuest` on guests; screens that change server state call `sendEnchantPacket`, `sendSlotPacket`, `sendPacketDropItem` or `mc.netHandler.addToSendQueue` (anvil names, beacon, signs). Item tags cross the network only through the whitelist in `src/net/protocol/ItemTags.ts`: a new tag key an item reads must be added there (with its type and limits) or guests lose it; stacks a creative guest may create are decided by `src/net/server/CreativeItems.ts`. A new guest action that changes the world needs its own `ActionLimit` in `NetServerHandler` and must be ignored for dead players (`DEAD_IGNORES`). Host-only commands go in `HOST_ONLY_COMMANDS` (`EntityPlayerMP`) and reach the LAN game through `CommandServer.lan()`. |
| Block interaction hooks | `BlockGuiHooks.register(kind, handler)` (`src/block/BlockGuiHooks.ts`; chest, enderChest, workbench, furnace, dispenser, dropper, hopper, brewingStand, enchantment, anvil, beacon, sign, commandBlock; without a handler the player's `displayGUI*` runs). Survival breaking (`PlayerControllerMP`) calls `Block.harvestBlock` (drops, stats, exhaustion) after removing the block; `HarvestModifiers.silkTouch` / `fortune` are wired to `EnchantmentHelper`. Block events: `World.addBlockEvent` → `Block.onBlockEventReceived`. Mob spawners: `MobSpawnerBaseLogic.spawnHook`. |
| HUD and GUI hooks | `GuiIngame` draws the survival bars when `PlayerControllerMP.shouldDrawHUD()` (Survival and Adventure), `GuiIngame.playerListProvider` (TAB list), `GuiIngame.scoreboardOverlay`, `GuiIngame.setRecordPlayingMessage`, `BossStatus.setBossStatus(boss, colorModifier)` for boss renderers (with `SkyHooks.hasColorModifier`), `EntityPlayer.gameTypeListener` (the controller) and `CommandGameMode.gameTypeListener` for game-mode changes, `mc.playerController.getCurrentGameType()` / `isInCreativeMode()` for mode checks, `EntityPlayer.getFoodStats()` / `canEat()` / `addExhaustion()`, `Minecraft.mcProfiler` sections (Shift+F3 chart), `getScoreboard(world)` (deaths and kills are counted by `EntityPlayer.onDeath` / `addToPlayerScore`). Overlays outside the HUD (pumpkin blur, portal swirl, first-person fire) live in `src/render/sky/ScreenOverlays.ts`. |
| The End and bosses | Generators by dimension id: `DimensionGenerators.register(id, (options) => ChunkGenerator)` (`src/world/gen/DimensionGenerators.ts`, worker-safe; the End registers in `src/world/gen/end/EndRegistration.ts`, which `WorldGenServer` imports; generators take `(seed, options)`; `WorldGenOptions.dimension` comes from the worker's `init.dimension`, which `ChunkProviderClient` sets to `world.provider.dimensionId`; outside dimension 0 the spawn is (0, ground, 0) like `WorldServer.createSpawnPosition` for providers that cannot respawn). Dimension 1 is `ChunkProviderEnd` (`src/world/gen/end/`: the island noise, `BiomeEndDecorator` with `WorldGenSpikes` placing `EnderCrystal` descriptors, the `EnderDragon` descriptor when chunk (0, 0) is decorated; decoration draws from the generator's own unseeded `populateRand`, World.rand's role in 1.5.2). Bosses: `EntityDragon` with `EntityDragonPart`s (not in the entity list; `Entity.getParts` puts them in entity queries next to the dragon, `getMultiPartOwner` gives the dragon; their ids follow the dragon's) and `EntityWither`; both expose `getMaxHealth` / `getBossHealth` / `getEntityName` (IBossDisplayData) for `BossStatus.setBossStatus`, and their renderers set `SkyHooks.hasColorModifier` (true for the Wither). The exit portal: `BlockEndPortal` in dimension 1 calls `EndPortalHooks.enterExitPortal(player)` (installed by `src/client/WinGame.ts`: The End. achievement, `EntityPlayer.playerConqueredTheEnd`, `GuiWinGame` for the local player or Packet70 reason 4 for a guest); the respawn the credits ask for keeps everything (`PlayerSpawning.respawn` uses `clonePlayer(old, old.playerConqueredTheEnd)`, and the LAN server accepts it from a living conqueror). Guests get the bosses' metadata through `EntityNetData` and run their client halves (`EntityDragon.updateRemote`, `EntityWither.updateClientState`) from `RemoteEntityVisuals`; `LanServer.getEntityById` resolves the dragon's parts. Dev helpers: `mc.dev.end`. |

**Cross-slice wiring (wave-1 merge).** Links that need every slice present are made in one of two
places: `src/item/ItemBindings.ts` (imported by `main.ts`; harvest enchantments, `SkyHooks.potionDuration`
from `EntityLiving.getActivePotionEffect`, `TileEntityFurnace.smeltingResult` from `FurnaceRecipes`)
and `src/entity/ItemHooksInstall.ts` (called by `installEntityClientHooks`; fills `ItemEntityFactories`
with the real entity constructors, `EnchantmentHooks` from `EnchantmentHelper`, and `PotionHooks` from
`Potion` / `PotionEffect` / `ItemPotion`). The wave-1 gaps are closed: bed sleeping arrived with the player slice and `BlockMiningSounds` / `Block.harvestBlock`
run from the survival controller (`PlayerControllerMP`).

**Wave-1b merge (worldgen).** World generation joined with every block, tile entity and entity
of the other slices registered, so villages, temples, dungeons and mineshafts get their real
blocks, chests and spawners, and villagers / chest minecarts / witches come from their
descriptors. The eye of ender, `/testfor` and the command block executor are linked by static
imports now that their modules exist; the remaining `import.meta.glob` links
(`CommandRegistries`, `ItemHooksInstall`) resolve to existing modules too.

**Wave-2 merge (renderblocks, inventory, mobs, dynamics).** Every block render type, tile-entity
renderer and container screen of 1.5.2 is present, along with the creative inventory, all 26 mobs
(spawn eggs, spawners, biome lists and world-generation descriptors create real classes), villages
and trading, and the dynamic block ticks. Links that were by name or duck typing now resolve:
the spawner cage draws its mob, spawn-egg pick block finds `EntityList.entityEggs`, pumpkin
patterns build snow and iron golems, portals spawn pig zombies, lightning turns pigs into pig
zombies, zombies infect and cure villagers (`func_82187_q`), golems target `isIMob` monsters,
creepers flee `Ozelot`, and `WorldGenRegistry`'s glob finds the real sapling and huge-mushroom
generators (the small-tree fallbacks in `BlockSapling` no longer run). Duplicates removed at the
merge: the shared AI tasks (one copy each), `renderMobHeldItem` (now a wrapper over
`renderHeldItem`) and `ModelBook`. Scenarios that compare a fixed layout with vanilla captures
should turn `doMobSpawning` off and remove living non-player entities before capturing: a new
world spawns animals on its first tick, and spawners spawn regardless of the rule.

**Wave-2b merge (survival, player).** Survival, Hardcore and Adventure (§8.1) and the player
slice (beds, effect list, FOV, other players) joined the wave-2 tree. One copy each is kept of:
the spawn point (`EntityPlayer.getBedLocation` / `setSpawnChunk` / `isSpawnForced`, set by
`wakeUpPlayer(…, setSpawn)`), `EntityPlayer.verifyRespawnCoordinates` (`PlayerSpawning`
delegates to it), the respawn (`PlayerSpawning.respawn`, after `loadChunksAroundBed` in
`src/client/BedRespawn.ts` puts kept chunks around the bed back), `InventoryEffectRenderer`
(the player slice's, with the Java HashMap order; `GuiInventory` and `GuiContainerCreative`
extend it) and the game mode (`EnumGameType` on the player via `EntityPlayer.setGameType` and
`PlayerSpawning.initializeGameType`; the earlier `CommandGameMode.applyGameType` / `gameTypeOf`
helpers and the flat `PlayerSnapshot` survival fields are gone, `PlayerSnapshot.state` holds
`PlayerSpawning.captureState`). Cross-slice links that now resolve: the GuiInventory to
GuiContainerCreative redirect follows `playerController.isInCreativeMode()`, hostile AI skips
only players whose `capabilities.disableDamage` is set (Creative), sleeping refuses with an
`EntityMob` nearby, bed render type 14 draws the bed seen while sleeping, skull helmets render
through `RenderBiped.skullRenderer`, and sprinting needs food above 6. A new player has 60 ticks
of spawn protection (`initialInvulnerability`), which Node tests that hurt a fresh player must
clear. Dev worlds take `?mobs=0` to start without natural mobs (slimes in superflat Survival
worlds otherwise hurt the player during a slow load).

**Wave-4a merge (account, controls).** The Account Manager, skins (`PlayerSkins`, `MC|Skin`),
the boot splash, Direct Connect / Room Code, the new key bindings (sprint, zoom, hotbar slots),
the scrolling Controls screen and imported texture packs share one tree. Player skins are
`TextureManager.allocateTexture` textures owned by `SkinTextures.ts`, so a pack switch
(`onPackChanged` → `refreshTextures`) keeps them; only Steve (`/mob/char.png`) follows the
active pack. The Default pack is now the first-launch pack: captures meant to match the Faithful
reference shots add `&pack=faithful` to their `goto` URL. Scenarios that call `mc.dev.sky.pin`
freeze the timer, so a real key press there is never ticked; use `mc.dev.press(code)` instead.

**Wave-4b merge (persistence, perf, stats).** Saving, the performance work and statistics share
one tree. One tick scheduler: perf's `TickScheduler` (numeric keys, flagged removals);
`World.getPendingBlockUpdates(cx, cz)` reads it through `inChunk` for the chunk's TileTicks.
`ChunkProviderClient.processIncoming` adds chunks read from the save (`savedIncoming`) before
the worker's indexed queue; a chunk the worker sends again (`replace`) is marked `isModified` so a
save that already holds the early copy is rewritten. Chunk compression and writes run as the
`IdleTasks` job `save.chunks` within the frame budget (and in the hidden LAN ticker), not 4 ms per
tick; autosave snapshots and Save and Quit (`SaveHandler.flush`) are unchanged.
`noteWorldLaunch` (statistics) runs after `launchIntegratedServer` waits for a Save and Quit in
progress, so a deferred launch counts once; opening a saved world (`ws === null`) counts
`startGame` and `joinMultiplayer` but not `createWorld`. `node_modules` and `public/assets` may be symlinks in worktrees and are ignored
as such (`/node_modules`, `/public/assets` in `.gitignore`): never commit them.

**Wave 5 (dimensions).** The Nether and the End are real dimensions (§5.8): providers, one World
per loaded dimension (`DimensionManager`), portal travel with the `Teleporter`, DIM-1/DIM1 saving
and LAN guests in any dimension (`LanWorld` per host world, Packet9Respawn with the dimension,
protocol 3). The Nether and End generators and the dragon plug in through `DimensionGenerators`
and the hooks in the Dimensions row of §13.

**Wave-5 Nether generation.** `src/world/gen/nether/`: `ChunkProviderHell` (dimension -1, registered
with `DimensionGenerators` by `nether/NetherRegistration.ts`; constructed as
`new ChunkProviderHell(seed, options)`), `MapGenCavesHell`, the features (`WorldGenHellLava`,
`WorldGenFire`, `WorldGenGlowStone1/2`; mushrooms and nether quartz through `WorldGenFlowers` /
`WorldGenMinable`) and the fortresses (`MapGenNetherBridge`, `StructureNetherBridgeStart`, every
`ComponentNetherBridge*` piece in `NetherBridgePieces.ts`; 1.5.2 fortresses have no chests and
generate even with "Generate Structures" off). Raw terrain, fortress layouts and populated areas are
byte-identical to 1.5.2 (`tests/nether-golden.test.ts` holds hashes of dumps of the original
generator). One deliberate difference: 1.5.2's `ChunkProviderHell.populate` never reseeds its random,
so the original's decoration depends on the order the server loaded chunks; here every population
starts from the state the server has when the chunk was the last of its 2x2 group to be generated
(`seedPopulateRandom`), which keeps the worker deterministic with or without terrain workers.
Spawn lists that depend on a dimension's generator go through `PossibleCreatures`
(`src/world/PossibleCreatures.ts`, asked first by `SpawnerAnimals.spawnRandomCreature`, like
`WorldServer.spawnRandomCreature` asks the chunk provider): `nether/NetherSpawning.ts` (imported by
`Minecraft.ts`) gives monsters inside fortress pieces the fortress list (blaze, pigman, skeleton,
magma cube), recomputing the layouts from the seed on the main thread.
