# Sky / atmosphere / weather (wave 1, branch w1/sky)

Progress log so an interrupted run can resume. Newest last.

## Findings (1.5.2 behaviour that differs from a naive port)
- Reference captures run on Mesa llvmpipe, which exposes GL_NV_fog_distance; setupFog switches
  the fog distance to GL_EYE_RADIAL_NV on its first call, so every fog after the first frame is
  radial (per-vertex length of the eye position, interpolated). The shader does the same.
- The client world (WorldClient) only computes skylightSubtracted once, at construction with
  world time 0, so it is always 0 on the client: fog brightness (fogColor1), Entity.getBrightness
  (vignette, water overlay) see daylight values at night. Captured sidecars confirm
  `skylightSubtracted=0` at midnight.
- The client never learns the server's thunder state in 1.5.2 (no packet sets it): rendered
  thunder strength is always 0, so thunderstorms look exactly like rain plus bolts. The client
  rain strength restarts at 0 when the server's isRaining() turns true (Packet70GameEvent 1) and
  at 1 when it turns false (event 2), then ramps 0.01 per tick.

## Steps
- [x] radial fog + client skylight quirk
- [x] WeatherCycle (client weather view, /weather and /toggledownfall helpers, dev hooks)
- [x] rain/snow rendering, rain particles and sounds
- [x] lightning bolt entity, renderer, sky flash
- [x] overlays: fire, pumpkin blur, portal; vignette/water brightness quirk
- [x] potion/boss hooks (SkyHooks) for night vision, blindness, water breathing, boss darkening
- [x] quads split along v1-v3 like Mesa (found via the mirrored sunset fan fog)
- [x] scenario scripts/scenarios/sky.json + docs (ARCHITECTURE §6.4, §13; TESTING)
- [x] verification of sky.json against ref/extra/sky (vanilla captures of the same scenes,
      scenarios in scratchpad vanilla/scenarios-sky/)

## Verification notes
- Vanilla captures: scratchpad `ref/extra/sky/` (sky_flat, sky_snow, sky_fluids scenarios).
- Masked AE diff (fuzz 3%, hand + hotbar masked): clear-sky noon/zenith/midnight/fast clouds/
  render distances within a few hundred pixels (terrain texture aliasing near the horizon only).
  Rain/thunder sky colours within one colour step; thunder renders exactly like rain in vanilla.
- Underwater (noon, looking up, midnight) and the in-wall overlay match the vanilla captures to
  within 0-77 pixels; lava fog and the creative fire overlay match apart from the lava animation
  frame. Rain and snow mean colours match within 0.1 %; snow layers accumulate while it snows.
- Sunset/sunrise fan: after the v1-v3 quad split the sky matches (remaining diffs: cloud edges).
- Terrain near the horizon differs by texture sampling (not sky code): a few rows of block-edge
  texels at fixed distances sample the neighbouring texel (mesher UV precision?).
