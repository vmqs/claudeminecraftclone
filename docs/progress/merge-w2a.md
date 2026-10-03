# merge-w2a progress

Order: w2/renderblocks, w2/inventory, w2/mobshostile, w2/mobspassive, w2/dynamics -> claude/minecraft-1-5-html-clone-wyzct1
(Merge current heads; a later pass merges newer fix commits.)

- [x] renderblocks (clean)
- [x] inventory (EntityPlayerSP: kept inventory displayGUI* overrides, HEAD keeps canCommandSenderUseCommand/displayGUIEditSign at end; ARCH: HEAD potions/entities rows + inventory containers row)
- [x] mobshostile (clean)
- [x] mobspassive (10 add/add AI files: took passive versions — real Village types, 1.5.2 ctor overloads, targetClassName for IronGolem canAttackClass — plus AttackOnCollide.forClass and TargetClass widened to boolean predicates with isLivingEntity filter for hostile callers)
- [x] dynamics (ARCH open-gaps paragraph only)
- [x] vite build
- [x] wire hooks / dedupe (hooks resolve by name/duck typing: spawner cage, egg pick, golems, villager cure, isIMob, merchant, portal pigmen, WorldGenRegistry glob; dedupe: renderMobHeldItem -> renderHeldItem(full3DOffset, tintPasses player-only), ModelBook one copy). Node suites: renderblocks 7320, containers 42, mobshostile 78, mobspassive 121 (1 intermittent fail seen once in 8 runs), dynamics 55, crafting/items/placement pass
- [x] smoke test (all exit 0): title, spawn, interact; renderblocks (beacon active in browser, spawner shows Pig, scenario now purges natural spawns + holds the spawner off + clears particles before the TE capture, which then matches the vanilla layout); inventory (all evals; 3D chest/fence/anvil icons; survival tab bg present); mobshostile (creative ignored, no lasting revenge, spawner spawns); mobspassive (milk/shear/tame/trade ok, golemTargetsCreative false); dynamics (counts ok; spruce sometimes blocked by a WorldGenBigTree oak 4 blocks away - faithful 1-in-10 roll, layout issue)
- [x] ARCHITECTURE §13 (block rendering, tile entities, entities rows + wave-2 merge paragraph)

Notes for later passes: tests/mobspassive.test.ts failed 1 check once in ~20 runs (unseeded World/entity RNG; not reproduced). New superflat worlds hold ~79 slimes (monster cap) + ~68 animals after the tick-0 creature round - matches 1.5.2's once-per-round cap check; scenarios comparing fixed layouts must purge mobs. Dynamics scenario saplings are 4 apart, so a big oak can block the spruce.
