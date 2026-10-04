# End slice progress (w5/end)

Owner: End generation, Ender Dragon, ender crystals, end portal activation, GuiWinGame, Wither.

## Plan
1. [ ] ChunkProviderEnd + WorldGenSpikes + End decorator (dragon descriptor at chunk 0,0); generator registry by dimension id
2. [ ] EntityDragon + EntityDragonPart + ModelDragon + RenderDragon (beam, eyes, death rays, dissolve, hurt flash), boss bar, death, exit portal + egg
3. [ ] EntityEnderCrystal fidelity (server-only explosion, health watcher)
4. [ ] GuiWinGame (win.txt + credits.txt), exit portal entry -> win -> respawn keeping inventory, The End. achievement
5. [ ] EntityWither + ModelWither + RenderWither (invul shield, armor layer), summoning check, skull projectiles
6. [ ] Node tests (end terrain hash, spikes, portal frame activation, dragon parts), scenario end.json, captures

## Notes
- Base 074d554. No dimension plumbing in base: dev path `?dim=1` (see report) only for testing.
