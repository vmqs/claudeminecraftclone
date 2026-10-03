# Account / skins / splash / multiplayer menu (wave 4, branch w4/account)

Progress log so an interrupted run can continue.

- [x] Skin core: src/client/skin/{SkinImage,PlayerSkins,SkinFiles}.ts, src/render/entity/SkinTextures.ts,
      RenderPlayer.bindEntityTexture + ItemRenderer arm use the player's skin
- [x] Skin sync: src/net/SkinSync.ts (MC|Skin), src/net/server/SkinRelay.ts, hooks in LanServer,
      NetServerHandler, NetClientHandler, Minecraft (hostSkin/playerSkin/localSkin)
- [x] Boot splash: src/client/BootSplash.ts replaces loadScreen (mojang.png)
- [x] ServerAddress + ServerConnector (src/net/connect/), Minecraft.connectToServer
- [x] GuiMultiplayer: no name field, Room Code button, server/room kinds, polling; GuiScreenServerList
      "Server Address"; GuiScreenRoomCode; GuiConnecting both paths; GuiShareToLan without name field
- [ ] GuiAccountManager (+ main menu and options buttons)
- [ ] debug screens, dev hooks (mc.dev.account), tests/account.test.ts, tests/netskins.test.ts
- [ ] docs (MULTIPLAYER, README, ARCHITECTURE, TESTING), mp-test.mjs, scripts/scenarios/account.json
- [ ] screenshots (max 3 browser runs)
