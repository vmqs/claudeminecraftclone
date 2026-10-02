/**
 * Item registry checks: names, stack sizes, durability, damage, creative lists, potions,
 * enchantments. Run: node scripts/run-node-test.mjs tests/items.test.ts
 * (loads lang/en_US.lang from public/assets/vanilla when present).
 */
import { existsSync, readFileSync } from 'node:fs';
import '../src/block/Blocks';
import { ItemIds as I } from '../src/block/BlockIds';
import { I18n } from '../src/core/I18n';
import { Enchantment } from '../src/enchantment/Enchantment';
import { EnchantmentData } from '../src/enchantment/EnchantmentHelper';
import { EntityList } from '../src/entity/EntityList';
import { CreativeTabs } from '../src/item/CreativeTabs';
import { EnumRarity, Item } from '../src/item/Item';
import { getAllCreativeItems, Items } from '../src/item/Items';
import { ItemStack } from '../src/item/ItemStack';
import { PotionHelper } from '../src/potion/PotionHelper';
import { check, report } from './harness';
import { JavaRandom } from '../src/core/JavaRandom';
import type { EntityLiving } from '../src/entity/EntityLiving';

const lang = 'public/assets/vanilla/lang/en_US.lang';
const haveLang = existsSync(lang);
if (haveLang) I18n.load(readFileSync(lang, 'utf8'));

const name = (id: number, d = 0) => new ItemStack(id, 1, d).getDisplayName();
const item = (id: number) => Item.itemsList[id]!;

// Every item id of 1.5.2 exists, nothing else above 255.
const ids: number[] = [];
for (let id = 256; id < 32000; id++) if (Item.itemsList[id]) ids.push(id);
check('153 items + 12 records', ids.length === 165 && ids[0] === 256 && ids[152] === 408 && ids[153] === 2256 && ids[164] === 2267, `${ids.length}`);
void Items;

// Stack sizes and durability (EnumToolMaterial / EnumArmorMaterial).
const maxDamage: [number, number][] = [
  [I.pickaxeWood, 59], [I.pickaxeStone, 131], [I.pickaxeIron, 250], [I.pickaxeDiamond, 1561], [I.pickaxeGold, 32],
  [I.bow, 384], [I.fishingRod, 64], [I.flintAndSteel, 64], [I.shears, 238], [I.carrotOnAStick, 25],
  [I.helmetLeather, 55], [I.plateLeather, 80], [I.legsLeather, 75], [I.bootsLeather, 65],
  [I.helmetChain, 165], [I.plateIron, 240], [I.legsGold, 105], [I.bootsDiamond, 429],
];
for (const [id, d] of maxDamage) check(`max damage ${id}`, item(id).getMaxDamage() === d, String(item(id).getMaxDamage()));
const stacks: [number, number][] = [[I.snowball, 16], [I.egg, 16], [I.enderPearl, 16], [I.sign, 16], [I.bucketEmpty, 16], [I.bucketWater, 1], [I.potion, 1], [I.cake, 1], [I.bed, 1], [I.doorWood, 1], [I.bowlSoup, 1], [I.enchantedBook, 1], [I.writableBook, 1], [I.record13, 1], [I.minecartEmpty, 1], [I.saddle, 1], [I.stick, 64], [I.expBottle, 64]];
for (const [id, n] of stacks) check(`stack size ${id}`, item(id).getItemStackLimit() === n, String(item(id).getItemStackLimit()));

// Damage against entities: swords 4 + material, tools base + material.
const dmg: [number, number][] = [[I.swordWood, 4], [I.swordGold, 4], [I.swordStone, 5], [I.swordIron, 6], [I.swordDiamond, 7], [I.shovelIron, 3], [I.pickaxeIron, 4], [I.axeIron, 5], [I.axeDiamond, 6], [I.hoeIron, 1], [I.stick, 1]];
const dummy = {} as never;
for (const [id, d] of dmg) check(`damage vs entity ${id}`, item(id).getDamageVsEntity(dummy) === d, String(item(id).getDamageVsEntity(dummy)));
check('full3D tools', [I.stick, I.bone, I.swordIron, I.pickaxeGold, I.hoeWood, I.fishingRod, I.carrotOnAStick].every((id) => item(id).isFull3D()) && !item(I.apple ?? I.appleRed).isFull3D());
check('armour points', [I.helmetDiamond, I.plateDiamond, I.legsDiamond, I.bootsDiamond].map((id) => item(id).getArmorReduction()).join() === '3,8,6,3');

