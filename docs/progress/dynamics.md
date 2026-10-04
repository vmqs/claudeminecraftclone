# Dynamics slice progress (w2/dynamics)

Owner: dynamic block behaviour (updateTick / random ticks / onBlockAdded / fertilize), fluids,
falling blocks, growth, spreading, decay, fire, melting, farmland, golems, sapling trees.

## Status
- [x] Survey: fluids (BlockFlowing/BlockStationary/BlockFluid), EntityFallingSand, grass,
      leaves decay, pumpkin golems, portal frames, snow/ice melting were already ported by
      wave 1 and match 1.5.2 (re-checked line by line).
- [x] Dragon egg falling, mycelium spreading (WIP commit).
- [x] Crops / stems (fruit placement) / nether wart / cocoa growth, farmland moisture, vines.
- [x] Fire updateTick (ageing, rain, burnout, burning + TNT priming, spreading); Entity.setInPortal.
- [x] Block.initializeBlock called from finishBlockRegistry (fire burn tables were empty).
- [x] Saplings: faithful growTree (big oak 1/10, taiga2, forest, 2x2 huge jungle) and
      BlockMushroom.fertilizeMushroom via src/world/WorldGenRegistry.ts, filled by
      src/world/BlockDynamicsInstall.ts (import.meta.glob of world/gen/feature/WorldGen*.ts).
- [x] tests/dynamics.test.ts (node, real World): water/lava flow shapes, infinite source,
      lava+water, sand/gravel, leaf decay, saplings, fire, crops, farmland, stems, flood perf.
- [x] Reviewed against 1.5.2: cactus, reed, flowers, torch, redstone ore, TNT, cauldron rain,
      snow/ice forming (World.tickBlocksAndAmbiance), anvil landing; all match.
- [x] Node tests extended (weather, melting, cactus/reed/vines, portal, golem patterns, cocoa, wart).
- [x] Vanilla reference: ref/extra/dynamics/dyn_fluids_t{12,50,700}.png (scenario + block list in
      scratchpad/dyn/, run with vanilla-rb/run-scenario.sh which has `setblocks`).
- [x] scripts/scenarios/dynamics.json browser run: fluid shots t12/t50/t700 line up with the vanilla
      captures (outlines identical at t700 with `compare -fuzz 6%`; the only t50 difference is the
      waterfall pool's last ring, which appears at tick 55, i.e. the vanilla harness's tick offset).
      Fire burns the house down (141 -> 9 planks), portal lights, saplings grow (fallback generators
      until world/gen/feature merges), leaves decay after cutting trunks (214 -> 135), bone meal on
      grass gives tall grass + flowers, snow accumulates in a cold biome during rain.
- [x] Trial merge with the dev branch (worldgen merged): typecheck and build pass, the glob picks up
      WorldGenBigTree/Forest/Taiga2/HugeTrees/BigMushroom, and every sapling type (incl. the 2x2
      huge jungle) and both huge mushrooms grow with the real generators.
