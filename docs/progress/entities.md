# Entities agent progress (branch w1/entities)

A restarted agent continues from the first item not marked done. Status: todo / wip / done / skipped (reason).

| # | Item | Status |
|---|---|---|
| 1 | DamageSource: indirect/arrow/fireball/thrown/magic/thorns/explosion sources | done |
| 2 | Entity/EntityLiving completion: potions storage + hooks, loot pickup, armour helpers, setPositionAndRotation2, unmountEntity, creative-target helper | done (World.setEntityState echo, collectEffect hook, PotionEffects.ts) |
| 3 | EntityXPOrb + RenderXPOrb | done |
| 4 | EntityArrow + RenderArrow | done |
| 5 | EntityThrowable family (snowball, egg, pearl, exp bottle, potion) + RenderSnowball | done (splash potion uses default liquid colour until PotionHooks is installed) |
| 6 | Fireballs (large, small, wither skull) + renderers | done |
| 7 | EntityFallingSand + RenderFallingSand (BlockSand hook) | done |
| 8 | EntityTNTPrimed + RenderTNTPrimed; Explosion review | done (double explosion sound like SP) |
| 9 | EntityFireworkRocket | done (burst via World.makeFireworks or EntityFireworkRocket.explosionEffect) |
| 10 | EntityBoat + ModelBoat + RenderBoat | done (riding/creative break checked in scenario) |
| 11 | EntityMinecart family + ModelMinecart + RenderMinecart | done (matched vanilla capture; rail loop ride checked) |
| 12 | EntityHanging, EntityPainting, EntityItemFrame + renderers | done (matched vanilla capture) |
| 13 | EntityFishHook + RenderFish | done |
| 14 | EntityEnderEye, EntityEnderCrystal + renderers | done |
| 15 | Player interaction: interactWith, riding/dismount, creative rules | done |
| 16 | EntityItem / RenderItem review vs 1.5.2 | done (matched vanilla capture) |
| 17 | Dev hooks + scripts/scenarios/entities.json + screenshots vs reference | done (TNT crater 55-65 air vs vanilla 67, same single-layer shape) |
| 18 | Final report | done |

## Review fix pass

| # | Finding | Status |
|---|---|---|
| R1 | Item factory table (eggs, paintings, splash potions, fishing) | done: `ItemHooksInstall.installItemEntityFactories`, run at start-up via import.meta.glob; EntityPotion field renamed `potionDamage`; checked on a test merge with w1/items |
| R2 | Merge conflicts (EntityPlayer with items, EntityPlayerSP/DevTools with gui, ChunkProviderClient/TESTING with worldgen/sky) | orchestrator; `EntityDescriptor.init` added and honoured so the worldgen side merges trivially |
| R3 | Player damage pipeline | done (difficulty, blocking, armour value + wear, exhaustion hook, alertWolves, death XP, thorns, dig speed) |
| R4 | Enchantment / potion hooks | done: `EnchantmentHooks` table + `installEnchantmentHooks` / `installPotionHooks` |
| R5 | Minecart sounds | done: `SoundUpdaterMinecart` |
| R6 | Falling anvil metadata | done (block-access wrapper) |
| R7 | Minecart container tags | done |
| R8 | Item frame stack link + framed compass | done (map branch waits for a map renderer) |
| R9 | Echoed sounds rule | done: `Entity.playSoundEchoed`, rule in ARCHITECTURE |
| R10 | Scenario time drift | done: setTime(6000) before every capture |
