# mobshostile progress

Slice: hostile and nether mobs (classes, models, renderers, AI tasks), MobSpawnerBaseLogic.

Plan (tick when committed):
- [x] EntityMob combat (potions, enchantments), shared target AI tasks
- [x] Zombie / PigZombie / Giant + models/renderers
- [x] Skeleton (+ wither type) + EntityAIArrowAttack
- [x] Creeper (+ swell, charged layer)
- [x] Spider / CaveSpider (+ eyes)
- [x] Enderman (+ eyes, carried block)
- [x] Slime / MagmaCube
- [x] Witch, Silverfish
- [x] Ghast, Blaze
- [x] Registration (src/entity/HostileMobs.ts, src/render/entity/HostileMobRenderers.ts)
- [x] Spawner cage spin (client delay)
- [x] Node test tests/mobshostile.test.ts all green (creative ignore, survival targeting, revenge rules, pigmen, slimes, sun, stare, spawner)
- [x] Review of every entity/AI/model/renderer against the decompiled source
- [x] Scenario scripts/scenarios/mobshostile.json; run 1 compared with the reference shots
- [x] Eye layers: half lightmap like the original's GL_CLAMP border (GlowingEyes.ts)
- [ ] Run 2 (eye fix, view-bob reset) compared

Notes:
- Reference close-ups (zombie, skeleton, creeper, spider, enderman, pigman, witch, slime, cave
  spider, line-up) match geometry, texture offsets and shading; remaining 1-2 px vertical offsets
  in run 1 came from the scenario's tp + tick (camera bob), reset in run 2.
- In 1.5.2 a Creative attacker is picked up by EntityAIHurtByTarget and dropped on the next
  tick (resetTask clears players with disableDamage), so mobs only lurch at Creative players.
