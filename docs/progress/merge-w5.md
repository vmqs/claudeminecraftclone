# merge-w5 progress

Order: w5/dimensions, w5/nether, w5/end -> claude/minecraft-1-5-html-clone-wyzct1 (base 074d554)

- [x] dimensions (79b9426): clean merge; tsc ok
- [x] nether (1139bdc): conflicts DimensionGenerators (add/add), WorldGenServer, GenWorld, terrain/worldgen workers, protocol, ChunkProviderClient -> dimensions side + NetherRegistration import kept in WorldGenServer and terrain worker; DevTools, TESTING, ARCHITECTURE unions; tsc ok
- [x] end (0704b01): conflicts plumbing -> dimensions side + EndRegistration import + end spawn rule; BlockEndPortal -> travelToDimension(1); PlayerSpawning keepEverything || conquered; NetClientHandler GameEvent 4 via showWinGame; LanServer respawn (dims) + getEntityById per world with dragon parts; EntityPlayerMP duplicate playerConqueredTheEnd removed; DevTools, TESTING unions; tsc ok
- [ ] vite build
- [ ] wire hooks / dedupe
- [ ] smoke test (title, spawn, interact, dimensions, nether, end)
- [ ] ARCHITECTURE §13
