# merge-w2a progress

Order: w2/renderblocks, w2/inventory, w2/mobshostile, w2/mobspassive, w2/dynamics -> claude/minecraft-1-5-html-clone-wyzct1
(Merge current heads; a later pass merges newer fix commits.)

- [x] renderblocks (clean)
- [x] inventory (EntityPlayerSP: kept inventory displayGUI* overrides, HEAD keeps canCommandSenderUseCommand/displayGUIEditSign at end; ARCH: HEAD potions/entities rows + inventory containers row)
- [x] mobshostile (clean)
- [x] mobspassive (10 add/add AI files: took passive versions — real Village types, 1.5.2 ctor overloads, targetClassName for IronGolem canAttackClass — plus AttackOnCollide.forClass and TargetClass widened to boolean predicates with isLivingEntity filter for hostile callers)
- [x] dynamics (ARCH open-gaps paragraph only)
- [ ] vite build
- [ ] wire hooks / dedupe
- [ ] smoke test: title, spawn, interact + slice scenarios
- [ ] ARCHITECTURE §13
