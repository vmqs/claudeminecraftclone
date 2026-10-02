# Effects (audio + particles) progress

Branch `w1/effects`. Owner area: `src/audio/**`, `src/render/particle/**`.

## Plan
- [ ] Audio: SoundPool split out, SoundManager faithful (channels, attenuation, pitch/volume clamps,
      music scheduling, records incl. `.mus` decoding, stopAllSounds semantics, missing-file safety,
      decode cache + preload, debug log for tests)
- [x] Particles: every EntityFX subclass of 1.5.2 + registry of every doSpawnParticle name
- [x] RenderGlobal.doSpawnParticle faithful (always-spawned names, 16-block cull, particle setting)
- [x] Firework effect hook (WorldClient.func_92088_a) -> World.makeFireworks
- [ ] scripts/scenarios/effects.json + screenshots + audio smoke test
- [ ] Report

## Log
- Particles ported and committed. Vanilla references captured with a private copy of the
  harness (scratchpad/effects/vh, adds `particle`, `blockbreak`, `blockhit`, `firework`,
  `clearparticles`; note `particles on` keeps particles, `particles keep` clears them) into
  scratchpad/ref/extra/effects/. Our gallery (scratchpad/effects/scen/fx_ours.json) matches them.
- Lava drip brightness 257: llvmpipe's GL_CLAMP + linear lightmap blends with the black border
  (brown drip); our lightmap uses CLAMP_TO_EDGE (bright drip, as NVIDIA drivers showed it). Left as is.
