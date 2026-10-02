import { Block } from './Block';

/** Blocks with a horizontal facing in meta & 3 (BlockDirectional): beds, pumpkins, fence gates, repeaters... */
export abstract class BlockDirectional extends Block {
  static getDirection(meta: number): number {
    return meta & 3;
  }
}
