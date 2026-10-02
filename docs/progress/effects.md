# Effects (audio + particles) progress

Branch `w1/effects`. Owner area: `src/audio/**`, `src/render/particle/**`.

## Plan
- [ ] Audio: SoundPool split out, SoundManager faithful (channels, attenuation, pitch/volume clamps,
      music scheduling, records incl. `.mus` decoding, stopAllSounds semantics, missing-file safety,
      decode cache + preload, debug log for tests)
- [ ] Particles: every EntityFX subclass of 1.5.2 + registry of every doSpawnParticle name
- [ ] RenderGlobal.doSpawnParticle faithful (always-spawned names, 16-block cull, particle setting)
- [ ] Firework effect hook (WorldClient.func_92088_a)
- [ ] scripts/scenarios/effects.json + screenshots + audio smoke test
- [ ] Report

## Log
