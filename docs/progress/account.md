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
- [x] GuiAccountManager (+ main menu and options buttons)
- [x] debug screens, dev hooks (mc.dev.account), tests/account.test.ts, tests/netskins.test.ts
- [x] docs (MULTIPLAYER, README, ARCHITECTURE, TESTING), mp-test.mjs, scripts/scenarios/account.json
- [x] browser run 1 (account.json): preview model was drawn as a child model (ModelBase.isChild
      defaults to true) -> fixed; drag assertion raced the mouse-up -> wait added
- [x] browser run 2 (account.json): all menu checks pass; the name-field check needs a click on
      the field first (the drag in the preview unfocuses it) -> fixed; world part not reached
- [x] browser run 3 (mp-test.mjs --port 4224 --relay-port 5224): 20/20 checks; each side sees the
      other's skin pixel for pixel; the host's skin in F5 front, on the arm and in the inventory
- Not run in a browser after the fixes: the world half of scripts/scenarios/account.json (its
  rendering paths are the ones mp-test exercised); the menu half passed in run 2.
