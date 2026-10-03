# Multiplayer

Peer-to-peer multiplayer modelled on 1.5.2's **Open to LAN**: one player's browser hosts the
world (the integrated server's role) and friends join it with a **room code**. Game data travels
over WebRTC data channels straight between the browsers; there is no game server. Rooms are found
through public signalling relays (Nostr, with BitTorrent trackers as a second route), which only
carry the WebRTC handshake. See **Privacy and security** below for what that exposes.

## Playing

**Hosting.** Start or load a world, press Esc and choose **Open to LAN**. The screen has the
1.5.2 settings (**Game Mode** for other players, **Allow Cheats**) and a **Your Name** field. Press
**Start LAN World**. The chat shows

```
Local game hosted on room ABCD-EFGH
Room code: ABCD-EFGH - share it with friends (copied to the clipboard)
```

`/publish` does the same from the chat (Survival for the others, no cheats), as in 1.5.2.

Click that chat line (T to open the chat) to copy the code again; the pause menu shows it under
its title. While the world is open the game keeps running behind the pause menu and in a
background tab (more slowly, because browsers throttle hidden tabs). **Save and Quit to Title**
closes the room and every guest sees "Server closed".

**Joining.** From the title screen choose **Multiplayer**, type your name in the **Name** field
(top right), then **Direct Connect**, type the room code (8 letters and digits; not case
sensitive; spaces and dashes are ignored) and press **Join Server**. **Add Server** saves a room code in the list
under a name, like a server address. The screens are 1.5.2's: *Connecting to the server...*,
*Logging in...*, *Downloading terrain*. In the game, the pause menu's **Disconnect** leaves.

**Names.** 3 to 16 letters, digits or underscores, remembered by the browser (the first default
is `Player` and three digits). Two players in one room cannot share a name ("The name Bob is
already taken"). Names show above players (hidden behind walls while they sneak, as in 1.5.2),
in chat, in the TAB list, in death messages and in commands (`@p`, `/tell Bob hi`, `/tp Bob`).
Everyone wears the Steve skin.

**Cheats.** With Allow Cheats on, guests may run every command except the host's own (below);
without it they keep `/tell`, `/me`, `/help` and `/seed`. The host can always use commands its
world allows.

**Keeping order (host only).** The dedicated server's `/kick <name> [reason]`, `/ban <name>
[reason]`, `/pardon <name>`, `/banlist` and `/whitelist on|off|list|add|remove` work on the LAN
game (1.5.2 had them only on dedicated servers). Bans and the whitelist last until the room
closes; `/ban` also ignores the banned guest's browser tab for 12 hours, so a new name from it
does not get in; `/whitelist on` keeps everyone already playing and closes the game to new
players. Guests never get these commands or `/publish`.

**Coming back.** After the login the host gives each guest a random rejoin token, which the
browser keeps for that room and name. A guest who leaves and rejoins with the same name and
token while the room is open gets back their inventory, health, food and position. Without the
token (another browser, someone else) the name is refused for 30 minutes after the guest left
("Bob left this game a short while ago ..."), so nobody can pick up someone else's things.
Logging in again while the old connection is still open (a reloaded tab) replaces the old one
when the token matches ("You logged in from another location", as in 1.5.2). A guest who dies
in Hardcore is kicked when it respawns and cannot come back under that name. Worlds are not
saved (see ARCHITECTURE §1), so nothing survives the host closing the room.

**If joining fails.** *Could not connect to the host* means no host answered for that code (a
typo, or the host closed the room) or the browsers could not open a direct link. WebRTC uses
public STUN servers (Google, Cloudflare) to cross ordinary home NATs; strict NATs and firewalls
(some mobile, office and school networks) block direct links, and the game has no TURN relay
for them. Try another network. For private setups, both sides can add
`?dev=1&relay=ws://host:port` to the page address to use a self-hosted trystero WebSocket relay
for signalling instead of the public ones (see Testing; `?relay=` without `?dev=1` is ignored,
so a crafted link cannot reroute a player). *Two players claim to host room ...* means a second
member of the room greeted the guest as its host: someone may be pretending to be the host.
*Outdated server!* / *Outdated client!* name the host's build and both protocol numbers; whoever
runs the older page should reload it.

## Privacy and security

- **The room code is the key.** Codes have 8 characters from 29 (about 2^39). The signalling
  room id and the password trystero encrypts the WebRTC offers with are the two halves of
  PBKDF2-SHA256 over the code (200 000 iterations), never the code itself. The relays and anyone
  watching them see only a hash of the room id; turning those back into codes would take years
  of GPU time instead of the seconds a plain 6-character code took. Share the code only with
  the people you want in the room.
- **Everyone in a room sees everyone's IP address.** WebRTC links browsers directly, so the
  host and every guest learn each other's IP addresses (trystero links every member of a room
  to every other). Only play with people you would give your IP address to.
- **The host is the server.** A guest cannot crash or take over the host (see **Validation and
  limits**), but the host's browser sees everything its guests do, as a server would.
- **Impostors.** Every member of a room can claim to be its host. A guest waits 1.5 s after
  the first greeting and gives up when a second peer also greets ("Two players claim to host
  room ..."), during the join or later, so an impostor can block a join but not take it over
  unnoticed. The greeting is not signed (see Known gaps).

## Design

The host stays a normal single-player game: its `World` is authoritative and keeps every rule.
A `LanServer` beside it plays the integrated server's network half for the guests. Guests run
the same client, but with a `WorldClient` that only shows what the host sends.

```
Host browser                                         Guest browser
------------                                         -------------
Minecraft (single player, unchanged)                 Minecraft
 ├─ World (authoritative)                             ├─ WorldClient (isRemote: no world gen,
 │   └─ netEvents / IWorldAccess ─┐                   │   block ticks, spawning or mob AI)
 └─ LanServer                     │                   ├─ NetClientHandler ── packets ──> world,
     ├─ NetServerHandler per guest│ <── frames ──>    │   entities, windows, chat, TAB list
     │   └─ EntityPlayerMP (rules)│    (WebRTC)       ├─ EntityClientPlayerMP (reports moves)
     ├─ EntityTracker(+Entry) <───┘                   └─ PlayerControllerGuest (dig/place/use
     └─ chunk streaming (PlayerManager)                    sent to the host)
```

### Modules (`src/net/`)

| Module | Role |
|---|---|
| `RoomCode.ts` | 8 characters from `ABCDEFGHJKMNPQRSTWXYZ23456789` (no 0/O, 1/I/L, U/V), drawn with `crypto.getRandomValues`, shown as `ABCD-EFGH`; `normalizeRoomCode` accepts lower case, spaces and dashes; `deriveRoomKeys` makes the trystero room id and password (app id `mc152-html-vmqs-claudeminecraftclone`) from PBKDF2 over the code. |
| `RejoinTokens.ts` | the rejoin tokens a guest was given, in `localStorage` (`mc152.rejoin`) per room code and name (the 16 newest rooms). |
| `Username.ts` | validation (`^[A-Za-z0-9_]{3,16}$`), the default name, `localStorage` key `mc152.username`. |
| `transport/Transport.ts` | `NetConnection` (binary messages, `pendingSends`), `HostTransport`, `GuestTransport`, `ConnectError`. |
| `transport/TrysteroTransport.ts` | WebRTC through trystero. Host and guests join the room on every signalling route (Nostr and BitTorrent; or only `?relay=` URLs). The host greets each peer that joins (`mc152-host`); a guest confirms the first peer that greets it as the host after 1.5 s (a second greeter ends the join), leaves the other routes and talks only to it (a star). It sets the per-peer buffer limits of the patched trystero (below) and closes peers over them; the host ignores peers it closed until they leave the room (a minute after a protocol kick, 12 hours after `/ban`). The strategy modules load on demand, so single player never downloads them. A route that fails to join or a link that cannot be set up ends in "Could not connect to the host"; 30 s without a greeting too. |
| `transport/MemoryTransport.ts` | the same interfaces in memory (Node tests; `?net=memory` for one-page experiments). |
| `protocol/PacketBuffer.ts` | bounds-checked binary writer/reader (`ProtocolError` on any overrun). |
| `protocol/Packets.ts` | the packet table (1.5.2 ids and names), item stacks, entity metadata, frames and limits. |
| `protocol/ItemTags.ts` | item tags read from the network are rebuilt from a whitelist of the keys 1.5.2's items use (`ench`, `StoredEnchantments`, `display`, `RepairCost`, book pages, `SkullOwner`, `CustomPotionEffects`, fireworks), with types and limits (enchantment levels up to 10, potion amplifiers up to 9, list lengths), in arrival order so well-formed tags round-trip unchanged. |
| `protocol/ChunkCodec.ts` | a chunk's sections (blocks, metadata, sky and block light) and biomes, deflated with fflate; decoding checks every size. |
| `EntityNetData.ts` | per entity class: tracking range and update interval (EntityTracker.addEntityToTracker's table), spawn data (paintings, orbs, falling sand, arrows' shooters ...) and the networked metadata slots. |
| `server/LanServer.ts` | the room: logins, the player list, chunk streaming, block changes, tile entities, time, weather, sounds and particles, saving guests who leave. |
| `server/NetServerHandler.ts` | one guest: handshake, every guest packet with 1.5.2's checks, movement and action limits, keep-alive. |
| `server/CreativeItems.ts` | which stacks a creative guest may create: what the creative inventory offers, worn tools of those, and the few survival-only stacks (maps, brewed potions, written books, rockets, huge mushrooms, the dragon egg). |
| `server/EntityPlayerMP.ts`, `ItemInWorldManager.ts` | the guest's player on the host (server rules) and its digging/placing state. |
| `server/EntityTracker.ts` | which guest sees which entity, and the spawn / move / look / velocity / metadata / equipment / riding packets. |
| `client/NetClientHandler.ts` | the guest's half: applies everything the host sends. |
| `client/WorldClient.ts`, `RemoteEntityTick.ts`, `RemoteEntityVisuals.ts` | the remote world and how its entities move between updates (interpolation, limb swing, body yaw, hurt and death timers, per-class animation state). |
| `client/EntityClientPlayerMP.ts`, `PlayerControllerGuest.ts` | the guest's own player and controller (1.5.2's client classes). |

### Protocol

Every message is a **frame**: the byte `0x4D`, a varint packet count, then each packet as a
varint length and its bytes (a one-byte id and the fields of the schema in `Packets.ts`). Frames
from a guest may hold 64 KiB and 256 packets; frames from the host 8 MiB and 8192 packets
(a chunk goes in a frame of its own). Strings, lists, item NBT, metadata and JSON fields have
their own caps; a packet that a side may not send (`allowedFrom`) or that breaks a limit closes
the connection. `PROTOCOL_VERSION` is 2 (2 added Packet200Statistic) and the handshake carries the game version `1.5.2`.
The layouts of Handshake and KickDisconnect never change (`tests/netprotocol.test.ts` pins their
bytes), so builds of different protocols still read each other's refusal.

Below the game's frames, trystero cuts messages into 16 KiB chunks and reassembles them before
the game sees them; it had no limit there. `scripts/patch-trystero.mjs` (run on `postinstall`,
`npm run dev` and `npm run build`; it fails if trystero's code changed) patches its action wire
layer: data for action types the page never created is dropped, and a peer whose unfinished
messages pass `globalThis.__mc152TrysteroLimits` (host: 80 KiB per message, 256 KiB and 16
messages per peer; guests: 8 MiB + 64 KiB, 16 MiB, 64) is reported, ignored and its link
closed. `tests/nettransport.test.ts` checks the patched layer.

| Id | Packet | Direction | Notes |
|---|---|---|---|
| 0 | KeepAlive | both | every second; the echo is the ping in the TAB list |
| 1 | Login | host | entity id, mode, hardcore, difficulty, world type, spawn, view distance, cheats |
| 2 | Handshake | guest | protocol version, username |
| 3 | Chat | both | guests: 100 characters, commands with `/` |
| 4 | UpdateTime | host | every 20 ticks |
| 5 | PlayerInventory | host | held item and armour of an entity |
| 6 | SpawnPosition | host | compass |
| 7 | UseEntity | guest | interact or attack |
| 8 | UpdateHealth | host | health, food, saturation |
| 9 | Respawn | host | after death |
| 10 | Flying | guest | position (feet, stance), look, on ground; while riding: steering motion in x/z with y = stance = -999 |
| 13 | PlayerPosLook | host | spawn, teleport, correction |
| 14 | BlockDig | guest | start / abort / finish, drop stack / item, release use |
| 15 | Place | guest | use the held item on a face (255: in the air) |
| 16 | BlockItemSwitch | both | hotbar slot |
| 17 | Sleep | host | an entity in a bed |
| 18 | Animation | both | swing, hurt, wake, critical hits |
| 19 | EntityAction | guest | sneak, sprint, leave bed |
| 20 | NamedEntitySpawn | host | another player |
| 22 | Collect | host | item/orb pick-up animation |
| 24 | SpawnEntity | host | any other entity by EntityList name, with spawn data and metadata |
| 28 | EntityVelocity | host | |
| 29 | DestroyEntity | host | |
| 31–35 | RelEntityMove, EntityLook, RelEntityMoveLook, EntityTeleport, EntityHeadRotation | host | 1/32 block, 1/256 turn |
| 38 | EntityStatus | host | `handleHealthUpdate` codes |
| 39 | AttachEntity | host | riding |
| 40 | EntityMetadata | host | changed watcher slots |
| 41, 42 | EntityEffect, RemoveEntityEffect | host | the guest's potion effects |
| 43 | Experience | host | |
| 50 | UnloadChunk | host | |
| 51 | MapChunk | host | ChunkCodec bytes + tile entity descriptions |
| 52, 53 | MultiBlockChange, BlockChange | host | coalesced per tick and chunk |
| 54 | BlockEvent | host | note blocks, pistons, chest lids |
| 55 | BlockDestroy | host | other players' crack progress |
| 60 | Explosion | host | blocks and the push on the guest |
| 61, 62, 63 | AuxSFX, LevelSound, WorldParticles | host | sounds and particles near the guest |
| 70, 71 | GameEvent, Weather | host | rain, mode change; lightning |
| 100–108 | OpenWindow, CloseWindow, WindowClick, SetSlot, WindowItems, UpdateProgressBar, Transaction, CreativeSetSlot, EnchantItem | mixed | 1.5.2's container sync (`ICrafting` crafters on `Container`) |
| 130, 132 | UpdateSign, TileEntityData | both / host | |
| 200 | Statistic | host | a statistic the host counted for the guest's player (amounts above 100 split); the guest counts the independent ones (movement, jumps, play time) itself and applies the achievement parent rule, as 1.5.2's client did |
| 201–205 | PlayerInfo, PlayerAbilities, AutoComplete, ClientInfo, ClientCommand | mixed | TAB list, flying, Tab completion, render distance and chat visibility (sent when they change), respawn |
| 250 | CustomPayload | both | `MC|ItemName` (anvil), `MC|Beacon`, `MC|BEdit` / `MC|BSign`, `MC|Rejoin` (the 16-byte rejoin token: host to guest after the login, guest to host right after the handshake) |
| 255 | KickDisconnect | both | the reason on the disconnect screen |

### Host

`LanServer.tick()` runs after the host world's tick: read each guest's packets, check and finish
logins whose spawn chunks are ready, keep chunks loaded around every guest
(`setExtraLoadCenters`; the world generation worker keeps them too), stream chunks nearest first
(4 per tick per guest, paused while more than 24 messages wait in the data channel; compressing
them shares a 4 ms budget per tick across all guests, which take turns at the front, and a chunk
already compressed for another guest is free), send the tick's block changes (one change, a
multi-change under 64, or the whole chunk; a change drops the compressed copies of the 3x3
chunks around it, as its light reaches them), update the entity tracker, flush particles, send
the time every 20 ticks and the ping list every 100. Each guest is streamed its own render
distance (far 12, normal 8, short 4, tiny 2 chunks), at most 10 (1.5.2's integrated server). Sounds and effects reach
guests through `World.netEvents` (`WorldNetListener`) and the `IWorldAccess` the server adds,
with 1.5.2's exclusions (a guest does not get back the sounds of its own steps and swings).

Each guest's player is an `EntityPlayerMP` in the host world: damage, hunger, death, drops,
item use and windows follow the server rules. A guest's movement is applied after the
player's own tick with `NetServerHandler.handleFlying`'s checks: illegal stance or position kicks;
"moved wrongly" into blocks puts the guest back; flight is allowed as on a LAN world. Moves are
applied at a client's rate (one per host tick, or one per 50 ms of real time when the host runs
slow, with a catch-up of 5), and each may cover only what a player can move in a tick (1 block,
2.5 with flight allowed, more with Speed; 1.5 up and 4 down), plus a push the host gave the
player (knockback, explosions) for the next 2 s; anything more is put back ("moved too
quickly"). 1.5.2's own check compared the move with the server-side motion and caught almost
nothing. A riding guest sends its steering (1.5.2's Packet13 with y = stance = -999; "Nope!"
above 1 block a tick), which becomes the rider's motion that boats read. Digging follows `ItemInWorldManager` (Survival breaks only
after 70 % of the block's time, reach 6 blocks); placing and using items check reach and resend
the blocks the guest may have predicted wrong. Commands run with the guest as the sender and
`canCommandSenderUseCommand` follows Allow Cheats.

**Validation and limits.** Message and packet caps above; 40 packets per tick per guest with a
burst of 600 (more is a kick, and the host ignores that browser tab for a minute, as for
malformed data); per-kind limits that drop what is over them and resend the blocks the guest
predicted (placing 1 per tick with a burst of 8, starting to dig 1 per tick with 10, creative
breaks 1 per 2 ticks with 6, entity use and arm swings 2 per tick with 10, and with cheats on,
chat and commands 1 per 5 ticks with 10); chat spam (1.5.2's counter, without cheats) and
illegal characters kick; item tags are whitelisted when read (`ItemTags.ts`); creative set slot
only in Creative, only for slots 1–44 and only for stacks `CreativeItems.ts` allows; window
clicks are compared with the server's result and refused (Transaction false + full resend) when
they differ; sign lines longer than 15 characters or with illegal characters become `!?` as in
1.5.2, and a guest may write only the sign it just placed, once; book pages and titles lose
formatting codes and control characters; entity interaction reach 6 blocks (3 through walls),
only on what the crosshair can pick (not dropped items, orbs or arrows); Leave Bed only for a
sleeping player; a dead guest's world actions are ignored; a guest that sends nothing for 30 s
is dropped; the host times out a login that cannot finish. Unknown item ids decode as empty
stacks. On the host, an entity whose tick throws while the room is open is removed (or its
guest kicked) instead of stopping the tick, and the renderer skips an entity that throws.

### Guest

`WorldClient.isRemote` is true: the guest generates no terrain, runs no block ticks, spawns no
mobs and runs no entity AI. Entities come only from the host and are animated by
`tickRemoteEntity` (three-step interpolation like `setPositionAndRotation2`, living-entity limb
swing, body rotation, hurt and death timers, and per-class visual state such as chicken wings,
slime squish, creeper swelling and wolf head tilt). Other players are `EntityOtherPlayerMP`.

The guest's own player is an `EntityClientPlayerMP`: it moves locally (client-authoritative,
sanity-checked by the host) and reports position, look, sneaking and sprinting every tick.
`PlayerControllerGuest` ports 1.5.2's `PlayerControllerMP`: digging shows local progress and
sends start/abort/finish; placing predicts the block and sends `Place`; attacks and entity
interactions are only sent. Windows open when the host says so, and clicks are applied locally
and confirmed by `Transaction`. `EntityPlayer.isClientSide()` keeps server-only rules (food,
item use results, spawn protection) off guest players and off `EntityOtherPlayerMP` copies.

Disconnects end on `GuiDisconnected` with the reason: the host's kick message
("Server closed", "The name X is already taken", "X left this game a short while ago ...",
"You logged in from another location", "Outdated server! the host runs build ... (protocol 1),
you protocol 2 ...", "You have died. Game over, man, it's game over!" in Hardcore, a /kick or
/ban reason), "Timed out", or the transport's "Could not connect to the host ..." and "Two
players claim to host room ...".

## Testing

```sh
node scripts/run-node-test.mjs tests/netprotocol.test.ts   # codecs, frames, limits, item tags, fuzzing, room codes and keys, names
node scripts/run-node-test.mjs tests/nettransport.test.ts  # the patched trystero wire layer (buffer limits)
node scripts/run-node-test.mjs tests/netsession.test.ts    # host World + guests over the in-memory transport
npm run build && node scripts/mp-test.mjs --out shots/mp     # two browser contexts, real WebRTC
```

`tests/netsession.test.ts` runs a real host `World` and `LanServer` with guests joining over
`MemoryTransport`: login and chunks, movement checks, digging and placing both ways, chat and
commands, `/tell` and `/tp` by name, `@p`, a tracked mob and dropped items, a mob through
whole-chunk resends, a chest window, closing the own inventory and still getting pickups,
signs, a boat steered by a guest, death and respawn, creative items with bad tags or technical
ids, a throwing entity, two guests, light for a late joiner, render distance, the TAB list,
packet floods, a speed hack, a creative nuker, the bed teleport, malformed packets, name clashes,
version mismatch, leaving and coming back (with and without the rejoin token, a second login),
Hardcore deaths, /kick, /ban, /pardon and /whitelist, and the host closing the room.

`scripts/mp-test.mjs` starts `vite preview` (port 4400) and a local trystero WebSocket relay
(port 4401), opens two contexts in headless Chromium (host `Alice`, guest `Bob`), and walks
through Open to LAN, Multiplayer, Direct Connect, joining, block placement on both sides, chat
typed on both sides, nameplates, the TAB list, sneaking and the host leaving, with screenshots
of each step. `--public` signals through the public relays instead (needs a browser with
internet access). Data always goes over real WebRTC data channels.

`mc.dev.net` (with `?dev=1`): `host(name?, mode?, cheats?)` resolves with the room code,
`join(code, name?)` goes through Direct Connect, `state()` (role, code, players, chunks,
entities, other players, bytes, the open network screen), `chat(n)`, `leave()`. The debug
screens `multiplayer`, `directconnect`, `sharetolan` and `pause` open with `mc.dev.screen(name)`.

## Known gaps

- No TURN relay: browsers behind strict NATs or firewalls cannot link up.
- Every peer in a trystero room links to every other, so guests also open (unused) links to
  each other and see each other's IP addresses; fine for a handful of players.
- The host's greeting is not signed: an impostor in the room is detected (a second greeting
  ends the join), not prevented. A host key whose fingerprint is part of the code would fix
  that, at the cost of longer codes.
- Villager trading, maps (map item data) and command block editing are not networked: guests
  cannot trade, see blank maps, and their command block edits stay local.
- Guests do not predict entity interactions (a bucket on a cow, shearing) until the host answers,
  and remote entities only approximate their client-side animation state.
- A hidden host tab keeps ticking from a timer, but browsers throttle background timers (to about
  once a second), so the world runs at about half speed; keep the host's tab visible.
- Movement limits are per packet: a guest can still move at the top speed of its mode
  everywhere (no floating check, as on a 1.5.2 LAN world, which allowed flight), and creative
  guests pass through blocks as in 1.5.2.
