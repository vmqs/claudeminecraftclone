import type { StepSound } from '../block/StepSound';
import type { SoundManager } from './SoundManager';

/**
 * Block sounds the player controller plays directly (not through the world), for survival
 * mining. While a block is being damaged the original plays its step sound every fourth tick of
 * the hit counter, at a quarter of the place/break loudness and half the pitch; the counter
 * restarts on every new block and after a block breaks.
 */
export class BlockMiningSounds {
  private stepSoundTickCounter = 0;

  /** Call once per tick of damaging the block at (x, y, z). */
  onDamageTick(snd: SoundManager, sound: StepSound | null, x: number, y: number, z: number): void {
    if (this.stepSoundTickCounter % 4 === 0 && sound) {
      snd.playSound(sound.getStepSound(), x + 0.5, y + 0.5, z + 0.5, (sound.getVolume() + 1) / 8, sound.getPitch() * 0.5);
    }
    this.stepSoundTickCounter++;
  }

  /** A new block was clicked, mining stopped or the block broke. */
  reset(): void {
    this.stepSoundTickCounter = 0;
  }
}
