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
9. [ ] Node tests, scenario scripts/scenarios/persistence.json, docs

Notes:
- Steps 1-8 committed: NBT/region codecs, entity + tile entity NBT, AnvilChunkLoader, WorldInfoNBT,
  SaveBackend (IndexedDB + memory), SaveHandler (queue, pump, flush), SaveFormat (list), WorldSaveController
  (autosave 900 ticks, save on pause, Save and Quit with "Saving level"), GuiSelectWorld import/export.
- Next: Node tests (chunk/entity/tile round trips, save/load flow over MemoryBackend, zip export/import),
  dev hooks (mc.dev.saves), scenario persistence.json, docs.
