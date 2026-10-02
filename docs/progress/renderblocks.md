# renderblocks slice progress (wave 2)

Branch `w2/renderblocks`, base 96e8639.

- [x] RenderBlocks dispatch for every 1.5.2 render type (src/render/blocks/*), Node checks in tests/renderblocks.test.ts
- [x] renderBlockAsItem for every 3D item type (+ chest via tile-entity renderer)
- [x] Tile-entity special renderers (chest, ender chest, sign, spawner, skull, piston, enchanting book, beacon beam, end portal)
- [x] Anaglyph wired to the mesher
- [ ] scripts/scenarios/renderblocks.json showcase + screenshot comparison against vanilla
      (vanilla captures: scratchpad/ref/extra/renderblocks, made with a private harness copy
      scratchpad/vanilla-rb that adds a `setblocks FILE` command; generator scratchpad/rb/gen.py)
