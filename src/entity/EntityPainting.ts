import { ItemIds } from '../block/BlockIds';
import { ItemStack } from '../item/ItemStack';
import type { World } from '../world/World';
import { EntityHanging } from './EntityHanging';

/** A painting motive (EnumArt): size in pixels and its offset in /art/kz.png. */
export interface EnumArt {
  readonly title: string;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

const art = (title: string, sizeX: number, sizeY: number, offsetX: number, offsetY: number): EnumArt => ({ title, sizeX, sizeY, offsetX, offsetY });

/** Every 1.5.2 painting, in declaration order (placement picks among those that fit). */
export const EnumArt: readonly EnumArt[] = [
  art('Kebab', 16, 16, 0, 0),
  art('Aztec', 16, 16, 16, 0),
  art('Alban', 16, 16, 32, 0),
  art('Aztec2', 16, 16, 48, 0),
  art('Bomb', 16, 16, 64, 0),
  art('Plant', 16, 16, 80, 0),
  art('Wasteland', 16, 16, 96, 0),
  art('Pool', 32, 16, 0, 32),
  art('Courbet', 32, 16, 32, 32),
  art('Sea', 32, 16, 64, 32),
  art('Sunset', 32, 16, 96, 32),
  art('Creebet', 32, 16, 128, 32),
  art('Wanderer', 16, 32, 0, 64),
  art('Graham', 16, 32, 16, 64),
  art('Match', 32, 32, 0, 128),
  art('Bust', 32, 32, 32, 128),
  art('Stage', 32, 32, 64, 128),
  art('Void', 32, 32, 96, 128),
  art('SkullAndRoses', 32, 32, 128, 128),
  art('Wither', 32, 32, 160, 128),
  art('Fighters', 64, 32, 0, 96),
  art('Pointer', 64, 64, 0, 192),
  art('Pigscene', 64, 64, 64, 192),
  art('BurningSkull', 64, 64, 128, 192),
  art('Skeleton', 64, 48, 192, 64),
  art('DonkeyKong', 64, 48, 192, 112),
];

/**
 * A painting (EntityPainting): placed on a wall face, it picks a random motive among all that
 * fit there (or a named one); drops a painting item when it falls off.
 */
export class EntityPainting extends EntityHanging {
  art: EnumArt = EnumArt[0];

  constructor(world: World);
  constructor(world: World, x: number, y: number, z: number, direction: number, title?: string);
  constructor(world: World, x?: number, y?: number, z?: number, direction?: number, title?: string) {
    super(world, x, y, z, direction);
    if (x === undefined || direction === undefined) return;
    const fitting: EnumArt[] = [];
    for (const a of EnumArt) {
      this.art = a;
      this.setDirection(direction);
      if (this.onValidSurface()) fitting.push(a);
    }
    if (fitting.length > 0) this.art = fitting[this.rand.nextInt(fitting.length)];
    this.setDirection(direction);
    if (title !== undefined) {
      const named = EnumArt.find((a) => a.title === title);
      if (named) this.art = named;
      this.setDirection(direction);
    }
  }

  getWidthPixels(): number {
    return this.art.sizeX;
  }

  getHeightPixels(): number {
    return this.art.sizeY;
  }

  dropItemStack(): void {
    this.entityDropItem(new ItemStack(ItemIds.painting, 1, 0), 0);
  }
}
