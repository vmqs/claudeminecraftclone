# Architecture

This is a browser recreation of **Minecraft 1.5.2 (Java Edition), Creative mode**, written in
TypeScript on raw WebGL2 and built with Vite. The goal is to *feel and look* like the original:
the same constants, physics, lighting, GUI layout, sounds, and textures.

This document is the contract every module is written against. If you change a contract, update
this file in the same commit.

## 1. Scope

In scope:
- **Creative mode only.** The player is invulnerable, flies with double-tap space, breaks blocks
  instantly, and gets items from the creative inventory. There is no hunger, no health or XP bar,
  and no crafting requirement.
- **Overworld only.** There is no Nether or End. Blocks and items from those dimensions still exist
  in the creative inventory and can be placed.
- **Mobs and combat.** All overworld mobs and every spawn egg in the 1.5.2 creative inventory,
  with their AI, natural spawning, drops, and the original models and animations. The player can
  hit, shoot (bow), and explode mobs. As in 1.5.2, hostile mobs do not target a Creative player
  (`World.getClosestVulnerablePlayer` skips players whose capabilities disable damage); they
  still fight each other (iron golems, wolves). Only out-of-world damage (`/kill`, falling into
  the void) kills the player, which shows the death screen and respawns at the world spawn.
- World generation is a **port of 1.5.2's generator**: the same seed gives the same biomes,
  terrain, caves, decoration and structures (Default, Large Biomes and Superflat with presets).
- **No world saving.** Worlds live in memory for the session. Modified chunks are kept in memory
  when unloaded so builds survive flying away and back. Options and key bindings *are* kept in
  `localStorage`, like `options.txt`.
- Keyboard and mouse only (Pointer Lock).
- Deployed as a static site to GitHub Pages.

