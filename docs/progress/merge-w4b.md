# merge-w4b progress

Order: w4/persistence, w4/perf, w4/stats, w4/account, w4/controls -> claude/minecraft-1-5-html-clone-wyzct1 (base 2317016)
account (64215f9) and controls (25aaa36) were already merged by merge-w4a; nothing new on them at start.

- [x] persistence (834e4dc): conflicts README, TESTING, DevTools (all unions with account+controls); tsc ok
- [x] perf (fd28b1d): conflicts NextTickListEntry (perf's scheduler kept; persistence's entriesInChunk dropped for perf's inChunk, World.getPendingBlockUpdates uses it), ChunkProviderClient (saved-chunk loop + perf's indexed queue; loadSavedChunkNow + queueStats; replaceChunk marks the chunk modified so a save holding the early copy is rewritten), DevTools, ARCHITECTURE §13, TESTING; tsc ok
- [x] stats (ae7e207): conflicts Minecraft.launchIntegratedServer (noteWorldLaunch after the saveController.closing wait so a deferred launch counts once), entity imports (NBT + StatIds), DevTools, ARCHITECTURE (GUI list + §13 rows), TESTING; PROTOCOL_VERSION 2 (only stats bumped); tsc ok
- [x] account / controls: heads 64215f9 / 25aaa36 already merged (0 new commits)
- [x] vite build (after restoring node_modules and public/assets, see Incident)
- [x] wire hooks / dedupe: chunk compression+writes run as IdleTasks "save.chunks" (was pump(4) per tick); TileTicks read through perf's TickScheduler.inChunk (entriesInChunk removed); replaced early chunks marked modified; noteWorldLaunch after closing wait. Node: persistence 107, stats 76, tickscheduler 2, frame-budget 10 pass
- [x] smoke test: title, spawn, interact, persistence, stats scenarios exit 0 (shots-merge-w4b); perf.json needs a baseline build on :5222 (not run, single-port rule) so its Node goldens ran instead: worldgen-golden 4, mesher-golden 18, worldgen-worker 8 pass
- [ ] ARCHITECTURE §13

Incident: w4/persistence (43e8863) committed the worktree's `node_modules` and `public/assets`
symlinks; merging it replaced the main checkout's real (ignored) directories with self-pointing
links, which every worktree links to. Fixed: links untracked, `.gitignore` gains `/node_modules`
and `/public/assets` (no trailing slash, so links match), `npm ci` and `scripts/fetch-assets.mjs`
restored both. tsc and vite build re-run on the restored tree: pass.
