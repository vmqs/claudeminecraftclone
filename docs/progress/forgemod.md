# Forge 1.8.9 "Poly Player Models" mod + .mcpm/.glb export — progress

Plan (commit after each):
1. Web: `src/client/model/GlbExport.ts` (normalised mesh, materials + embedded textures, 6-bone skin at the rig pivots) + Node test (round trip through GltfParser) + Account Manager "Export .mcpm" / "Export .glb" + `scripts/export-glb.mjs` for the built-ins
2. Mod scaffold `mods/forge-1.8.9/` (architectury-loom from the nea89o/Forge1.8.9Template, Forge 1.8.9-11.15.1.2318, Gradle wrapper, no mixins/DevAuth)
3. Java `.mcpm` decoder mirroring PlayerModelFormat.ts (raw deflate, bounds checks, ImageIO textures)
4. Rendering: RenderPolyPlayer (RenderPlayer subclass, swapped in from RenderPlayerEvent.Pre), ModelPolyPlayer (ModelPlayer subclass, CPU skinning), held item at the palm, head items, no armour/cape/ears
5. Selection: key M "Choose Player Model" (category "Poly Player Models"), GuiScreen list, config/polymodels.cfg (+ "players" section), config/polymodels/ folder + README.txt
6. Build jar, CI workflow `.github/workflows/forge-mod.yml`
7. Real test: runClient under Xvfb with JDK 8, dev test hook (`-Dpolymodels.devtest=...`), screenshots
8. README (mod + main), docs

Status:
- [ ] 1  - [ ] 2  - [ ] 3  - [ ] 4  - [ ] 5  - [ ] 6  - [ ] 7  - [ ] 8
