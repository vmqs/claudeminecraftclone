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
- [x] 1 web export (tests/glbexport.test.ts 682 checks; scenarios export/account/models pass; Khronos validator clean)
- [x] 2 scaffold (gg.essential.loom 0.10.0.5, Gradle 8.8 wrapper; loom's runClient fails Gradle 8 validation -> runClientDirect)
- [x] 3 decoder  - [x] 4 rendering (compiles)  - [x] 5 selection GUI/config/key (compiles)
- [x] 6 CI (.github/workflows/forge-mod.yml; JAVA_HOME_8_X64 toolchain lookup checked locally)
- [x] 7 real test under Xvfb: dev client (runClientDirect) and the RELEASE jar in a production-style
  launch (obfuscated client + forge universal + launchwrapper/FMLTweaker; needs log4j 2.0-beta9):
  24 checks pass (incl. the M key, Controls category, lang file), 19 screenshots (scratchpad/fm-devtest,
  fm-prodtest). Final jar: scratchpad/polymodels-1.0.0.jar
- Done.
- [x] 8 README (mod + main), LICENSE (MIT, code only), ARCHITECTURE §3/§13, TESTING
- [x] JUnit McpmFormatTest vs scripts/mcpm-reference.mjs fixture (built-ins bit-exact, 42 refusals)

Notes for a resume:
- JDK 8 for running: scratchpad/jdk8 (Temurin 8u504), listed in ~/.gradle/gradle.properties
  (org.gradle.java.installations.paths); Gradle itself runs on the system JDK 21.
- Headless run: LWJGL 2.9.4 needs `xrandr` (not installed): scratchpad/fakebin/xrandr prints a fake
  `xrandr -q`; put it first on PATH. Run `./gradlew runClientDirect -PrunJvmArgs="-Dpolymodels.devtest=<dir>"`
  under xvfb-run (LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe); kill leftovers (devlaunchinjector, Xvfb).
