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
- [ ] radial fog + client skylight quirk
- [ ] WeatherCycle (client weather view, /weather and /toggledownfall helpers, dev hooks)
- [ ] rain/snow rendering, rain particles and sounds
- [ ] lightning bolt entity, renderer, sky flash
- [ ] overlays: fire, pumpkin blur, portal; vignette/water brightness quirk
- [ ] sky/clouds/fog verification against references; fixes
- [ ] scenario scripts/scenarios/sky.json + docs
