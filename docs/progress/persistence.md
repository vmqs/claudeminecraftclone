# Persistence slice progress (w4/persistence)

Plan (commit after each step):
1. [ ] NBT codec (typed plain-object tags, binary read/write, gzip/zlib via fflate) + tests
2. [ ] Region file codec (.mca) + tests
3. [ ] Anvil chunk NBT (write/read) + level.dat (WorldInfo) + player NBT
4. [ ] Entity NBT: Entity/EntityLiving/EntityPlayer + every entity class; tile entities typed
5. [ ] IndexedDB save handler, ChunkProviderClient hook (load saved chunks, save on unload)
6. [ ] Minecraft lifecycle: load on open, autosave 900 ticks, Save and Quit, Saving level screens
7. [ ] World list from storage (sort, rename, delete, re-create), persist across reloads
8. [ ] Import/export .zip (1.5.2 save folder) + validation + error screen
9. [ ] Node tests, scenario scripts/scenarios/persistence.json, docs

Notes:
