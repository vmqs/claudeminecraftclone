# merge-w1a progress

Order: w1/blocks, w1/items, w1/entities, w1/effects, w1/sky, w1/gui -> claude/minecraft-1-5-html-clone-wyzct1

- [x] blocks
- [x] items (Items.ts: took items registry; dropped src/block/BlockItems.ts duplicate, items ItemBlockVariants kept + fround)
- [x] entities (EntityPlayer: kept both; itemUse finish keeps !isRemote)
- [x] effects (clean)
- [x] sky (TESTING.md doc conflict only)
- [x] gui (DevTools both; EntityPlayerSP: gui overrides kept, onItemPickup dropped for entities collectEffect; GuiIngame: sky ScreenOverlays kept, gui duplicate pumpkin/portal removed)
- [ ] vite build
- [ ] wire cross-slice hooks / dedupe
- [ ] smoke test (title, spawn, interact + slice scenarios)
- [ ] ARCHITECTURE §13
