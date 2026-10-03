# Wave 2 inventory slice: progress

Branch w2/inventory from 96e8639. Commit after each step.

## Done
1. [x] GuiContainerCreative + ContainerCreative + SlotCreativeInventory + InventoryEffectRenderer; GuiInventory switches like 1.5.2
2. [x] sendSlotPacket (creative set-slot), pick block (creative flag, entities) in src/client/PickBlock.ts
3. [x] Container GUIs: furnace, dispenser/dropper, hopper (+minecart), brewing stand, enchantment (ModelBook, galactic font), anvil, beacon; opened by EntityPlayerSP.displayGUI* (BlockGuiHooks fallback)
4. [x] First-person map (MapItemRenderer); RenderItem/ItemRenderer reviewed against 1.5.2
5. [x] tests/containers.test.ts (42 checks, incl. brewing water -> awkward -> swiftness -> splash)
6. [x] Browser runs 1+2: creative tabs/tooltips match the references (only the chest/ender chest/fence/anvil
   item icons differ: block-as-item render types owned by renderblocks); the held-item shots were taken
   after a stray mouse move (camera looking up) and the container windows closed themselves because the
   scenario ticked the furnace outside the world tick and placed blocks out of reach -> scenario rewritten.
7. [x] Brewing stand / beacon rules were never installed: src/gui/inventory/ContainerBindings.ts (imported by main.ts)
8. [x] Third person: a player with a cast fishing line holds a stick (RenderBiped.renderHeldItem)
9. [x] Browser run 3 (last allowed; shots in scratchpad/shots-inventory3): held stone/sword/torch/log match
   claude_held_* / claude_hotbar_held_stone pixel for pixel on the item (face brightness identical); third
   person front matches claude_thirdperson_front; tabs 1-11 + tooltips within 1.4-2.9 mean abs diff of the
   references (left: chest/trapped/ender chest, fence, anvil item icons = renderblocks' block-as-item types,
   glint timing); all scripted checks passed (creative clicks, destroy slot, search, furnace smelt + lit swap,
   chest lid + sounds, ender chest shared, shift-click crafting 3 logs -> 12 planks, enchant offers, anvil
   repair, brewing 400 ticks -> awkward, hotbar keys/wheel, Q, Ctrl+Q, pick block lit furnace -> furnace).
10. [x] Run 3 showed the Survival Inventory tab without its background: the texture had not finished
   loading (asynchronous here, synchronous in 1.5.2). Container/creative textures are now warmed in the
   background at start-up (src/gui/inventory/ContainerTextures.ts, one line in Minecraft.startGame).
11. [x] Final self-review (resumed session): furnace tick/burn times, RenderItem (GUI, glint, damage bar,
   dropped fancy/fast copies), ItemRenderer (sprites, glint, eat/drink, bow, block, bare arm, overlays),
   third-person held items, creative clicks/search/survival tab layout and pick block re-read against the
   1.5.2 source: no differences found. tsc, vite build and the four Node suites pass. No browser run
   left (3 of 3 used); the Survival Inventory tab background fix (texture warm-up) is unverified on screen.
