# Items agent progress (branch w1/items)

Resume notes for a restarted session: read `git log --oneline` on this branch and continue with
the first unchecked step.

- [ ] potion data (src/potion: Potion, PotionEffect, PotionHelper)
- [ ] enchantment data (src/enchantment: Enchantment, EnumEnchantmentType, EnchantmentHelper)
- [ ] item base + tools/swords/hoes/armour/food
- [ ] remaining item classes (placing, throwing, bow, potion, eggs, maps, books, records...)
- [ ] ItemBlock subclasses + registerBlockItems exactly like Block's static init
- [ ] Items registry with every 1.5.2 item (256-408 + records)
- [ ] crafting recipes (all Recipes*), special recipes, FurnaceRecipes
- [ ] node test for recipes/smelting (scripts/tests/crafting.test.ts)
- [ ] GUI multi-pass/glint hooks, dev helper, scenario scripts/scenarios/items.json
- [ ] screenshots compared with reference creative tab shots
