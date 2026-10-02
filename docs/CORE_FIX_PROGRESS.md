# Core fix progress

Tracks the review findings for the core engine (see the review of commit `964a9c2`). A restarted
agent resumes from the first item that is not marked done or skipped. Status values: `todo`,
`wip`, `done`, `skipped (reason)`.

## Blockers

| ID | Finding | Status |
|---|---|---|
| B1 | Tile entities: TileEntity + registry, BlockContainer, Chunk/World wiring, TileEntityRenderer, worldgen payload | done (src/world/tileentity/, BlockContainer, World/Chunk/GenWorld wiring, payload descriptors, src/render/tileentity/) |
| B2 | EntityList name/ID registry with egg table | done (src/entity/EntityList.ts + src/entity/Entities.ts) |
| B3 | Container framework: IInventory, Slot, Container, ContainerPlayer, GuiContainer, displayGUI* hooks, inventory key | done (src/gui/inventory/: Container, Slot, SlotArmor, SlotCrafting, ContainerPlayer/Workbench/Chest, GuiContainer, GuiInventory/GuiCrafting/GuiChest; src/item/crafting/ CraftingManager; EntityPlayer displayGUI* hooks; E opens GuiInventory until GuiContainerCreative exists) |
| B4 | RenderBlocks transliteration rewritten as original TypeScript (golden byte-equality test), SRG names renamed | done (face tables + renderFace/computeFaceLight; byte-identical to the old output over 103k random blocks, 440k quads and every item render; renderStandardBlockWithAmbientOcclusionPartial, renderOverlayPass, checkTorchAttachment, fillCreativeHotbarSlot) |

## Majors

| ID | Finding | Status |
|---|---|---|
| M1 | SoundManager pause semantics (sound muted forever after ESC from pause menu) | done |
| M2 | Player attacks: attackTargetEntityWithCurrentItem via PlayerControllerCreative.attackEntity | done |
| M3 | EntityLiving combat/death/sounds/AI branch + EntityCreature/Ageable/Animal/Mob + EntityAITasks/EntityAIBase | done (EntityLiving full port, Creature/Ageable/Animal/Mob/Tameable/Golem/WaterMob/Ambient/Flying, ai/ tasks + PathNavigate/PathFinder) |
| M4 | RenderLiving, RenderBiped, RenderPlayer (F5 player model), shadows and fire overlay | done (Render shadow/fire, RenderLiving, RenderBiped, RenderPlayer, RenderItem entities; src/render/entity/EntityRenderers.ts) |
| M5 | Biome spawn lists, SpawnListEntry, EnumCreatureType, SpawnerAnimals as World.mobSpawner | done (biome spawn lists by EntityList name, SpawnerAnimals default World.mobSpawner, worker performWorldGenSpawning descriptors) |
| M6 | Explosion + World.createExplosion/newExplosion | done (src/world/Explosion.ts, World.newExplosion/createExplosion/getBlockDensity) |
| M7 | Chat and commands: GuiChat, GuiNewChat, CommandHandler, addChatMessage | done (GuiChat with history and tab completion, GuiNewChat HUD lines; src/command/ CommandHandler, CommandBase, PlayerSelector, ServerCommandManager with help, time, tp, give, kill, seed, say, me, tell; also GuiGameOver and respawn for /kill and void deaths) |
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
| m9 | EntityItem, World.itemDropFactory, drop key (Q) | done |
| m10 | ModelBase texture offset map, named addBox | done |
| m11 | playAuxSFX remaining cases | done (ghast/zombie/wither/bat/anvil sounds, records with "Now playing" and SoundManager.playStreaming, potion splash, eye of ender, bone meal; broadcastSound 1013/1018) |
| m12 | Weather: addWeatherEffect, lightning roll consuming RNG, hook | done (thunder roll before the ice/snow roll, World.lightningBoltFactory hook, weather effects rendered first in renderEntities) |
| m13 | GuiSlot widget | todo |
| m14 | pendingNear counts only results inside the radius | done |
| m15 | Superflat world type | done (FlatGeneratorInfo presets, ChunkProviderFlat with the default 2;7,2x3,2;1;village layers, SingleBiomeSource, spawn at y=4; villages not generated yet) |
| m16 | Render distance change applies without crossing a chunk border | done |
| m17 | Video Settings title at y=20 | done |
| m18 | "Building terrain" screen has no progress bar | done |
| m19 | Ctrl+A/C/X/V in text fields | done (GuiTextField selection port) |
| m20 | Smooth camera (F8) MouseFilter, mouse look gated on focus | done |
| m21 | Pause menu Achievements/Statistics/LAN enabled (no-op) | done |
| m22 | TextureMap doc vs code (tile size) | todo |
| m23 | Final docs: ARCHITECTURE.md / TESTING.md reflect reality | todo |
