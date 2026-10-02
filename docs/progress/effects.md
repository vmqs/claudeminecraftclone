# Effects (audio + particles) progress

Branch `w1/effects`. Owner area: `src/audio/**`, `src/render/particle/**`.

## Done
- [x] Particles: every EntityFX subclass of 1.5.2 + registry of every doSpawnParticle name
      (`ParticleRegistry.ts`, maps in `ParticleFactories.ts`, `RenderGlobal.particleFactories`
      is the same map).
- [x] RenderGlobal.doSpawnParticle faithful (always-created hugeexplosion / largeexplode /
      fireworksSpark, 16-block cull, particle setting Decreased/Minimal, iconcrack_/tilecrack_).
- [x] Firework effect hook (WorldClient.func_92088_a) -> `World.makeFireworks`.
- [x] Audio: SoundPool split out, SoundManager faithful (28 channels with priority stealing,
      linear fall-off, pitch/volume clamps, stereo sources unpanned, music scheduling in-world,
      records incl. `.mus` decoding, stopAllSounds = entity loops only, closeMinecraft,
      missing-file safety, decode cache + preload, context on first gesture, debug log).
- [x] Packet62LevelSound quantisation for world sounds (RenderGlobal.playSound).
- [x] scripts/scenarios/effects.json (gallery + assertions) passes.
- [x] Docs: ARCHITECTURE §10 and §13 (Particles row), TESTING (effects scenario, audio).
- [x] Survival-ready: `BlockMiningSounds` (src/audio/BlockSounds.ts) for PlayerControllerMP's
      every-4th-tick mining step sound; hit/break particles, tool break (iconcrack), damage/eat/
      burp/levelup/orb sound names all resolve through the pools.
- [x] Scenario pins world time after load (slow loads used to drift into night).
- [x] Review fixes: firework _far from the local viewer (EffectRenderer.viewer), audio
      `unlocked` follows the real context state (no stale burst), background warm-up of the
      rest of sound3 (compressed), only the 12 records fetched as .mus, 20 min terrain wait.

## Notes
- Vanilla references for the particle gallery are in scratchpad/ref/extra/effects/ (captured
  with a private copy of the harness in scratchpad/effects/vh that adds `particle`,
  `blockbreak`, `blockhit`, `firework`, `clearparticles`; note `particles on` keeps particles,
  `particles keep` clears them). Generator: scratchpad/effects/gen_fx.py.
- Lava drip brightness 257: the original's GL_CLAMP + linear lightmap sample is half the
  (block 15, sky 0) texel and half the black border (the brown drip of the vanilla capture).
  EntityDropParticleFX reproduces it as brightness 240 at half colour, so it does not depend on
  our lightmap's CLAMP_TO_EDGE wrap.
- The worktree's public/assets is a local overlay (symlinks to the shared assets plus the .mus
  records and a manifest listing them) so the record path can be tested before the asset script
  change is merged.
- 1.5.2 has no menu music; music only counts down in a world (PlayerControllerMP.updateController).
