# Stats / achievements slice (w4/stats) — progress

Plan (commit after each step):
1. [x] src/stats core: StatIds (worker-safe ids), StatBase/Achievement, StatList, AchievementList, StatFileWriter (localStorage per username) + node test
2. [x] GUIs: GuiAchievement toast + "Taking Inventory" hint, GuiAchievements map, GuiStats (General/Blocks/Items), pause menu buttons, Minecraft hooks
3. [x] Trigger hooks (EntityPlayer movement/jump/fall/drop/damage/kills/deaths/minutes, harvest, crafting/smelting/brewing, pickups, item use/break, mobs)
4. [x] Multiplayer: Packet200Statistic host -> guest, independent stats counted by the guest
5. [ ] scripts/scenarios/stats.json, screenshots vs vanilla, docs

Notes:
- 1.5.2 GuiStats has only General / Blocks / Items (no Mobs tab, no per-mob kill stats: those came later).
