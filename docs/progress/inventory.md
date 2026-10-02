# Wave 2 inventory slice: progress

Branch w2/inventory from 96e8639. Commit after each step.

## Plan
1. [ ] GuiContainerCreative + ContainerCreative + SlotCreativeInventory + InventoryEffectRenderer; GuiInventory switches like 1.5.2
2. [ ] sendSlotPacket (creative set-slot), pick block (creative flag, entities)
3. [ ] Container GUIs: furnace, dispenser/dropper, hopper, brewing stand, enchantment, anvil, beacon; BlockGuiHooks + displayGUI*
4. [ ] Item rendering review (RenderItem GUI/dropped, ItemRenderer first person incl. map)
5. [ ] Scenario scripts/scenarios/inventory.json + node tests