// Rarity and glint.
check('enchanted golden apple is epic + glint', new ItemStack(I.appleGold, 1, 1).getRarity() === EnumRarity.epic && new ItemStack(I.appleGold, 1, 1).hasEffect());
check('golden apple is rare, no glint', new ItemStack(I.appleGold, 1, 0).getRarity() === EnumRarity.rare && !new ItemStack(I.appleGold, 1, 0).hasEffect());
check('records are rare', new ItemStack(I.recordCat).getRarity() === EnumRarity.rare);
check('nether star, exp bottle, written book glint', [I.netherStar, I.expBottle, I.writtenBook].every((id) => new ItemStack(id).hasEffect()));
check('water bottle has no glint, potions do', !new ItemStack(I.potion, 1, 0).hasEffect() && new ItemStack(I.potion, 1, 8193).hasEffect() && !new ItemStack(I.potion, 1, 16).hasEffect());

// Potions: the creative list and durations of 1.5.2.
const potions: ItemStack[] = [];
item(I.potion).getSubItems(I.potion, CreativeTabs.tabBrewing, potions);
check('creative potions: water + 52', potions.length === 53, String(potions.length));
check('fire resistance shown as 8227 (8195 overwritten)', potions.some((p) => p.getItemDamage() === 8227) && !potions.some((p) => p.getItemDamage() === 8195));
const eff = (d: number) => PotionHelper.getPotionEffects(d, false)!.map((e) => `${e.getPotionID()}x${e.getAmplifier()}:${e.getDuration()}`).join();
check('regeneration 0:45', eff(8193) === '10x0:900', eff(8193));
check('regeneration II 0:22', eff(8225) === '10x1:450', eff(8225));
check('splash regeneration 0:33 (676 ticks: round(900 * 0.75 + 0.5))', eff(16385) === '10x0:676', eff(16385));
check('swiftness 3:00 / 8:00', eff(8194) === '1x0:3600' && eff(8258) === '1x0:9600');
check('healing instant', eff(8197) === '6x0:1');
check('awkward potion (16) has no effect', PotionHelper.getPotionEffects(16, false) === null);
check('water colour 0x385dc6', PotionHelper.getLiquidColor(0, false) === 0x385dc6);
check('regeneration colour', PotionHelper.getLiquidColor(8193, false) === 13458603);
check('brewing: water + nether wart = awkward (16)', PotionHelper.applyIngredient(0, '+4') === 16);
check('brewing: awkward + ghast tear = regeneration (8193 bits)', (PotionHelper.applyIngredient(16, PotionHelper.ghastTearEffect) & 0x3f) === 1, String(PotionHelper.applyIngredient(16, PotionHelper.ghastTearEffect)));

// Spawn eggs in EntityList order, enchanted books in tools/combat.
const eggs: ItemStack[] = [];
item(I.monsterPlacer).getSubItems(I.monsterPlacer, CreativeTabs.tabMisc, eggs);
check('spawn eggs follow entityEggs', eggs.map((s) => s.getItemDamage()).join() === [...EntityList.entityEggs.keys()].join() && eggs.length === 23, String(eggs.length));
check('creeper egg colours', item(I.monsterPlacer).getColorFromItemStack(new ItemStack(I.monsterPlacer, 1, 50), 0) === 894731);
const tools: ItemStack[] = [];
CreativeTabs.tabTools.displayAllReleventItems(tools);
check('tools tab ends with 4 max-level books', tools.slice(-4).every((s) => s.itemID === I.enchantedBook) && tools.length === 29, String(tools.length));
check('search list has 1.5.2 books', getAllCreativeItems().filter((s) => s.itemID === I.enchantedBook).length === Enchantment.enchantmentsBookList.reduce((n, e) => n + e.getMaxLevel(), 0));
check('dyes 16, coal 2, skulls 5, golden apples 2', [[I.dyePowder, 16], [I.coal, 2], [I.skull, 5], [I.appleGold, 2]].every(([id, n]) => {
  const out: ItemStack[] = [];
  item(id).getSubItems(id, null, out);
  return out.length === n;
}));

