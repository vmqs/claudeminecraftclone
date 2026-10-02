import { BlockIds, ItemIds } from '../../block/BlockIds';

/** One entry of the Superflat presets list (GuiFlatPresetsItem): icon item id, name, preset string. */
export interface FlatPreset {
  readonly iconId: number;
  readonly name: string;
  readonly value: string;
}

/**
 * GuiFlatPresets' list, in order. The strings are what FlatGeneratorInfo.toString produces for
 * each preset (features in HashMap order); the first is the default "Classic Flat".
 */
export const FLAT_PRESETS: readonly FlatPreset[] = [
  { iconId: BlockIds.grass, name: 'Classic Flat', value: '2;7,2x3,2;1;village' },
  { iconId: BlockIds.stone, name: "Tunnelers' Dream", value: '2;7,230x1,5x3,2;3;biome_1,decoration,stronghold,mineshaft,dungeon' },
  { iconId: BlockIds.waterMoving, name: 'Water World', value: '2;7,5x1,5x3,5x12,90x9;1;village,biome_1' },
  { iconId: BlockIds.tallGrass, name: 'Overworld', value: '2;7,59x1,3x3,2;1;village,biome_1,decoration,stronghold,mineshaft,lake,lava_lake,dungeon' },
  { iconId: BlockIds.snow, name: 'Snowy Kingdom', value: '2;7,59x1,3x3,2,78;12;village,biome_1' },
  { iconId: ItemIds.feather, name: 'Bottomless Pit', value: '2;2x4,3x3,2;1;village,biome_1' },
  { iconId: BlockIds.sand, name: 'Desert', value: '2;7,3x1,52x24,8x12;2;village,biome_1,decoration,stronghold,mineshaft,dungeon' },
  { iconId: ItemIds.redstone, name: 'Redstone Ready', value: '2;7,3x1,52x24;2;' },
];

/** The default superflat preset string (FlatGeneratorInfo.getDefaultFlatGenerator().toString()). */
export const DEFAULT_FLAT_PRESET = FLAT_PRESETS[0].value;
