# merge-w2a progress

Order: w2/renderblocks, w2/inventory, w2/mobshostile, w2/mobspassive, w2/dynamics -> claude/minecraft-1-5-html-clone-wyzct1
(Merge current heads; a later pass merges newer fix commits.)

- [x] renderblocks (clean)
- [x] inventory (EntityPlayerSP: kept inventory displayGUI* overrides, HEAD keeps canCommandSenderUseCommand/displayGUIEditSign at end; ARCH: HEAD potions/entities rows + inventory containers row)
- [ ] mobshostile
- [ ] mobspassive
- [ ] dynamics
- [ ] vite build
- [ ] wire hooks / dedupe
- [ ] smoke test: title, spawn, interact + slice scenarios
- [ ] ARCHITECTURE §13
