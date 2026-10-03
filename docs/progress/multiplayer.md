# Multiplayer progress (wave 3b)

Peer-to-peer multiplayer with room codes and usernames, modelled on 1.5.2's "Open to LAN".
Resume from this file and `git log` after a restart.

## Plan (milestones, commit after each)

1. [x] Dependencies: `@trystero-p2p/nostr` + `@trystero-p2p/torrent` (signalling strategies,
   WebRTC data channels), `@trystero-p2p/ws-relay` (self-hosted relay for local tests), `fflate`
   moved to runtime dependencies (chunk compression).
2. [x] Protocol: `src/net/protocol/` (PacketBuffer, packet table, item/chunk codecs, framing,
   limits) + `tests/netprotocol.test.ts`.
3. [x] Transport: `src/net/transport/` (interfaces, in-memory pair, trystero rooms with a
   fallback strategy and an optional local ws relay), room codes, usernames.
4. [x] Host: `src/net/server/` (LanServer, NetServerHandler, EntityPlayerMP, ItemInWorldManager,
   EntityTracker(+Entry), PlayerManager chunk streaming, world listeners, validation and rate
   limits); multi-centre chunk loading in ChunkProviderClient and the worldgen worker.
5. [x] Guest: `src/net/client/` (WorldClient isRemote, NetClientHandler, EntityClientPlayerMP,
   PlayerControllerGuest, remote entity ticking, windows), GUI flow (GuiConnecting "Logging in",
   GuiDownloadTerrain, GuiDisconnected).
6. [x] GUI: usernames on GuiMultiplayer / GuiShareToLan, Direct Connect with room codes,
   "Room code" chat line with copy, TAB list, nameplates.
7. [ ] Node simulation test: host + guest Worlds over the in-memory transport.
8. [ ] Browser test: two contexts, host + join, block placement, chat, nameplates, screenshots.
9. [ ] Docs: docs/MULTIPLAYER.md, README section, ARCHITECTURE §13, TESTING.

## Decisions

- Star topology: the host joins the room as an active peer, guests join passive so they only
  connect to the host (trystero `passive`). Host and guests join on two strategies (Nostr,
  BitTorrent) at once; a guest uses whichever reaches the host first.
- Guests never run entity logic: entities on a guest are animated from network updates
  (interpolation, limb swing, body yaw, hurt/death timers, per-class visual hooks), so no
  server-only code needs isRemote gates. Guest worlds are `isRemote`: no world generation, block
  ticks, spawning or mob AI; `spawnEntityInWorld` refuses entities that did not come from the host.
- Host-side guests are `EntityPlayerMP` (server rules: damage, hunger, inventory, windows),
  positioned by the guest's movement packets after 1.5.2's NetServerHandler checks.

## Log

- (start) Survey done; dependencies installed.
- Protocol + transports + tests/netprotocol.test.ts (93 checks) committed.
- World hooks (World.netEvents etc.), host side (src/net/server), guest side (src/net/client),
  Minecraft integration (shareToLan, connectToRoom, guest world/respawn/disconnect), GUIs
  committed. Next: Node host+guest simulation test (tests/netsession.test.ts), then browser test.
