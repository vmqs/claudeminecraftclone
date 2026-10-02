# renderblocks slice progress (wave 2)

Branch `w2/renderblocks`, base 96e8639.

- [x] RenderBlocks dispatch for every 1.5.2 render type (src/render/blocks/*), Node checks in tests/renderblocks.test.ts
- [x] renderBlockAsItem for every 3D item type (+ chest via tile-entity renderer)
- [x] Tile-entity special renderers (chest, ender chest, sign, spawner, skull, piston, enchanting book, beacon beam, end portal)
- [x] Anaglyph wired to the mesher
- [x] scripts/scenarios/renderblocks.json showcase (run 1 done: matched vanilla except the
      camera fell before the first shot, beacon not yet active, spawner mob missing = no Pig class)
      (vanilla captures: scratchpad/ref/extra/renderblocks{,2}, made with a private harness copy
      scratchpad/vanilla-rb that adds a `setblocks FILE` command; generator scratchpad/rb/gen.py)
- [x] End portal texgen fixed (s/t/r object-linear, q eye-linear); float-exact fluid heights
- [ ] Scene 5 (fluids diamond, end portal, snow layers, glass/ice/leaves, sideways piston and
      hopper): vanilla rb2 capture, then browser run 2 and comparison
