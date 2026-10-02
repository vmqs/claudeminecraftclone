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
- [x] Node test tests/mobshostile.test.ts all green
- [ ] Review vs decompiled source (natural spawning rules, despawn, drops, XP)
- [ ] Scenario scripts/scenarios/mobshostile.json + screenshot comparison with ref mob shots

Notes:
