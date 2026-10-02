# Core fix progress

Tracks the review findings for the core engine (see the review of commit `964a9c2`). A restarted
agent resumes from the first item that is not marked done or skipped. Status values: `todo`,
`wip`, `done`, `skipped (reason)`.

## Blockers

| ID | Finding | Status |
|---|---|---|
| B1 | Tile entities: TileEntity + registry, BlockContainer, Chunk/World wiring, TileEntityRenderer, worldgen payload | todo |
| B2 | EntityList name/ID registry with egg table | todo |
| B3 | Container framework: IInventory, Slot, Container, ContainerPlayer, GuiContainer, displayGUI* hooks, inventory key | todo |
| B4 | RenderBlocks transliteration rewritten as original TypeScript (golden byte-equality test), SRG names renamed | todo |

## Majors

| ID | Finding | Status |
|---|---|---|
| M1 | SoundManager pause semantics (sound muted forever after ESC from pause menu) | done |
| M2 | Player attacks: attackTargetEntityWithCurrentItem via PlayerControllerCreative.attackEntity | todo |
| M3 | EntityLiving combat/death/sounds/AI branch + EntityCreature/Ageable/Animal/Mob + EntityAITasks/EntityAIBase | todo |
| M4 | RenderLiving, RenderBiped, RenderPlayer (F5 player model), shadows and fire overlay | todo |
| M5 | Biome spawn lists, SpawnListEntry, EnumCreatureType, SpawnerAnimals as World.mobSpawner | todo |
| M6 | Explosion + World.createExplosion/newExplosion | todo |
| M7 | Chat and commands: GuiChat, GuiNewChat, CommandHandler, addChatMessage | todo |
| M8 | Unloaded-chunk store keeps every ticked chunk (playerEdited flag) | done (World.runNaturally context, Chunk.playerModified) |

## Minors

| ID | Finding | Status |
|---|---|---|
| m1 | Leaves graphics level not applied on the main thread | done |
| m2 | shot.mjs preview port from --url; interact.json sideHit offset | done |
| m3 | Main menu: Multiplayer/Language disabled, Quit Game must not kill the page | done |
| m4 | Fog distance uses abs(eye.z) like fixed-function GL | done |
| m5 | Texture pack switch reloads grass/foliage colormaps and sends them to meshers | done (GuiTexturePacks itself left to the GUI agent, see m13) |
| m6 | Chunk streaming hotspots (dirty set, per-frame scans, allocations) | done (dirty/geometry sets, partial selection instead of per-frame sort; no real-GPU profile possible here) |
| m7 | F3 "C:" counts like 1.5.2 | done |
| m8 | Extension points documented in ARCHITECTURE.md | todo |
| m9 | EntityItem, World.itemDropFactory, drop key (Q) | todo |
| m10 | ModelBase texture offset map, named addBox | todo |
| m11 | playAuxSFX remaining cases | todo |
| m12 | Weather: addWeatherEffect, lightning roll consuming RNG, hook | todo |
| m13 | GuiSlot widget | todo |
| m14 | pendingNear counts only results inside the radius | done |
| m15 | Superflat world type | todo |
| m16 | Render distance change applies without crossing a chunk border | done |
| m17 | Video Settings title at y=20 | done |
| m18 | "Building terrain" screen has no progress bar | done |
| m19 | Ctrl+A/C/X/V in text fields | done (GuiTextField selection port) |
| m20 | Smooth camera (F8) MouseFilter, mouse look gated on focus | done |
| m21 | Pause menu Achievements/Statistics/LAN enabled (no-op) | done |
| m22 | TextureMap doc vs code (tile size) | todo |
| m23 | Final docs: ARCHITECTURE.md / TESTING.md reflect reality | todo |
