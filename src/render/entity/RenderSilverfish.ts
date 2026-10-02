import type { EntityLiving } from '../../entity/EntityLiving';
import { ModelSilverfish } from './ModelSilverfish';
import { RenderLiving } from './RenderLiving';

/** Silverfish (RenderSilverfish): flips over (180 degrees) when dying. */
export class RenderSilverfish extends RenderLiving {
  constructor() {
    super(new ModelSilverfish(), 0.3);
  }

  protected override getDeathMaxRotation(_e: EntityLiving): number {
    return 180;
  }
}