Out of scope (render as static or decorative where a block exists): redstone logic, Survival,
Hardcore, crafting and furnace processing, Nether/End dimensions, multiplayer, achievements,
statistics, enchanting, brewing, trading. (The container and crafting frameworks exist, so a
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
  assets/                  ResourceManager (layered packs), manifest types, image/text/sound loading
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
                           workbench and chest windows, crafting inventories (GuiContainerCreative to come)
  audio/                   SoundManager (Web Audio), SoundPool, music and record scheduling
  command/                 CommandHandler, CommandBase, PlayerSelector, ServerCommandManager and the
                           commands (/help, /time, /tp, /give, /kill, /seed, /say, /me, /tell so far)
docs/                      ARCHITECTURE.md (this file), RESEARCH.md
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
 ├─ World (client-side, authoritative)        worldgen.worker  (1 worker)
 │   chunks, entities, ticks, lighting  <──── generates terrain, populates (decorates),
 │   requests/unloads chunks ─────────────>   computes initial sky/block light; returns
 │                                            only *finalized* chunks
 ├─ RenderGlobal ──── section snapshots ────> mesher.worker (pool of 2–3)
 │   VBOs per section/pass  <──── vertex data ─ RenderBlocks over ChunkCache (padded 20^3)
 ├─ EntityRenderer / GL facade / GUI
 └─ SoundManager (Web Audio)
```

There is no integrated server: the client `World` is the simulation. Everything below runs on
the main thread unless marked as a worker.

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

- **Terrain worker.** `worldgen.worker.ts` starts a nested `workers/terrain.worker.ts` that makes
  raw terrain (`ChunkProviderGenerate.provideTerrain`: noise, surface, caves, ravines, as
  `world/gen/TerrainChunk` sections) for the chunks the next jobs need, while the world-generation
  worker populates and lights; it makes terrain itself when the terrain worker is behind or
  missing (Superflat never uses it). Terrain is a pure function of seed and position, and
  prefetched terrain is only taken into the generating world (with the structure-start part,
  `recordStructures`) when generation asks for that chunk, so what is loaded, which gates light
  updates, never depends on timing: the output is byte-identical with and without it.

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
  loads that area one chunk per step (terrain comes from the terrain worker) and answers
  `findSpawn` when it is done. After that,
  chunks are populated on demand, nearest to the player first.
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
loaded, adds arriving chunks within a per-frame time budget, unloads chunks two beyond the radius,
and keeps unloaded chunks in memory when they were modified or hold mobs. World creation
(`Minecraft.launchIntegratedServer`) shows "Loading world / Building terrain" until the 5x5
chunks around the spawn are present, places the player like `EntityPlayerMP` (random offset of up
to 10 blocks, on `getTopSolidOrLiquidBlock`), then shows "Downloading terrain" until the area
around the player is meshed. `Chunk` only needs a `ChunkHost` (an `IWorld` plus light and
render-update hooks), which both the client `World` and the worker's `GenWorld` implement.

Edits made by world simulation (block ticks, fluids, leaf decay, weather, light) run inside
`World.runNaturally`; anything else marks the chunk `playerModified`. When a chunk unloads, a
player-modified chunk is kept whole, otherwise only its entities are kept, and it is
re-requested (the worker sends the same chunk again) when it comes back.

### 5.3 Lighting (main thread)

Incremental updates use the original's sky and block light rules: `Block.lightOpacity`,
`Block.lightValue`, skylight that falls straight down through opacity-0 blocks, and BFS increase
and decrease with the same max-of-neighbours-minus-opacity rule (`updateLightByType`). Updates stop
at unloaded chunk edges. Changed light marks the affected sections dirty for re-meshing.

### 5.4 Meshing (worker pool)

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
(`scheduleBlockUpdate`, `tickRate`), and `tickBlocksAndAmbiance`: per active chunk the mood-sound
check, the lightning roll (1 in 100000 while thundering), the ice and snow roll, and 3 random
block ticks per non-empty section, consuming `rand` and `updateLCG` in the original order.
`World.updateEntities()` ticks weather effects, entities (then removes dead ones) and tile
entities (`updateEntity`, with additions and removals deferred while iterating).

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
smooth lighting), 1 (crossed squares), 2 (torch), 4 (fluids), 13 (cactus) and 31 (logs). Every
standard face goes through one quad builder, `renderFace(side, …)`, driven by the `FACES` table
(geometry, UV layout per `uvRotate*` value, `flipTexture`, smooth-light sample order). Other
render types fall back to a cube until they are ported (see §13).

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

Potion effects live on `EntityLiving.activePotionsMap` as `PotionEffectLike` objects
(`src/entity/PotionEffects.ts`: `PotionId`, the swirl colour, and `PotionHooks` for the potion
code to install `effectsFromDamage`, `liquidColorFromDamage`, `createEffect` and `affectEntity`).
Creative players are never targeted: `Entity.isCreativeInvulnerable()` is true for a player whose
capabilities disable damage. Mob code (AI target selection, creeper swelling, skeleton and blaze
shooting, wolf anger) should test it wherever the original tests `capabilities.disableDamage`.
World-generation entities come in as `EntityDescriptor`s through `EntityList.fromDescriptor`,
which passes optional `data` to the entity's `readEntityFromNBT`.

`EntityPlayerSP` uses the original movement: `landMovementFactor 0.1`,
`jumpMovementFactor 0.02`, sprint (double-tap forward), Creative flight (double-tap jump, vertical
speed ±0.15×3, flySpeed 0.05), sneaking at 0.3× with the edge guard, step height 0.5, eye height
1.62, and a 0.6×1.8 box. `PlayerControllerCreative`: left click breaks instantly, and holding it
breaks again after a 5-tick delay. Right click places or uses with a 4-tick repeat. Middle click
picks the block. Reach is 5 blocks.

## 9. GUI

`ScaledResolution` uses the original algorithm: grow the scale while
`w/(s+1) >= 320 && h/(s+1) >= 240`, capped by `guiScale` (0 = auto). Every screen renders through
the GL facade in GUI space (`ortho(0, w, h, 0, 1000, 3000)` with a translate of −2000), so 3D item
icons work naturally. `FontRenderer` measures glyph widths from the *vanilla* `font/default.png`, as
the original did (it read the font image from the jar), and draws with the selected pack's image. It
supports shadows (offset 1, colour ×0.25), `§` colour and format codes, and unicode fallback
through `font/glyph_XX.png` and `glyph_sizes.bin`. Screens: main menu (rotating panorama, logo,
random splash, version string), select world (in-memory worlds), create world (with "More World
Options": seed, structures, world type Default, Superflat, or Large Biomes, cheats, bonus chest),
options, video settings, controls, sounds, language (English), texture packs (bundled Faithful vs
Default), pause menu, loading screens, chat with commands, the creative inventory (12 tabs, search,
scroll, survival-inventory tab with the destroy slot), the HUD (hotbar, crosshair, selected item
name fade, chat lines, "Now playing"), the death screen, and the F3 debug screen with the original
text lines.

Shared widgets: `GuiButton`, `GuiTextField` (selection, Ctrl+A/C/X/V), `GuiSlot` (scrolling
lists). Container windows extend `GuiContainer`, which draws the slots, the cursor stack and
tooltips and implements every 1.5.2 click (shift-click, number keys, middle-click clone, Q,
drag-spreading, double-click collect) through `PlayerControllerCreative.windowClick` and
`Container.slotClick`. The inventory key opens `GuiInventory` (the survival layout) until
`GuiContainerCreative` exists. Chat goes `GuiChat` → `EntityPlayerSP.sendChatMessage` →
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

## 13. Extension points

Where later subsystems plug in. Registries that workers also need are imported by
`src/block/Blocks.ts` (the mesher and world-generation workers import it); main-thread-only
registries are imported once by `src/client/Minecraft.ts`.

| Area | How to extend |
|---|---|
| Blocks | Subclass `Block` (`src/block/`), construct it in `src/block/Blocks.ts`, add icons in `registerIcons`. Behaviour hooks: `updateTick`, `randomDisplayTick`, `onBlockActivated`, `onNeighborBlockChange`, `onBlockDestroyedByExplosion`, `canDropFromExplosion`, `isUpdateTickImmediate`, `fillWithRain`. Schedule ticks with `World.scheduleBlockUpdate`. |
| Block rendering | Add a `case` to `RenderBlocks.renderBlockByRenderType` or call `RenderBlocks.renderers.set(type, (rb, block, x, y, z) => …)` from a module that `Blocks.ts` imports. Build faces with `setRenderBounds` / `overrideBlockBounds` + `renderStandardBlock` or `renderFace(side, x, y, z, icon)`, `uvRotate*` and `flipTexture`. Items in 3D: `RenderBlocks.renderItemIn3d` and `renderBlockAsItem`. |
| Tile entities | Subclass `TileEntity` (`src/world/tileentity/`), `TileEntity.addMapping(cls, '<1.5.2 id>')` in `TileEntities.ts`, and a `BlockContainer` whose `createNewTileEntity` returns it. Special renderers: `TileEntityRenderer.instance.register(cls, renderer)` in `src/render/tileentity/TileEntityRenderers.ts`. World generation can place them through `IWorld.setBlockTileEntity`; they travel to the client as NBT. |
| Items | Subclass `Item` in `src/item/`, register in `Items.ts` (one line per item in 1.5.2 order; block items come from `registerBlockItems()`, the tail of Block's static block, which skips blocks that do not exist yet). Hooks: `onItemUse`, `onItemRightClick`, `onEaten` (finished by `EntityPlayer.onItemUseFinish`), `itemInteractionForEntity` (via `ItemStack.interactWith`), `getArmorInfo` / `getArmorColor` (armour), `getRecordName` / `getRecordTitle` (records), `getContainerItem`, `onCreated`, `doesContainerItemLeaveCraftingGrid`, `getEnchantKind` (what enchantments fit). Entities items create go through `ItemEntityFactories` (`src/item/ItemEntitySpawning.ts`: register exact constructors for throwables, arrows, the fishing hook, rockets, eyes of ender, hanging entities, minecarts, boats; otherwise EntityList + the original constructor set-up). Bone meal calls the block's `markOrGrowMarked` / `fertilizeMushroom` / `fertilizeStem` / `fertilize`; dye/saddle call `getSheared`/`setFleeceColor` / `getSaddled`/`setSaddled`. Held-item icons per pass: `getItemIconForEntity` (`src/item/ItemIcons.ts`). Creative lists: `CreativeTabs.displayAllReleventItems` (adds the tab's enchanted books), `getAllCreativeItems()` for the search tab. `Item.itemRand` is the shared item RNG. |
| Crafting | All 229 recipes of 1.5.2 are registered by `src/item/crafting/Recipes.ts` the first time `CraftingManager.getInstance()` is used; more with `addRecipe(output, ['##', '##'], { '#': Block })`, `addShapelessRecipe(output, ...ingredients)`, `addRecipeObject(recipe)` (`IRecipe` over any `CraftingGrid`). The list sorts itself like `RecipeSorter`. Smelting: `FurnaceRecipes.smelting().getSmeltingResult(id)` / `getExperience(resultId)`; fuel: `getItemBurnTime(stack)` (`src/item/crafting/FurnaceRecipes.ts`). |
| Potions and enchantments | `src/potion/` (`Potion.potionTypes`, `PotionEffect`, `PotionHelper` damage-value -> effects / colour / names and `applyIngredient`); entities receive effects through `applyPotionEffect(entity, effect)` / `clearPotionEffects(entity)`, which call `addPotionEffect` / `clearActivePotions` once EntityLiving has them. `src/enchantment/` (`Enchantment.enchantmentsList`, `EnchantmentHelper` levels, modifiers and random enchanting; stacks carry `ench` / `StoredEnchantments` lists of `{id, lvl}`). |
| Containers and GUIs | `IInventory` (or `InventoryBasic`), a `Container` subclass (`addSlotToContainer`, `transferStackInSlot`, `canInteractWith`, `canMergeSlot`), a `GuiContainer` subclass (`drawGuiContainerBackgroundLayer`, `drawGuiContainerForegroundLayer`). Open it from `EntityPlayerSP.displayGUI*` (hooks declared on `EntityPlayer`: chest, hopper, enchantment, anvil, workbench, furnace, dispenser, sign, brewing stand, beacon, merchant, book). The creative inventory replaces `GuiInventory` in its `initGui`/`updateScreen` and uses `PlayerControllerCreative.sendSlotPacket` (a no-op here). Armour slot backgrounds: `SlotArmor.emptySlotIcons`. Lists: subclass `GuiSlot`. |
| Entities | Class in `src/entity/`, `EntityList.addMapping(cls, '<name>', id)` in `src/entity/Entities.ts` (eggs come from the `entityEggs` table), renderer via `RenderManager.instance.register(cls, render)` in `src/render/entity/EntityRenderers.ts` (renderers needing item-atlas sprites override `Render.updateItemIcons`). Client echoes: `World.setEntityState` → `handleHealthUpdate`, `EntityLiving.collectEffect`. Hooks for other code: `EntityLiving.addRandomEnchantment`, `EntityPlayer.enchantmentHooks`, `EntityArrow.thornsHook`, `Explosion.blastProtection`, `EntityFireworkRocket.explosionEffect` (or `World.makeFireworks`), `HopperTransfer.chestInventory`, `PotionHooks`; `BlockSand.createFallingEntity` is installed by `EntityFallingSand`. Mob bases: `EntityCreature`, `EntityAgeable`, `EntityAnimal`, `EntityMob`, `EntityTameable`, `EntityGolem`, `EntityWaterMob`, `EntityAmbientCreature`, `EntityFlying`; AI tasks extend `EntityAIBase` (`src/entity/ai/`). Factories for classes `World` cannot import: `World.itemDropFactory` (set by `EntityItem`), `EntityLiving.experienceOrbFactory`, `World.lightningBoltFactory`. |
| Spawning | Biome lists by `EntityList` name (`BiomeGenBase.getSpawnableList`, `editSpawns`), `SpawnRules` for the per-mob `getCanSpawnHere` data, `World.mobSpawner` (default `SpawnerAnimals.findChunksForSpawning`), world-generation animals in `WorldGenSpawning`. |
| Particles | Every 1.5.2 name is registered in `src/render/particle/ParticleRegistry.ts`; add more with `RenderGlobal.particleFactories.set(name, (w, x, y, z, vx, vy, vz) => fx)` (culled beyond 16 blocks and by the particle setting), `unculledParticleFactories` (always created) or `particlePrefixFactories` (name families such as `iconcrack_`/`tilecrack_`) from `ParticleFactories.ts`. `EffectRenderer.addEffect(fx)` for direct effects (`EffectRenderer.instance`), `addBlockDestroyEffects` / `addBlockHitEffects` for blocks, `EntityRainFX` (or the factory `RenderGlobal.particleFactories.get('rain')`, an internal name for EntityRenderer.addRainParticles, not a vanilla spawnParticle name) for rain splashes, and `World.makeFireworks(x, y, z, vx, vy, vz, fireworksTag)` (func_92088_a) for a firework rocket's explosion. |
| Sounds and world effects | `World.playSoundEffect` / `playSound` / `playSoundAtEntity`, `World.playAuxSFX(type, …)` (cases in `RenderGlobal.playAuxSFX`), `World.playRecord`, `World.broadcastSound`, `SoundManager.playEntitySound` for loops. |
| Weather | `World.updateWeather` (the server's rain and thunder cycles, `isRaining()` for gameplay), `World.clientWeather` (`WeatherCycle`: what is rendered; `WeatherCycle.setWeather(world, 'clear' \| 'rain' \| 'thunder', seconds?)` and `WeatherCycle.toggleDownfall(world)` back `/weather` and `/toggledownfall`), `World.weatherEffects` + `addWeatherEffect` (rendered before entities), `World.lightningBoltFactory` (set in `src/render/sky/SkyRegistry.ts`) for the strike in `tickBlocksAndAmbiance`. Rain splashes use the `rain` and `smoke` particle factories directly (like `new EntityRainFX`), the sound `ambient.weather.rain`; bolts play `ambient.weather.thunder` and `random.explode`. Sky, fog, clouds and the lightmap read `clientWeather.getRainStrength` / `getWeightedThunderStrength`. |
| Explosions | `World.createExplosion` / `newExplosion`; entities can veto blocks with `getBlockExplosionResistance` / `canExplosionDestroyBlock`. |
| Commands | Subclass `CommandBase` (`src/command/`), register it in the `ServerCommandManager` constructor or with `ServerCommandManager.addCommand(() => new CommandX())` before a world starts. `getServer()` gives the worlds, players and `sendChatMsg`; results go through `CommandBase.notifyAdmins`; target selectors through `CommandBase.getPlayer` / `PlayerSelector`. |
| Chat | `EntityPlayer.addChatMessage(langKey)`, `sendChatToPlayer(text)`, `Minecraft.ingameGUI.getChatGUI().printChatMessage(text)`. |
| World generation | `ChunkGenerator` implementations in `src/world/gen/` (chosen by `WorldGenServer`), `BiomeSource` (`WorldChunkManager` over the GenLayer stack, `SingleBiomeSource` for Superflat), `WorldGenerator` features from `ChunkProviderGenerate.populate` / `BiomeDecoration`, structures as `MapGenStructure` + `StructureStart` + `StructureComponent` pieces in `src/world/gen/structure/`, chest/dispenser/spawner contents through `ChestLoot` (`putTileEntityTag`), entities through `spawnGenEntity`. Superflat presets: `FlatGeneratorInfo`, `FLAT_PRESETS`. World options: `WorldSettings.generatorOptions` / `bonusChest`. Stronghold queries: `StructureLocator.findClosestStructure`. Code here must stay worker-safe (`IWorld`, no DOM or GL). |
| Dev hooks | `src/client/DevTools.ts` (`?dev=1` → `window.mc.dev`), scenarios in `scripts/scenarios/`. |
| Block interaction hooks | `BlockGuiHooks.register(kind, handler)` (`src/block/BlockGuiHooks.ts`; chest, enderChest, workbench, furnace, dispenser, dropper, hopper, brewingStand, enchantment, anvil, beacon, sign, commandBlock; without a handler the player's `displayGUI*` runs). Survival breaking calls `Block.harvestBlock` (drops, stats, exhaustion) after removing the block; `HarvestModifiers.silkTouch` / `fortune` are wired to `EnchantmentHelper`. Block events: `World.addBlockEvent` → `Block.onBlockEventReceived`. Mob spawners: `MobSpawnerBaseLogic.spawnHook`. |
| HUD and GUI hooks | `GuiIngame` draws the survival bars whenever the player is not in creative (food, air, XP, armour read by duck typing), `GuiIngame.playerListProvider` (TAB list), `GuiIngame.scoreboardOverlay`, `GuiIngame.setRecordPlayingMessage`, `BossStatus.setBossStatus(boss, colorModifier)` for boss renderers (with `SkyHooks.hasColorModifier`), `CommandGameMode.gameTypeListener` for the survival controller, `Minecraft.mcProfiler` sections (Shift+F3 chart), `getScoreboard(world)` (deaths and kills are counted by `EntityPlayer.onDeath` / `addToPlayerScore`). Overlays outside the HUD (pumpkin blur, portal swirl, first-person fire) live in `src/render/sky/ScreenOverlays.ts`. |

**Cross-slice wiring (wave-1 merge).** Links that need every slice present are made in one of two
places: `src/item/ItemBindings.ts` (imported by `main.ts`; harvest enchantments, `SkyHooks.potionDuration`
from `EntityLiving.getActivePotionEffect`, `TileEntityFurnace.smeltingResult` from `FurnaceRecipes`)
and `src/entity/ItemHooksInstall.ts` (called by `installEntityClientHooks`; fills `ItemEntityFactories`
with the real entity constructors, `EnchantmentHooks` from `EnchantmentHelper`, and `PotionHooks` from
`Potion` / `PotionEffect` / `ItemPotion`). Still open after the merge: no `TileEntitySpecialRenderer`
is registered yet (chests, signs, skulls, spawner cages and enchanting books are invisible in the
world and `GuiEditSign` draws no sign); no `BlockGuiHooks` handler for furnace, dispenser, brewing
stand, enchanting, anvil, beacon or hopper windows (only the core chest and workbench GUIs exist);
no creative inventory GUI using `CreativeTabs.displayAllReleventItems`; mobs (`Pig`, `Sheep`,
`Chicken`, ...) that the items and entities slices call by duck typing; dynamic block ticks
(`TODO(block-dynamics)`); bed sleeping (`sleepInBedAt`); `BlockMiningSounds` and `Block.harvestBlock`
wait for the survival controller.
