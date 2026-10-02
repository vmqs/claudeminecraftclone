# Wave 2 inventory slice: progress

Branch w2/inventory from 96e8639. Commit after each step.

## Done
1. [x] GuiContainerCreative + ContainerCreative + SlotCreativeInventory + InventoryEffectRenderer; GuiInventory switches like 1.5.2
2. [x] sendSlotPacket (creative set-slot), pick block (creative flag, entities) in src/client/PickBlock.ts
3. [x] Container GUIs: furnace, dispenser/dropper, hopper (+minecart), brewing stand, enchantment (ModelBook, galactic font), anvil, beacon; opened by EntityPlayerSP.displayGUI* (BlockGuiHooks fallback)
4. [x] First-person map (MapItemRenderer); RenderItem/ItemRenderer reviewed against 1.5.2
5. [x] tests/containers.test.ts (35 checks)
6. [ ] scripts/scenarios/inventory.json browser run + compare with reference shots (claude_creative_*, claude_held_*)
