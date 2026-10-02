# Entities agent progress (branch w1/entities)

A restarted agent continues from the first item not marked done. Status: todo / wip / done / skipped (reason).

| # | Item | Status |
|---|---|---|
| 1 | DamageSource: indirect/arrow/fireball/thrown/magic/thorns/explosion sources | done |
| 2 | Entity/EntityLiving completion: potions storage + hooks, loot pickup, armour helpers, setPositionAndRotation2, unmountEntity, creative-target helper | done (World.setEntityState echo, collectEffect hook, PotionEffects.ts) |
| 3 | EntityXPOrb + RenderXPOrb | done |
| 4 | EntityArrow + RenderArrow | done |
| 5 | EntityThrowable family (snowball, egg, pearl, exp bottle, potion) + RenderSnowball | done (visual check pending) |
| 6 | Fireballs (large, small, wither skull) + renderers | done |
| 7 | EntityFallingSand + RenderFallingSand (BlockSand hook) | done |
| 8 | EntityTNTPrimed + RenderTNTPrimed; Explosion review | done (double explosion sound like SP) |
| 9 | EntityFireworkRocket | done (burst via World.makeFireworks or EntityFireworkRocket.explosionEffect) |
| 10 | EntityBoat + ModelBoat + RenderBoat | done (visual check pending) |
| 11 | EntityMinecart family + ModelMinecart + RenderMinecart | done (visual check pending) |
| 12 | EntityHanging, EntityPainting, EntityItemFrame + renderers | done (visual check pending) |
| 13 | EntityFishHook + RenderFish | done |
| 14 | EntityEnderEye, EntityEnderCrystal + renderers | done |
| 15 | Player interaction: interactWith, riding/dismount, creative rules | todo |
| 16 | EntityItem / RenderItem review vs 1.5.2 | todo |
| 17 | Dev hooks + scripts/scenarios/entities.json + screenshots vs reference | todo |
