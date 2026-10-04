# Poly Player Models (Forge 1.8.9)

A small client-side Forge mod that lets you wear the polygon player models of the
[Minecraft 1.5.2 browser game](../../README.md) in Minecraft **1.8.9**: John Marston, Trevor and the
Roblox Noob are built in, and any model you import in the browser game (from a `.glb`, `.gltf`,
`.fbx` or `.obj` file) can be exported from its Account Manager and dropped into a folder.

The model replaces Steve wherever the game draws your player through vanilla's player renderer:
third person (F5, back and front), the inventory preview, and the mod's own chooser. It moves with
vanilla's own animations: walking, looking around, sneaking, swinging, blocking with a sword,
drawing a bow, riding, sleeping, getting hurt (red tint) and dying. Held items sit in the model's
right hand and pumpkins or skulls on its head.

| | |
|---|---|
| Mod id / version | `polymodels` 1.0.0 |
| Minecraft / Forge | 1.8.9 / 11.15.1.2318 (the recommended 1.8.9 build; other 1.8.9 builds should work) |
| Side | client only: servers need nothing, and it joins any server (vanilla or modded) |
| Java | runs on Minecraft 1.8.9's Java 8 |

## Install

1. Install **Forge 1.8.9-11.15.1.2318** for Minecraft 1.8.9 (the Forge installer from
   <https://files.minecraftforge.net>, "Install client").
2. Put `polymodels-1.0.0.jar` in your `.minecraft/mods/` folder.
3. Start the Forge 1.8.9 profile. The first start creates `.minecraft/config/polymodels/` (with a
   `README.txt`) and `.minecraft/config/polymodels.cfg`.

## Use

- Press **M** (Controls → "Poly Player Models" → "Choose Player Model" to change the key), or
  **Mods → Poly Player Models → Config** on the title screen. The list shows Steve, the built-in
  models and the models in `config/polymodels/`; click one to wear it (double-click also closes the
  screen). In a world a turning preview shows your player; the bottom line names the model's
  source. **Reload folder** picks up new files, **Open folder** opens `config/polymodels/`.
- **Steve** brings back the vanilla player model with your skin.
- Press **F5** to see yourself.

The choice is saved in `config/polymodels.cfg`:

```
general {
    # The model you wear: steve, john_marston, trevor, roblox_noob or a file name from config/polymodels
    S:model=john_marston
    # The model every OTHER player wears on your screen unless "players" names one (steve: their skin)
    S:others=roblox_noob
}

players {
    # Models for other players by name, seen by you only
    S:Notch=trevor
    S:jeb_=steve
}
```

`others` and the `players` section are optional: they show other players in models **on your
screen only**. The mod is client-side, so other players see your normal skin, and they only see you
in a model if they have the mod too and name you in their own config. A `players` line wins over
`others`; `S:<name>=steve` keeps one player vanilla. Edit the file while Minecraft is closed (the
game rewrites it when you choose a model). Forge rejects a file with a syntax error: it renames it
to `polymodels.cfg_<date>.errored` and starts a new one, so keep to letters, digits and `_` in
names (as Minecraft player names are) or put the name in double quotes.

## Add your own models

1. Open the browser game, then its **Account Manager** (title screen or Options).
2. Pick a model with the **Model** button, or **Import Model...** your own (`.glb`, `.gltf`,
   `.fbx`, `.obj`, or a `.zip` with one and its textures). The game scales it to 1.8 blocks, turns it
   to face forward and rigs it onto the six parts of the player (from its skeleton, or by its shape).
3. Press **Export .mcpm** and save the file into `.minecraft/config/polymodels/`.
4. In Minecraft press **M → Reload folder** and choose it. The file name (without `.mcpm`) is the
   model's id in `polymodels.cfg`.

**Export .glb** (next to it) saves the same model as a standard glTF 2.0 file for Blender or any
glTF viewer, with its textures and a six-bone skeleton.

Files are checked before use (the same checks as the browser game: sizes, ranges, indices,
compressed data). A damaged file is listed in red with the reason and cannot be chosen; a file that
fails later leaves you as Steve. Files over 40 MB are refused.

## Limitations

- Client-side only: nobody else sees your model unless they run the mod and name it for you.
- First person keeps vanilla's arm (with your skin), not the model's arm.
- Armour, the cape, deadmau5 ears and stuck arrows are not drawn on models (they are shaped for
  Steve's boxes). Held items and pumpkins/skulls are drawn, fitted to the model.
- Spectator mode and players still loading their model are drawn as Steve.
- Textures are PNG or JPEG. A WebP texture (possible in files from other tools) is left out with a
  log line; the browser game's exporters always write PNG/JPEG.
- Other mods that replace the player renderer (some cosmetics mods, OptiFine's player models) were
  not tested with it.
- Performance: the models are skinned on the CPU every frame. John Marston (17,183 triangles) costs
  about 0.35-0.4 ms per frame for skinning; the in-game test ran at 49-76 fps in software rendering
  (Mesa llvmpipe, no GPU), so a real GPU keeps 60 fps easily.

## Credits and license

- Mod code: original, MIT license (see [LICENSE](LICENSE)).
- Built-in models (user-supplied, included at the repository owner's request; their rights stay with
  their owners and are not covered by the MIT license):
  - John Marston (Red Dead Redemption), Rockstar Games.
  - Trevor Philips (Grand Theft Auto V), Rockstar Games.
  - Roblox Noob (Roblox Corporation), model by vanyabro85 on Sketchfab (CC-BY-4.0).
- Build setup after the [nea89o/Forge1.8.9Template](https://github.com/nea89o/Forge1.8.9Template)
  (architectury-loom, Unlicense).
- Not affiliated with or endorsed by Mojang Studios, Microsoft, Rockstar Games or Roblox.

## Build from source

Needs a JDK 17 or newer to run Gradle; the mod is compiled for Java 8 with a Java 8 toolchain that
Gradle finds on the machine or downloads (foojay).

```sh
cd mods/forge-1.8.9
./gradlew build          # -> build/libs/polymodels-1.0.0.jar (the remapped jar for normal Forge installs)
```

The build copies the built-in models from the repository (`public/models/<id>/model.mcpm` →
`assets/polymodels/models/<id>.mcpm`; task `copyBuiltinModels`; `-PmodelsDir=<dir>` to build
elsewhere) and runs `McpmFormatTest`, which checks the Java decoder against the browser game's
own decoder: `src/test/resources/mcpm-reference.json` (written by
`node scripts/mcpm-reference.mjs` from the repository root) holds exact hashes of every decoded
array of the built-in models and 47 crafted files with the error the browser game reports; the
Java decoder must give the same arrays bit for bit and the same errors. Ignore
`build/intermediates/*-without-deps.jar` (not remapped).

GitHub Actions builds the jar on every change under `mods/forge-1.8.9/` or `public/models/`
(`.github/workflows/forge-mod.yml`, artifact `polymodels-1.0.0`).

### Run and test in a development client

```sh
./gradlew runClientDirect
```

starts Minecraft 1.8.9 with Forge and the mod (on the Java 8 toolchain). loom's own `runClient`
task does not pass Gradle 8's task validation, so `runClientDirect` runs the same launch
configuration. `-PrunJvmArgs="..."` adds JVM arguments.

`-PrunJvmArgs="-Dpolymodels.devtest=<output dir>"` runs the mod's automated in-game test
(`dev/polymodels/dev/DevTest.java`; it does nothing unless that property is set): it opens the
chooser, creates a flat survival world, wears John Marston and screenshots the F5 views (front,
back, sneaking, swinging, blocking, drawing a bow, a pumpkin on the head), other players in Trevor
and the Noob through the `players` section and `others`, the inventory preview, folder models (a good one, a
damaged one, a truncated one), the chooser in a world, Trevor, and Steve again; it measures the
skinning time, writes `<output dir>/devtest-results.txt` and the screenshots, and quits. The same
property works with the release jar in a normal Forge install.

Headless (no display, software OpenGL), as it was tested:

```sh
LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \
  xvfb-run -a -s "-screen 0 854x480x24" ./gradlew runClientDirect -PrunJvmArgs="-Dpolymodels.devtest=$PWD/run/devtest"
```

LWJGL 2.9.4 on Linux reads the screen modes with the `xrandr` program; without it the game stops
with `ArrayIndexOutOfBoundsException` in `LinuxDisplay.getAvailableDisplayModes`. Install
`x11-xserver-utils`, or put a stand-in `xrandr` on the `PATH` that prints
`Screen 0: minimum 8 x 8, current 854 x 480, maximum 32767 x 32767` /
`default connected primary 854x480+0+0 0mm x 0mm` / `   854x480     60.00*+` for `xrandr -q`.

## How it works

- `McpmFormat` reads `.mcpm` files: a JSON header (read with the game's Gson) and a raw-DEFLATE
  geometry block (UVs, positions quantised to 16 bits inside the header's bounds, normals, up to
  four of the six ModelBiped parts per vertex with weights, indices), plus PNG/JPEG textures.
- `ModelRegistry` lists the built-in and folder models, decodes them on a background thread when
  first needed and keeps the choices in `polymodels.cfg` (Forge `Configuration`).
- `PlayerRenderHandler` cancels `RenderPlayerEvent.Pre` for players wearing a model and draws them
  with `RenderPolyPlayer`, a `RenderPlayer` whose model is `ModelPolyPlayer` (a `ModelPlayer`) and
  whose layers are only the held item and the head item. Everything else (position, body turn,
  sneaking offset, riding, sleeping, death, hurt tint, invisibility, name tag) is vanilla's.
- `ModelPolyPlayer` lets vanilla's `ModelBiped.setRotationAngles` pose the six parts, then skins
  every vertex on the CPU: each part's matrix is `T(pivot + delta) · Rz · Ry · Rx · T(-pivot)` (what
  `ModelRenderer.render` does to a box), with the model's own joint positions. The parts'
  `ModelRenderer`s are moved onto those joints, so `LayerHeldItem` puts the item at the model's palm
  and `LayerCustomHead` (through a shifted, scaled head renderer) fits head items to its head.
  `PolyModel` draws the skinned vertices with client-side vertex arrays in vanilla's GL state
  (lightmap, item lighting, hurt tint) with mipmapped textures uploaded once.
