# mobspassive progress

Wave 2 slice: passive and neutral mobs (Pig, Cow, Sheep, Chicken, MushroomCow, Wolf, Ozelot,
Squid, Bat, Villager, VillagerGolem, SnowMan), their models/renderers, AI tasks, villages and the
villager trading GUI.

## Plan

1. [x] AI tasks (src/entity/ai/EntityAI*.ts), IMob selector, villages (src/world/village/) + World hook
2. [x] Mob entity classes + EntityList registration (src/entity/PassiveMobs.ts)
3. [x] Models + renderers (src/render/entity/Model*.ts, RenderPassiveMobs.ts, PassiveMobRenderers.ts)
4. [x] Merchant: GuiMerchant / ContainerMerchant / InventoryMerchant / SlotMerchantResult + displayGUIMerchant
5. [x] Self-review of classes, AI tasks, models and renderers against 1.5.2
6. [x] Node logic test (tests/mobspassive.test.ts, 121 checks), scenario scripts/scenarios/mobspassive.json
7. [x] VillageSiege (faithful no-op: 1.5.2 drops the spawn spot it finds)

## Verification

- `node scripts/run-node-test.mjs tests/mobspassive.test.ts` -> 121 passed.
- `node scripts/shot.mjs scripts/scenarios/mobspassive.json --url http://localhost:4213/ --server none`:
  the mob_*_34 / mob_pig / mob_cow / mob_sheep / mob_chicken reference poses match the Faithful
  reference captures within a pixel (pig: 6k px differ at 6% fuzz, all grass noise); variants,
  babies, professions, cat skins, collars, angry wolf, golem rose and the trading window checked.

## Hooks for other slices

- Zombie villager curing (mobshostile): `EntityList.createEntityByName('Villager')`, `initCreature()`,
  then `setLookingForHome()` (alias `func_82187_q()`), child -> `setGrowingAge(-24000)`.
- Pig lightning -> `EntityList.createEntityByName('PigZombie')` (no-op until it is registered).
- Golems from blocks: BlockPumpkin already calls `'SnowMan'` / `'VillagerGolem'` + `setPlayerCreated(true)`.
- Creeper avoiding ocelots: `new EntityAIAvoidEntity(creeper, (e) => EntityList.getEntityString(e) === 'Ozelot', 6, 0.25, 0.3)`.
- Monsters for golems: `Entity.isIMob` (EntityMob has it; slimes/ghasts must override too).
- `World.villageCollectionObj` (VillageCollection: findNearestVillage, addVillagerPosition,
  getVillageList), `World.villageSiegeObj`.
- Trading window: `EntityPlayer.displayGUIMerchant(merchant, name)` opens GuiMerchant on the local
  player (installed by src/gui/merchant/MerchantGui.ts, imported by PassiveMobRenderers.ts).

## Notes

- Restarted once after a usage limit; models/renderers were committed in the second session.
- Merchant GUI lives in src/gui/merchant/ (not src/gui/inventory/, owned by the inventory slice).
- AI tasks that hostile mobs also use (AttackOnCollide, ArrowAttack, AvoidEntity, HurtByTarget,
  NearestAttackableTarget, LeapAtTarget, MoveTwardsRestriction, MoveThroughVillage, DoorInteract,
  OpenDoor, Target, IRangedAttackMob, IMob) were written here; a parallel copy in the mobshostile
  slice would be an add/add conflict to resolve by keeping one.
