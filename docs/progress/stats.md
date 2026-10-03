# Stats / achievements slice (w4/stats) — progress

Plan (commit after each step):
1. [x] src/stats core: StatIds (worker-safe ids), StatBase/Achievement, StatList, AchievementList, StatFileWriter (localStorage per username) + node test
2. [x] GUIs: GuiAchievement toast + "Taking Inventory" hint, GuiAchievements map, GuiStats (General/Blocks/Items), pause menu buttons, Minecraft hooks
3. [x] Trigger hooks (EntityPlayer movement/jump/fall/drop/damage/kills/deaths/minutes, harvest, crafting/smelting/brewing, pickups, item use/break, mobs)
4. [x] Multiplayer: Packet200Statistic host -> guest, independent stats counted by the guest
5. [x] scripts/scenarios/stats.json, screenshots vs vanilla, docs

Notes:
- 1.5.2 GuiStats has only General / Blocks / Items (no Mobs tab, no per-mob kill stats: those came later).
- Done: vanilla captures of the same values in scratchpad ref/extra/stats (made with a private harness copy that adds a
  `stat ID AMOUNT` command); the map, tooltips and the three Statistics pages match them pixel for pixel apart from
  3D block icon edges (shared RenderItem) and the world behind the screens.
- Nether/End achievements (portal, theEnd, theEnd2) cannot be earned: there are no dimensions.
- 1.5.2 quirks kept: Q drops and death drops are not "Items Dropped" (integrated-server side); every world start
  counts a "Multiplayer join" (the client logs in to its integrated server).
