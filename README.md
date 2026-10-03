# Minecraft 1.5.2 in the browser

A recreation of **Minecraft 1.5.2 (Java Edition), Creative mode**, built with TypeScript
and WebGL2. It aims to look, sound, and feel like the original: terrain generation, lighting,
physics, mobs, menus, the creative inventory, and sounds.

Run it locally:

```sh
npm install
npm run dev      # downloads the original 1.5.2 assets on first run, then serves on :5173
```

- `npm run build` creates a static production build in `dist/`.
- `npm run typecheck` runs the TypeScript compiler without emitting.
- `scripts/decompile.sh` rebuilds the decompiled reference source used during development (see `docs/RESEARCH.md`).

Pushes to `main` deploy to GitHub Pages through `.github/workflows/deploy.yml`. To turn this on,
set **Settings → Pages → Source** to **GitHub Actions**.

See `docs/ARCHITECTURE.md` for how the code is organised.

## Multiplayer

Play with friends the way 1.5.2's **Open to LAN** works, but over the internet: one player's
browser hosts the world and the others join it with a room code. The browsers connect directly
to each other (WebRTC); there is no game server to run.

- **Your name and skin:** title screen (or Options) → **Account Manager**. Type your name and
  press **Upload Skin...** to wear a 64x32 or 64x64 PNG skin (a turning preview shows it);
  **Reset to Steve** goes back to the default. Both are remembered by the browser, and the other
  players in a room see your skin.
- **Host:** in your world press Esc → **Open to LAN**, pick the game mode for other players and
  Allow Cheats, then **Start LAN World** (or type `/publish`). The chat shows a
  code such as `Room code: K7XQ-2MHB` (also copied to the clipboard, and shown on the pause
  menu). Keep the tab open and visible while others play. `/kick`, `/ban`, `/pardon` and
  `/whitelist on` keep order.
- **Join:** title screen → **Multiplayer** → **Room Code**, enter the code and **Join Server**.
  **Direct Connect**, **Add server** and the server list take real server addresses
  (`host[:port]`) as in 1.5.2; a browser cannot open a direct connection to a Minecraft server
  yet, so they end on "Failed to connect to the server" (see `docs/MULTIPLAYER.md` for the
  connector hook a proxy could plug into).
- **Names** are 3–16 letters, digits or underscores, are remembered by the browser and must be
  unique in a room. They show above players, in chat, in the TAB list and in commands. Coming
  back to a room from the same browser gives you your things back.
- **Privacy:** the room code is the only key to a room, so share it only with your friends.
  Players in a room connect directly, so **everyone in a room sees everyone else's IP
  address**.

Finding a room uses public signalling relays (Nostr and BitTorrent trackers). Most home
networks connect fine; strict NATs and firewalls (some office, school and mobile networks)
block direct links and would need a TURN relay, which the game does not provide. Details,
the protocol and its limits: `docs/MULTIPLAYER.md`.

## Credits and legal

- Textures: **Classic Faithful 32x** for 1.5.2, by Vattic, Evorp and the Faithful team,
  <https://faithfulpack.net>. The pack is included unmodified in `resourcepacks/` under the
  [Faithful License](resourcepacks/FAITHFUL_LICENSE.txt).
- Sounds, music, fallback textures, and language files belong to **Mojang Studios**. They are
  downloaded from Mojang's servers at build time by `scripts/fetch-assets.mjs` and are not stored
  in this repository.
- This is a fan project. It is not affiliated with or endorsed by Mojang Studios or Microsoft.
  "Minecraft" is a trademark of Mojang Synergies AB.
