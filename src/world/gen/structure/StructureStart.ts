import type { JavaRandom } from '../../../core/JavaRandom';
import type { IWorld } from '../../IWorld';
import { StructureBoundingBox } from './StructureBoundingBox';
import type { StructureComponent } from './StructureComponent';

/** The pieces of one structure instance and their combined box (StructureStart). */
export abstract class StructureStart {
  readonly components: StructureComponent[] = [];
  boundingBox!: StructureBoundingBox;

  getBoundingBox(): StructureBoundingBox {
    return this.boundingBox;
  }

  /** Builds the pieces inside `box`; a piece whose addComponentParts fails is dropped for good. */
  generateStructure(w: IWorld, rand: JavaRandom, box: StructureBoundingBox): void {
    for (let i = 0; i < this.components.length; i++) {
      const c = this.components[i];
      if (c.getBoundingBox().intersectsWith(box) && !c.addComponentParts(w, rand, box)) {
        this.components.splice(i, 1);
        i--;
      }
    }
  }

  protected updateBoundingBox(): void {
    this.boundingBox = StructureBoundingBox.getNewBoundingBox();
    for (const c of this.components) this.boundingBox.expandTo(c.getBoundingBox());
  }

  /** Moves the structure down to fit below sea level (mineshafts, strongholds). */
  protected markAvailableHeight(rand: JavaRandom, margin: number): void {
    const limit = 63 - margin;
    let top = this.boundingBox.getYSize() + 1;
    if (top < limit) top += rand.nextInt(limit - top);
    const dy = top - this.boundingBox.maxY;
    this.boundingBox.offset(0, dy, 0);
    for (const c of this.components) c.getBoundingBox().offset(0, dy, 0);
  }

  protected setRandomHeight(rand: JavaRandom, min: number, max: number): void {
    const range = max - min + 1 - this.boundingBox.getYSize();
    const y = range > 1 ? min + rand.nextInt(range) : min;
    const dy = y - this.boundingBox.minY;
    this.boundingBox.offset(0, dy, 0);
    for (const c of this.components) c.getBoundingBox().offset(0, dy, 0);
  }

  isSizeableStructure(): boolean {
    return true;
  }
}
