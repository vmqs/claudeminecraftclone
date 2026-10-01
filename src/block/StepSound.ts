/** StepSound and its anonymous subclasses (glass, ladder, anvil). */
export class StepSound {
  constructor(
    readonly stepSoundName: string,
    readonly stepSoundVolume: number,
    readonly stepSoundPitch: number,
  ) {}

  getVolume(): number {
    return this.stepSoundVolume;
  }
  getPitch(): number {
    return this.stepSoundPitch;
  }
  getBreakSound(): string {
    return 'dig.' + this.stepSoundName;
  }
  getStepSound(): string {
    return 'step.' + this.stepSoundName;
  }
  getPlaceSound(): string {
    return this.getBreakSound();
  }
}

/** Glass: breaks with "random.glass", placed with "step.stone". */
export class StepSoundStone extends StepSound {
  override getBreakSound(): string {
    return 'random.glass';
  }
  override getPlaceSound(): string {
    return 'step.stone';
  }
}

/** Ladder: breaks with "dig.wood". */
export class StepSoundSand extends StepSound {
  override getBreakSound(): string {
    return 'dig.wood';
  }
}

export class StepSoundAnvil extends StepSound {
  override getBreakSound(): string {
    return 'dig.stone';
  }
  override getPlaceSound(): string {
    return 'random.anvil_land';
  }
}

export const StepSounds = {
  soundPowderFootstep: new StepSound('stone', 1, 1),
  soundWoodFootstep: new StepSound('wood', 1, 1),
  soundGravelFootstep: new StepSound('gravel', 1, 1),
  soundGrassFootstep: new StepSound('grass', 1, 1),
  soundStoneFootstep: new StepSound('stone', 1, 1),
  soundMetalFootstep: new StepSound('stone', 1, 1.5),
  soundGlassFootstep: new StepSoundStone('stone', 1, 1),
  soundClothFootstep: new StepSound('cloth', 1, 1),
  soundSandFootstep: new StepSound('sand', 1, 1),
  soundSnowFootstep: new StepSound('snow', 1, 1),
  soundLadderFootstep: new StepSoundSand('ladder', 1, 1),
  soundAnvilFootstep: new StepSoundAnvil('anvil', 0.3, 1),
};
