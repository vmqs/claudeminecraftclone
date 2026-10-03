# Persistence slice progress (w4/persistence)

Plan (commit after each step):
1. [x] NBT codec (typed plain-object tags, binary read/write, gzip/zlib via fflate) + tests
2. [x] Region file codec (.mca) + tests
3. [x] Anvil chunk NBT (write/read) + level.dat (WorldInfo) + player NBT
4. [x] Entity NBT: Entity/EntityLiving/EntityPlayer + every entity class; tile entities typed
5. [x] IndexedDB save handler, ChunkProviderClient hook (load saved chunks, save on unload)
6. [x] Minecraft lifecycle: load on open, autosave 900 ticks, Save and Quit, Saving level screens
7. [x] World list from storage (sort, rename, delete, re-create), persist across reloads
8. [x] Import/export .zip (1.5.2 save folder) + validation + error screen
9. [x] Node tests, scenario scripts/scenarios/persistence.json, docs

Notes:
- Steps 1-8 committed: NBT/region codecs, entity + tile entity NBT, AnvilChunkLoader, WorldInfoNBT,
  SaveBackend (IndexedDB + memory), SaveHandler (queue, pump, flush), SaveFormat (list), WorldSaveController
  (autosave 900 ticks, save on pause, Save and Quit with "Saving level"), GuiSelectWorld import/export.
- Next: Node tests (chunk/entity/tile round trips, save/load flow over MemoryBackend, zip export/import),
  dev hooks (mc.dev.saves), scenario persistence.json, docs.
- Browser run 1 (scripts/scenarios/persistence.json): all assertions pass (build, quit, reload,
  list, reopen, export/import round trip, delete). Shots in scratchpad/shots-persistence.
- Vanilla interop (scratchpad/interop): a world exported here opens in 1.5.2 (shot
  ref/extra/persistence/interop_export_loaded.png); 1.5.2's re-save of it and a 1.5.2-created world
  import here with chest/sign/sheep/player intact (checkimport.ts).
- Docs: ARCHITECTURE §1, §3, §5.2, §5.7 (new), §8.1, §9, §13 row "Saving"; TESTING sections.
- Later: maps/idcounts, villages.dat, scoreboard.dat (WorldData.ts, worldDataFiles hook), needsSaving
  for autosave/quit, session.lock (two tabs), retry backoff, player Pos saved at the feet like
  EntityPlayerMP (found by importing 1.5.2's re-save: the player was put 1.62 blocks into the ground).
- Browser runs used: 3 of 3. Run 3: every step of persistence.json passes; the extra (uncommitted)
  step importing 1.5.2's re-save of an exported world loads it with the player on the ground, the
  sign, inventory and xp (its health check was too strict: the player had regenerated to 16).
- Vanilla harness: the export opens in 1.5.2 with the player exactly at its saved feet position
  (ref/extra/persistence/interop2_export_loaded_f3.png).
- DONE. Known limits: guests' own data is not written to players/ (rejoin tokens stay in memory);
  exported worlds have no chunks beyond what was loaded, so 1.5.2 populates the next ring itself.
