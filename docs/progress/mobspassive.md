# mobspassive progress

Wave 2 slice: passive and neutral mobs (Pig, Cow, Sheep, Chicken, MushroomCow, Wolf, Ozelot,
Squid, Bat, Villager, VillagerGolem, SnowMan), their models/renderers, AI tasks, villages and the
villager trading GUI.

## Plan

1. [x] AI tasks (src/entity/ai/EntityAI*.ts), IMob selector, villages (src/world/village/) + World hook
2. [x] Mob entity classes + EntityList registration (src/entity/PassiveMobs.ts)
3. [x] Models + renderers (src/render/entity/Model*.ts, RenderPassiveMobs.ts, PassiveMobRenderers.ts)
4. [x] Merchant: GuiMerchant / ContainerMerchant / InventoryMerchant / SlotMerchantResult + displayGUIMerchant
5. [ ] Self-review of classes vs 1.5.2 (spawn rules, interactions, drops, sounds)
6. [~] Node logic test (tests/mobspassive.test.ts) done; scenario scripts/scenarios/mobspassive.json, screenshots

## Notes
- Restarted once after a usage limit; models/renderers were committed in the second session.
- tests/mobspassive.test.ts: 121 checks pass (node scripts/run-node-test.mjs tests/mobspassive.test.ts).
- Merchant GUI lives in src/gui/merchant/ (not src/gui/inventory/, owned by the inventory slice).
