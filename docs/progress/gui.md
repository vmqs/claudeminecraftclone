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
| G7 | Loading/transition screens (quit: shutting down / saving), GuiIngameMenu, GuiShareToLan | todo |
| G8 | HUD / F3 vs references (all lines, profiler chart, record message, GUI scales) | todo |
| G9 | Chat: links + GuiConfirmOpenLink, options, history | todo |
| G10 | Commands: full 1.5.2 singleplayer set with lang messages, cheats gating | todo |
| G11 | GuiEditSign via the sign GUI hook | todo |
| G12 | FontRenderer completeness (random style, unicode, anaglyph colours) | todo |
| G13 | Video settings: anaglyph, fullscreen/vsync labels, layout check | todo |
| G14 | scripts/scenarios/gui.json + screenshot comparisons | todo |
