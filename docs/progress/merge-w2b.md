# merge-w2b progress

Order: w2/survival, w2/player, w2/renderblocks, w2/inventory, w2/mobshostile, w2/mobspassive, w2/dynamics -> claude/minecraft-1-5-html-clone-wyzct1
(Merge current heads; renderblocks/inventory/mobshostile/mobspassive/dynamics were already fully merged by merge-w2a at start: 0 commits ahead.)

- [x] survival (1e9fb57): CommandGameMode.applyGameType/gameTypeOf (HEAD gui fix) superseded by EnumGameType + PlayerSpawning.captureState/restoreState; kept HEAD pickBlock (already creative-gated) and dev ?structures/preset/bonus + survival ?mode; GuiIngame prevHealth 0 + Math.imul seed
- [x] player (e28b09d): EntityPlayer kept one spawnChunk/getBedLocation/setSpawnChunk (player's, protected) + survival FoodStats/CombatTracker/gameType; InventoryEffectRenderer add/add -> player's (HashMap order, **:**); respawn = survival PlayerSpawning.respawn after BedRespawn.loadChunksAroundBed (respawnAtBedLocation dropped), PlayerSpawning.verifyRespawnCoordinates delegates to EntityPlayer's; RenderPlayer fishing stick + full3D offset/tint + sleep pose; canSprint survival food gate
- [x] renderblocks/inventory/mobshostile/mobspassive/dynamics: still 0 commits ahead (heads f9240f5 69da6ec 2f67ec4 f13d43d 527b977), nothing to merge
- [x] vite build
- [ ] wire hooks / dedupe
- [ ] smoke test
- [ ] ARCHITECTURE §13
