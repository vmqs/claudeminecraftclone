# Blocks agent progress (w1/blocks)

Resume from the first step not marked done. Each step is one or more commits.

| Step | Scope | Status |
|---|---|---|
| 1 | Infrastructure: World.addBlockEvent, BlockGuiHooks, TileEntity registry helpers, InventoryLargeChest, power helper | done |
| 2 | Tile entity data classes (all 19 ids) | done |
| 3 | Simple cube blocks (storage, ores, bookshelf, netherrack, soul sand, glowstone, snow block, melon, mycelium, stone brick, quartz, lamps, silverfish, mushroom caps, pumpkins, workbench, web, command block, sponge, nether brick, end stone) | done |
| 4 | Slabs, stairs, fences, walls, panes, fence gates | done |
| 5 | Plants: crops, carrots, potatoes, nether wart, stems, cocoa, vine, lily pad, farmland | done |
| 6 | Doors, trapdoors, ladders, signs, levers, buttons, pressure plates, rails, redstone wire/torches/repeaters/comparators, daylight sensor, tripwire | done |
| 7 | Containers: chest, ender chest, furnace, dispenser, dropper, hopper, brewing stand, enchanting table, anvil, beacon, jukebox, note block, spawner, cauldron, flower pot, skull, pistons | done |
| 8 | Bed, cake, dragon egg, TNT, fire, portal, end portal (+frame); all 158 ids registered, static dump matches vanilla except item classes | done |
| 9 | Block items registration (multi-texture), pick block, review vs Block.java table; world-state and behaviour dumps vs the 1.5.2 jar (bounds, textures, colours, collision, ray traces, placement, activation, drops, neighbour updates, display ticks) | done |
| 10 | scripts/scenarios/blocks.json, screenshots, fixes (all scenario assertions pass) | done |
| 11 | Survival harvest path: HarvestModifiers (silk touch / fortune hooks), addExhaustion/addStat via optional player methods | done |

## Verification tooling (scratchpad, not committed)

Java dumps run against the real 1.5.2 jar with a fake world; TS dumps run the same queries on
the TS blocks; the outputs are diffed line by line. Remaining behaviour differences are
deliberate: the dragon egg also draws its particle trail (one world plays client and server),
spawner block event 1 resets the delay locally, redstone wire/torch/lamp logic stays off, and
fluid mixing smoke uses Math.random in the original too.
