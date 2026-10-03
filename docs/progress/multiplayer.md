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
7. [x] Node simulation test: host + guest Worlds over the in-memory transport.
8. [x] Browser test: two contexts, host + join, block placement, chat, nameplates, screenshots.
9. [x] Docs: docs/MULTIPLAYER.md, README section, ARCHITECTURE §13, TESTING.

## Decisions

- Star topology over a trystero room: every peer joins actively (passive guests waited for the
  host's next announcement, up to a minute); the host greets each peer that joins with a 'host'
  message and a guest talks only to the first peer that greets it. Host and guests join on two
  strategies (Nostr, BitTorrent) at once; a guest keeps whichever greets first and leaves the
  other. `?relay=` switches to a self-hosted ws relay (the browser test).
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
- Node simulation test (tests/netsession.test.ts, 78 checks) and protocol test (93) pass.
- Browser test scripts/mp-test.mjs: 14/14 over a local relay and real WebRTC (host-side
  teleport for the face-to-face shots: a guest's own 6+ block jump from the world spawn is
  corrected by the host, as in 1.5.2). Public relays are unreachable from the sandbox's
  Chromium (TLS interception), so `--public` could not be exercised here.
- Docs: docs/MULTIPLAYER.md, README "Multiplayer", ARCHITECTURE §1/§3/§5.6/§12/§13, TESTING.

## Review fixes (after e451cc9)

Working through the runtime + security review findings, blockers and majors first, one commit
each (with a netsession / netprotocol check where it can be tested in Node).

- [x] Blocker: closing the guest's own inventory (CloseWindow 0) took it off its
  inventoryContainer's crafters; only discarded windows drop the crafter now.
- [x] Blocker: item tags are rebuilt from a whitelist when read (`protocol/ItemTags.ts`), creative
  set slot only takes stacks the creative inventory or survival can make (`server/CreativeItems.ts`),
  a throwing entity tick is contained on a LAN host (`WorldNetListener.entityTickFailed`) and a
  throwing entity renderer is skipped with the matrix stack restored (RenderGlobal).
- [x] Blocker: trystero buffered unlimited data per peer. `scripts/patch-trystero.mjs` (postinstall,
  dev, build) patches its action wire layer: unknown action types dropped, per-peer limits on
  unfinished messages (`globalThis.__mc152TrysteroLimits`, set by TrysteroHost/Guest), violators
  reported and ignored. The host handles its own 'host' action, ignores peers it closed until
  they leave (60 s for protocol abuse), and guests detect a second "host" (impostor) and fail.
  `tests/nettransport.test.ts` checks the patched wire layer.
- [x] Major: a whole-chunk resend (64+ changes, explosions) unloaded the chunk's entities on the
  guest; they now move to the new chunk object first.
- [x] Major: boats could not be steered by guests; riding guests send Packet13-style steering
  (motion in x/z, y = stance = -999, moving bit set) and the host sets the rider's motion
  ("Nope!" above 1 block/tick), as 1.5.2's NetServerHandler.
- [x] Major: speed/teleport hacks. Guest moves are applied at the client's tick rate (a token
  bucket per host tick, or per 50 ms of real time when the host runs slow; burst 5) and each
  packet may cover at most 1 block (2.5 with flight allowed, scaled by Speed; 1.5 up, 4 down),
  wider for 2 s after the host pushes the player (tracker velocity, explosions). More is put back.
- [x] Major: room codes are 8 characters (ABCD-EFGH, about 2^39) and the signalling room id and
  password are PBKDF2-SHA256 (200k iterations) halves of the code, so relay observers cannot
  enumerate rooms cheaply. TODO in docs: say plainly that every peer in a room sees the others'
  IP addresses; host moderation is /kick, /ban, /whitelist (minor fixes below).
- [x] Major: saved guest state is tied to a 128-bit rejoin token (MC|Rejoin custom payload both
  ways; the guest keeps it in localStorage per room and name, `net/RejoinTokens.ts`). Without it a
  departed guest's name is refused for 30 min; a second login with the token replaces the first
  ("You logged in from another location", also the minor relogin finding). Saved states capped at 64.
- [x] Major: a Hardcore death keeps the name out for the session (respawn kick, or leaving dead).
- [x] Major: per-guest action limits (dropped, not kicked; blocks resent): place 1/tick burst 8,
  dig start 1/tick burst 10 (creative breaks 0.5/tick burst 6), entity use and swings 2/tick
  burst 10, chat/commands with cheats on 1 per 5 ticks burst 10.
- [x] Major: host impostor: guests wait 1.5 s after the first greeting and fail on a second
  "host" (done with the transport commit). A signed greeting (ECDSA key in the code) is not done.
