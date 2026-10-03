# Multiplayer

Peer-to-peer multiplayer modelled on 1.5.2's **Open to LAN**: one player's browser hosts the
world (the integrated server's role) and friends join it with a **room code**. Game data travels
over WebRTC data channels straight between the browsers; there is no game server. Rooms are found
through public signalling relays (Nostr, with BitTorrent trackers as a second route), which only
carry the WebRTC handshake.

## Playing

**Hosting.** Start or load a world, press Esc and choose **Open to LAN**. The screen has the
1.5.2 settings (**Game Mode** for other players, **Allow Cheats**) and a **Your Name** field. Press
**Start LAN World**. The chat shows

```
Local game hosted on room ABC123
Room code: ABC123 - share it with friends (copied to the clipboard)
```

Click that chat line (T to open the chat) to copy the code again; the pause menu shows it under
its title. While the world is open the game keeps running behind the pause menu and in a
background tab (more slowly, because browsers throttle hidden tabs). **Save and Quit to Title**
closes the room and every guest sees "Server closed".

**Joining.** From the title screen choose **Multiplayer**, type your name in the **Name** field
(top right), then **Direct Connect**, type the room code (letters are not case sensitive; spaces
and dashes are ignored) and press **Join Server**. **Add Server** saves a room code in the list
under a name, like a server address. The screens are 1.5.2's: *Connecting to the server...*,
*Logging in...*, *Downloading terrain*. In the game, the pause menu's **Disconnect** leaves.

**Names.** 3 to 16 letters, digits or underscores, remembered by the browser (the first default
is `Player` and three digits). Two players in one room cannot share a name ("The name Bob is
already taken"). Names show above players (hidden behind walls while they sneak, as in 1.5.2),
in chat, in the TAB list, in death messages and in commands (`@p`, `/tell Bob hi`, `/tp Bob`).
Everyone wears the Steve skin.

**Cheats.** With Allow Cheats on, guests may run every command; without it they keep `/tell`,
`/me`, `/help` and `/seed`. The host can always use commands its world allows.

**Coming back.** A guest who leaves and rejoins with the same name while the room is open gets
back their inventory, health, food and position. Worlds are not saved (see ARCHITECTURE §1),
so nothing survives the host closing the room.

**If joining fails.** *Could not connect to the host* means no host answered for that code (a
typo, or the host closed the room) or the browsers could not open a direct link. WebRTC uses
public STUN servers (Google, Cloudflare) to cross ordinary home NATs; strict NATs and firewalls
(some mobile, office and school networks) block direct links, and the game has no TURN relay
for them. Try another network. For private setups, both sides can add
`?relay=ws://host:port` to the page address to use a self-hosted trystero WebSocket relay for
signalling instead of the public ones (see Testing).

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
| `RoomCode.ts` | 6 characters from `ABCDEFGHJKMNPQRSTWXYZ23456789` (no 0/O, 1/I/L, U/V), drawn with `crypto.getRandomValues`; `normalizeRoomCode` accepts lower case, spaces and dashes; the trystero room is `room-<CODE>` under app id `mc152-html-vmqs-claudeminecraftclone`, with the code as the room password (encrypted signalling). |
| `Username.ts` | validation (`^[A-Za-z0-9_]{3,16}$`), the default name, `localStorage` key `mc152.username`. |
| `transport/Transport.ts` | `NetConnection` (binary messages, `pendingSends`), `HostTransport`, `GuestTransport`, `ConnectError`. |
| `transport/TrysteroTransport.ts` | WebRTC through trystero. Host and guests join the room on every signalling route (Nostr and BitTorrent; or only `?relay=` URLs). The host greets each peer that joins (`mc152-host`); a guest takes the first peer that greets it as the host, leaves the other routes and talks only to it (a star). The strategy modules load on demand, so single player never downloads them. A route that fails to join or a link that cannot be set up ends in "Could not connect to the host"; 30 s without a greeting too. |
| `transport/MemoryTransport.ts` | the same interfaces in memory (Node tests; `?net=memory` for one-page experiments). |
| `protocol/PacketBuffer.ts` | bounds-checked binary writer/reader (`ProtocolError` on any overrun). |
| `protocol/Packets.ts` | the packet table (1.5.2 ids and names), item stacks, entity metadata, frames and limits. |
| `protocol/ChunkCodec.ts` | a chunk's sections (blocks, metadata, sky and block light) and biomes, deflated with fflate; decoding checks every size. |
| `EntityNetData.ts` | per entity class: tracking range and update interval (EntityTracker.addEntityToTracker's table), spawn data (paintings, orbs, falling sand, arrows' shooters ...) and the networked metadata slots. |
| `server/LanServer.ts` | the room: logins, the player list, chunk streaming, block changes, tile entities, time, weather, sounds and particles, saving guests who leave. |
| `server/NetServerHandler.ts` | one guest: handshake, every guest packet with 1.5.2's checks, rate limits, keep-alive. |
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
the connection. `PROTOCOL_VERSION` is 1 and the handshake carries the game version `1.5.2`.

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
| 10 | Flying | guest | position (feet, stance), look, on ground |
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
| 201–205 | PlayerInfo, PlayerAbilities, AutoComplete, ClientInfo, ClientCommand | mixed | TAB list, flying, Tab completion, render distance, respawn |
| 250 | CustomPayload | both | `MC|ItemName` (anvil), `MC|Beacon`, `MC|BEdit` / `MC|BSign` |
| 255 | KickDisconnect | both | the reason on the disconnect screen |

### Host

`LanServer.tick()` runs after the host world's tick: read each guest's packets, finish logins
whose spawn chunks are ready, keep chunks loaded around every guest (`setExtraLoadCenters`; the
world generation worker keeps them too), stream chunks nearest first (4 per tick per guest,
paused while more than 24 messages wait in the data channel), send the tick's block changes
(one change, a multi-change under 64, or the whole chunk), update the entity tracker, flush
particles, send the time every 20 ticks and the ping list every 100. Sounds and effects reach
guests through `World.netEvents` (`WorldNetListener`) and the `IWorldAccess` the server adds,
with 1.5.2's exclusions (a guest does not get back the sounds of its own steps and swings).

Each guest's player is an `EntityPlayerMP` in the host world: damage, hunger, death, drops,
item use and windows follow the server rules. A guest's movement is applied after the
player's own tick with `NetServerHandler.handleFlying`'s checks (illegal stance or position kicks;
"moved too quickly", more than 32 blocks or "moved wrongly" into blocks puts the guest back;
flight is allowed as on a LAN world). Digging follows `ItemInWorldManager` (Survival breaks only
after 70 % of the block's time, reach 6 blocks); placing and using items check reach and resend
the blocks the guest may have predicted wrong. Commands run with the guest as the sender and
`canCommandSenderUseCommand` follows Allow Cheats.

**Validation and limits.** Message and packet caps above; 40 packets per tick per guest with a
burst of 600 (more is a kick); chat spam (1.5.2's counter) and illegal characters kick; creative
set slot only in Creative and only for slots 1–44; window clicks are compared with the server's
result and refused (Transaction false + full resend) when they differ; sign lines longer than 15
characters or with illegal characters become `!?` as in 1.5.2; entity interaction reach
6 blocks (3 through walls); a guest that sends nothing for 30 s is dropped; the host times out a
login that cannot finish. Unknown item ids decode as empty stacks.

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
("Server closed", "The name X is already taken", "Outdated server! I'm still on 1.5.2",
"You have died. Game over, man, it's game over!" in Hardcore), "Timed out", or the transport's
"Could not connect to the host ...".

## Testing

```sh
node scripts/run-node-test.mjs tests/netprotocol.test.ts   # codecs, frames, limits, fuzzing, room codes, names
node scripts/run-node-test.mjs tests/netsession.test.ts    # host World + guests over the in-memory transport
npm run build && node scripts/mp-test.mjs --out shots/mp     # two browser contexts, real WebRTC
```

`tests/netsession.test.ts` runs a real host `World` and `LanServer` with guests joining over
`MemoryTransport`: login and chunks, movement checks, digging and placing both ways, chat and
commands, `/tell` and `/tp` by name, `@p`, a tracked mob and dropped items, a chest window, death and
respawn, two guests, the TAB list, packet floods, malformed packets, name clashes, version
mismatch, leaving and coming back, and the host closing the room.

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
  each other; fine for a handful of players.
- Villager trading, maps (map item data) and command block editing are not networked: guests
  cannot trade, see blank maps, and their command block edits stay local.
- Guests do not predict entity interactions (a bucket on a cow, shearing) until the host answers,
  and remote entities only approximate their client-side animation state.
- A hidden host tab keeps ticking from a timer, but browsers throttle background timers (to about
  once a second), so the world runs at about half speed; keep the host's tab visible.
