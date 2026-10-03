# Research notes

The clone is built against the behaviour of the original **Minecraft 1.5.2** client
(released 2013-04-25, client jar SHA-1 `465378c9dc2f779ae1d6e8046ebc46fb53a57968`).

## Getting the reference source

```sh
scripts/decompile.sh     # -> .cache/src152/net/minecraft/src/*.java (git-ignored)
```

The script:
1. downloads the official client jar from Mojang's launcher CDN and verifies its SHA-1;
2. downloads MCPHackers' 1.5.2 mappings (`mappings.tiny`, official -> MCP names);
3. remaps the jar with FabricMC tiny-remapper (`--ignoreConflicts`);
4. decompiles it with Vineflower.

The output uses classic MCP names (`net.minecraft.src.RenderBlocks`, `EntityRenderer`,
`GuiContainerCreative`, ...), which is also how classes in this repo are named.
Never commit the decompiled source or anything copied out of it verbatim. Port behaviour, data
and constants into original TypeScript.

## Where to look

| Topic | Classes |
|---|---|
| Main loop, input, screens | `Minecraft`, `Timer`, `GameSettings`, `KeyBinding`, `GuiScreen` |
| Camera, fog, lightmap, frame | `EntityRenderer`, `ActiveRenderInfo`, `RenderHelper` |
| Terrain rendering | `RenderGlobal`, `WorldRenderer`, `RenderBlocks`, `Tessellator`, `Frustrum` |
| Sky, clouds, weather | `RenderGlobal.renderSky/renderClouds`, `EntityRenderer.renderRainSnow`, `WorldProvider` |
| Textures | `RenderEngine`, `TextureMap`, `Stitcher`, `TextureStitched`, `TextureCompass`, `TextureClock` |
| World and lighting | `World`, `Chunk`, `ExtendedBlockStorage`, `WorldServer.tickBlocksAndAmbiance` |
| World generation | `ChunkProviderGenerate`, `GenLayer*`, `BiomeGenBase`, `BiomeDecorator`, `MapGenCaves`, `MapGenRavine`, `WorldGen*`, `MapGenStructure`, `ComponentVillage*` |
| Player | `EntityPlayerSP`, `EntityPlayer`, `PlayerCapabilities`, `MovementInputFromOptions`, `PlayerControllerMP` (creative branch) |
| Entities and AI | `Entity`, `EntityLiving`, `EntityAI*`, `PathNavigate`, `PathFinder`, `SpawnerAnimals` |
| Entity rendering | `RenderManager`, `RenderLiving`, `Model*`, `ModelRenderer`, `ModelBox` |
| GUI | `FontRenderer`, `Gui`, `GuiButton`, `GuiIngame`, `GuiMainMenu`, `GuiContainerCreative`, `ScaledResolution` |
| Sound | `SoundManager`, `SoundPool`, `StepSound` |

Assets: `scripts/fetch-assets.mjs` pulls the jar resources plus the legacy `pre-1.6` sound index
(`sound3/`, `music/`, `newmusic/`, `streaming/`), the same folders 1.5.2 loads.
