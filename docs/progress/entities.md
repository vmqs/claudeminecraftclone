# Entities agent progress (branch w1/entities)

A restarted agent continues from the first item not marked done. Status: todo / wip / done / skipped (reason).

| # | Item | Status |
|---|---|---|
| 1 | DamageSource: indirect/arrow/fireball/thrown/magic/thorns/explosion sources | done |
| 2 | Entity/EntityLiving completion: potions storage + hooks, loot pickup, armour helpers, setPositionAndRotation2, unmountEntity, creative-target helper | done (World.setEntityState echo, collectEffect hook, PotionEffects.ts) |
| 3 | EntityXPOrb + RenderXPOrb | done |
| 4 | EntityArrow + RenderArrow | done |
| 5 | EntityThrowable family (snowball, egg, pearl, exp bottle, potion) + RenderSnowball | done (visual check pending) |
| 6 | Fireballs (large, small, wither skull) + renderers | todo |
| 7 | EntityFallingSand + RenderFallingSand (BlockSand hook) | todo |
| 8 | EntityTNTPrimed + RenderTNTPrimed; Explosion review | todo |
| 9 | EntityFireworkRocket | todo |
| 10 | EntityBoat + ModelBoat + RenderBoat | todo |
| 11 | EntityMinecart family + ModelMinecart + RenderMinecart | todo |
| 12 | EntityHanging, EntityPainting, EntityItemFrame + renderers | todo |
| 13 | EntityFishHook + RenderFish | todo |
| 14 | EntityEnderEye, EntityEnderCrystal + renderers | todo |
| 15 | Player interaction: interactWith, riding/dismount, creative rules | todo |
| 16 | EntityItem / RenderItem review vs 1.5.2 | todo |
| 17 | Dev hooks + scripts/scenarios/entities.json + screenshots vs reference | todo |
