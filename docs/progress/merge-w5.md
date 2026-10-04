# merge-w5 progress

Order: w5/dimensions, w5/nether, w5/end -> claude/minecraft-1-5-html-clone-wyzct1 (base 074d554)

- [x] dimensions (79b9426): clean merge; tsc ok
- [x] nether (1139bdc): conflicts DimensionGenerators (add/add), WorldGenServer, GenWorld, terrain/worldgen workers, protocol, ChunkProviderClient -> dimensions side + NetherRegistration import kept in WorldGenServer and terrain worker; DevTools, TESTING, ARCHITECTURE unions; tsc ok
- [x] end (0704b01): conflicts plumbing -> dimensions side + EndRegistration import + end spawn rule; BlockEndPortal -> travelToDimension(1); PlayerSpawning keepEverything || conquered; NetClientHandler GameEvent 4 via showWinGame; LanServer respawn (dims) + getEntityById per world with dragon parts; EntityPlayerMP duplicate playerConqueredTheEnd removed; DevTools, TESTING unions; tsc ok
- [x] vite build (after end merge)
- [x] wire hooks / dedupe (697ea0a): exit portal = travelToDimension(1) only (EndPortalHooks + WinGame.ts removed; PlayerTravel sets playerConqueredTheEnd; mc.dev.end.exitPortal travels); ?dim=N travels from the overworld instead of relabelling the provider; arrival restarts the portal cooldown (SP + LAN); end.json respawn asserted in the overworld, Wither built there; tests end 1301, dimensions 66, netdimensions 15, nether-golden 11, nether-spawning 12, nether-blocks 11, survival/player/stats/persistence/netprotocol/netsession/worldgen-golden/worldgen-worker pass
- [x] smoke test: title, spawn, interact, dimensions, nether, end exit 0 (shots-merge-w5). end.json fixes: exitPortal() runs a tick (trip is deferred, game frozen by sky.pin), the clock unfreezes before Escape and the respawn is awaited in the overworld (dims.arrived), the first wait also waits for the dragon (the End now loads around the entrance, not a pre-generated spawn area)
- [ ] ARCHITECTURE §13
