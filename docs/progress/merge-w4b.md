# merge-w4b progress

Order: w4/persistence, w4/perf, w4/stats, w4/account, w4/controls -> claude/minecraft-1-5-html-clone-wyzct1 (base 2317016)
account (64215f9) and controls (25aaa36) were already merged by merge-w4a; nothing new on them at start.

- [x] persistence (834e4dc): conflicts README, TESTING, DevTools (all unions with account+controls); tsc ok
- [x] perf (fd28b1d): conflicts NextTickListEntry (perf's scheduler kept; persistence's entriesInChunk dropped for perf's inChunk, World.getPendingBlockUpdates uses it), ChunkProviderClient (saved-chunk loop + perf's indexed queue; loadSavedChunkNow + queueStats; replaceChunk marks the chunk modified so a save holding the early copy is rewritten), DevTools, ARCHITECTURE §13, TESTING; tsc ok
- [x] stats (ae7e207): conflicts Minecraft.launchIntegratedServer (noteWorldLaunch after the saveController.closing wait so a deferred launch counts once), entity imports (NBT + StatIds), DevTools, ARCHITECTURE (GUI list + §13 rows), TESTING; PROTOCOL_VERSION 2 (only stats bumped); tsc ok
- [ ] account / controls (re-check heads)
- [ ] vite build
- [ ] wire hooks / dedupe
- [ ] smoke test
- [ ] ARCHITECTURE §13
