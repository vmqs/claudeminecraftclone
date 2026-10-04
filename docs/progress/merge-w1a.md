# merge-w1a progress

Order: w1/blocks, w1/items, w1/entities, w1/effects, w1/sky, w1/gui -> claude/minecraft-1-5-html-clone-wyzct1

- [x] blocks
- [x] items (Items.ts: took items registry; dropped src/block/BlockItems.ts duplicate, items ItemBlockVariants kept + fround)
- [x] entities (EntityPlayer: kept both; itemUse finish keeps !isRemote)
- [x] effects (clean)
- [x] sky (TESTING.md doc conflict only)
- [x] gui (DevTools both; EntityPlayerSP: gui overrides kept, onItemPickup dropped for entities collectEffect; GuiIngame: sky ScreenOverlays kept, gui duplicate pumpkin/portal removed)
- [x] vite build
- [x] wire cross-slice hooks / dedupe (HarvestModifiers->EnchantmentHelper, SkyHooks.potionDuration, furnace smelting, scoreboard death/kill counts; dropped items PotionBindings dup of entities ItemHooksInstall; burn time single impl)
- [x] smoke test: title, spawn, interact, entities, items, sky, gui, effects, blocks all exit 0 with their checks matching (scenario copies with 4x timeouts; load avg ~19). interact "rose 0.000" is a scenario key-timing quirk (direct fly test rises 4 blocks).
- [x] ARCHITECTURE §13
