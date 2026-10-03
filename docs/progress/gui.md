# GUI agent progress (branch w1/gui)

A restarted agent resumes from the first item not marked done. Status: todo, wip, done, skipped (reason).

| ID | Item | Status |
|---|---|---|
| G1 | Options sub-screens: GuiControls (rebinding, red duplicates), GuiSnooper, GuiScreenChatOptions | done |
| G2 | GuiLanguage + language switching (en_US fallback, unicode font, re-translation) | done (bidi reorder for ar_SA/he_IL too) |
| G3 | GuiTexturePacks (Default + bundled packs, pack.png icons, reload) | done |
| G4 | Main menu: language/multiplayer buttons, GuiMultiplayer (empty list, add/direct connect graceful), Minceraft | done (Minceraft already ported) |
| G5 | In-memory world list: GuiSelectWorld, GuiWorldSlot, GuiRenameWorld, GuiYesNo, Re-Create | done (src/world/storage/SaveFormatMemory.ts; ChunkProviderClient.suspend/adoptStore) |
| G6 | GuiCreateWorld complete (Survival/Hardcore/Creative cycle per user request, cheats, bonus chest flag, Customize) | done (bonus chest generation is the server/worldgen side: WorldSettings.bonusChest) |
| G7 | Loading/transition screens (quit: shutting down / saving), GuiIngameMenu, GuiShareToLan | done (1.5.2 quit shows only an empty dirt frame) |
| G8 | HUD / F3 vs references (all lines, profiler chart, record message, GUI scales) | done (survival bars, boss bar, TAB list, sidebar, sleep/portal/pumpkin overlays; title/options match refs at scales 1-3) |
| G9 | Chat: links + GuiConfirmOpenLink, options, history | done |
| G10 | Commands: full 1.5.2 singleplayer set with lang messages, cheats gating | done (incl. /scoreboard + sidebar/TAB list) |
| G11 | GuiEditSign via the sign GUI hook | done (EntityPlayerSP.displayGUIEditSign) |
| G12 | FontRenderer completeness (random style, unicode, anaglyph colours) | done (verified vs original; anaglyph colours skipped with G13) |
| G13 | Video settings: anaglyph, fullscreen/vsync labels, layout check | skipped anaglyph rendering (needs EntityRenderer/texture changes outside gui); layout matches |
| G14 | scripts/scenarios/gui.json + screenshot comparisons | done (options/controls/language/gui3 options: 0 px diff; pinned title: 22 px) |

## Hooks this area provides (for other agents / later waves)

- `GuiIngame.playerListProvider` - multiplayer TAB list rows (name, ping); null = singleplayer list.
- `GuiIngame.scoreboardOverlay` - scoreboard display slots (default: `src/gui/ScoreboardOverlay.ts`).
- `getScoreboard(world)` (`src/command/scoreboard/Scoreboard.ts`) - `increaseScores(ScoreObjectiveCriteria.deathCount|playerKillCount|totalKillCount, name)` on deaths/kills; slot 2 (`belowName`) for name tags.
- `BossStatus.setBossStatus(boss, flag)` (`src/gui/BossStatus.ts`) - dragon/wither renderers.
- `CommandGameMode.gameTypeListener` - the player controller follows /gamemode; `WorldSettings.gameType`/`hardcore` from Create World.
- `EntityPlayerSP.displayGUIEditSign(te)` opens `GuiEditSign` (TileEntitySign: signText[4], lineBeingEdited, setEditable).
- `GuiSleepMP` opens while `isPlayerSleeping()`; Leave Bed calls `wakeUpPlayer(false, true, true)`.
- Survival HUD reads optional `getFoodStats()`, `xpBarCap()`, `getSleepTimer()`, `isPotionActive(id)` on the player.
