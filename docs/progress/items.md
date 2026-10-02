# Items agent progress (branch w1/items)

Resume notes for a restarted session: read `git log --oneline` on this branch and continue with
the first unchecked step.

- [x] potion data (src/potion: Potion, PotionEffect, PotionHelper)
- [x] enchantment data (src/enchantment: Enchantment, EnumEnchantmentType, EnchantmentHelper)
- [x] item base + tools/swords/hoes/armour/food
- [x] remaining item classes (placing, throwing, bow, potion, eggs, maps, books, records...)
- [x] ItemBlock subclasses + registerBlockItems exactly like Block's static init
- [x] Items registry with every 1.5.2 item (256-408 + records)
- [x] crafting recipes (all Recipes*), special recipes, FurnaceRecipes
- [x] node test for recipes/smelting (scripts/tests/crafting.test.ts)
- [x] GUI multi-pass/glint hooks, dev helper, scenario scripts/scenarios/items.json (+ item-icons.json)
- [x] screenshots compared with reference creative tab shots and new vanilla captures (scratchpad ref/extra/items: hotbar matches)

## Review fixes (second pass)

- [x] Entities from items: EntityList class + 1.5.2 constructor overloads (splash potion keeps its damage, painting picks a fitting art, fishing hook / egg via getClassForDebug); verified in a trial merge with w1/entities + w1/blocks + w1/worldgen.
- [x] PotionHooks filled from src/potion (src/potion/PotionBindings.ts, glob-imported); drinking regeneration activates the effect after the merge.
- [x] Eyes of ender: asynchronous StructureLocator (src/item/ItemBindings.ts -> StructureSearch.locate); eye flies to the stronghold in the trial merge.
- [x] Unbreaking: ItemStack.attemptDamageItem (1.5.2 uses the stack's own level; no bow destroyCurrentEquippedItem in 1.5.2).
- [x] Creative-only stack restore in PlayerControllerCreative.sendUseItem.
- [x] Map markers: (byte) wrap at the left/top edge, Math.imul Nether spin, item-frame marker (ItemStack.setItemFrame).
- [x] Held-item glint and bow / sword-block first-person poses (ItemRenderer).
- [x] EntityPlayer item-use code made textually identical to w1/entities (plus the 1.5.2 isRemote guard).

### Merge notes
- src/entity/EntityPlayer.ts vs w1/entities: take w1/entities' file, then add `&& !this.worldObj.isRemote` to the `--this.itemInUseCount === 0` line in onUpdate.
- src/item/Items.ts vs w1/blocks: keep this branch's registerBlockItems (src/item owns the block items); src/block/BlockItems.ts becomes unused and can be deleted.
- tests/placement.test.ts passes (21/21) against the real w1/blocks blocks in a trial merge.