// Names (need the lang file).
if (haveLang) {
  const names: [number, number, string][] = [
    [I.potion, 0, 'Water Bottle'], [I.potion, 16, 'Awkward Potion'], [I.potion, 8193, 'Potion of Regeneration'], [I.potion, 16420, 'Splash Potion of Poison'],
    [I.dyePowder, 4, 'Lapis Lazuli'], [I.coal, 1, 'Charcoal'], [I.monsterPlacer, 50, 'Spawn Creeper'], [I.skull, 1, 'Wither Skeleton Skull'],
    [I.recordWait, 0, 'Music Disc'], [I.axeGold, 0, 'Golden Axe'], [I.helmetLeather, 0, 'Leather Cap'], [I.netherStalkSeeds, 0, 'Nether Wart'],
    [I.speckledMelon, 0, 'Glistering Melon'], [I.fireballCharge, 0, 'Fire Charge'], [I.pocketSundial, 0, 'Clock'], [I.reed, 0, 'Sugar Canes'],
  ];
  for (const [id, d, n] of names) check(`name ${id}:${d}`, name(id, d) === n, name(id, d));
  const unnamed = getAllCreativeItems().filter((s) => s.itemID >= 256 && (s.getDisplayName() === '' || s.getDisplayName().includes('.')));
  check('every creative item has a translated name', unnamed.length === 0, unnamed.map((s) => `${s}`).join(' '));
  const tip = new ItemStack(I.potion, 1, 8228).getTooltip(null, false);
  check('poison II tooltip', tip.join('|') === 'Potion of Poison|§cPoison II (0:22)', tip.join('|'));
  check('record tooltip', new ItemStack(I.recordCat).getTooltip(null, false)[1] === 'C418 - cat');
  const book = Items.enchantedBook.getEnchantedItemStack(new EnchantmentData(Enchantment.efficiency, 5));
  check('enchanted book tooltip', book.getTooltip(null, false).join('|') === 'Enchanted Book|Efficiency V' && book.getRarity() === EnumRarity.uncommon, book.getTooltip(null, false).join('|'));
  const sword = new ItemStack(I.swordDiamond);
  sword.addEnchantment(Enchantment.sharpness, 3);
  check('enchanted sword tooltip, rare', sword.getTooltip(null, false).join('|') === 'Diamond Sword|Sharpness III' && sword.getRarity() === EnumRarity.rare);
  const cap = new ItemStack(I.helmetLeather);
  (Items.helmetLeather as unknown as { setColor(s: ItemStack, c: number): void }).setColor(cap, 0x993333);
  check('dyed leather tooltip', cap.getTooltip(null, false).join('|') === 'Leather Cap|§oDyed', cap.getTooltip(null, false).join('|'));
  check('map tooltip number', new ItemStack(I.map, 1, 3).getTooltip(null, false)[0] === 'Map #3');
  const star = new ItemStack(I.fireworkCharge);
  star.setTagCompound({ Explosion: { Type: 1, Colors: [11743532, 123], FadeColors: [2437522], Trail: true } });
  check('firework star tooltip', star.getTooltip(null, false).join('|') === 'Firework Star|Large Ball|Red, Custom|Fade to Blue|Trail', star.getTooltip(null, false).join('|'));
} else {
  console.log('(lang file missing: name checks skipped)');
}

// Unbreaking: each point of wear has a level/(level+1) chance to be cancelled (armour 40% of that).
{
  const rand = new JavaRandom(42n);
  const holder = { getRNG: () => rand, renderBrokenItemStack() {} } as unknown as EntityLiving;
  const wear = (id: number, level: number) => {
    const s = new ItemStack(id);
    if (level > 0) s.addEnchantment(Enchantment.unbreaking, level);
    for (let i = 0; i < 400; i++) s.damageItem(1, holder);
    return s.getItemDamage();
  };
  check('no unbreaking: full wear', wear(I.pickaxeDiamond, 0) === 400);
  const pick = wear(I.pickaxeDiamond, 3);
  check('unbreaking III pickaxe ~1/4 wear', pick > 70 && pick < 130, `${pick}`);
  const chest = wear(I.plateDiamond, 3);
  check('unbreaking III chestplate ~70% wear', chest > 240 && chest < 320, `${chest}`);
}

report();
