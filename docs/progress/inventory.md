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
9. [ ] Browser run 3 (last allowed): held items at yaw/pitch 0, bow/eat/block/glint, third person,
   all 12 tabs, F3+H tooltip, every container within reach, chest lid + sounds, ender chest sharing,
   shift-click crafting, hotbar keys, Q / Ctrl+Q, pick block, dropped item stacks
