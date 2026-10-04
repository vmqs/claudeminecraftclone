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
- **Your model:** in the same screen **Model:** switches between Steve (with your skin) and
  polygon player models: three built in (John Marston, Trevor, Roblox Noob) and any you add with
  **Import Model...** (a `.glb`, `.gltf`, `.fbx` or `.obj` file with its textures, or a `.zip`
  of them). Imported models are scaled to a player's 1.8 blocks, turned to face forward, rigged
  from their skeleton (or by their shape when they have none) and animated like Steve; they are
  kept in the browser (**Delete Model** removes one). Other players in a room see your model
  (imported ones up to 3 MB).
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

## Controls and texture packs

Besides 1.5.2's keys there are three more, all changeable in **Options → Controls** (the list
scrolls): **Sprint** (I; hold it, or set **Sprint: Toggle** to switch sprinting on and off),
**Zoom** (C; hold to zoom in like OptiFine) and **Hotbar Slot 1-9** (1-9). Double-tapping
forward still sprints. **Reset Keys** puts every key back.

The game starts with the **Default** textures; the bundled Classic Faithful 32x pack is one click
away in **Options → Texture Packs**. **Open texture pack folder** there adds your own `.zip`
texture packs (or drop them on the page): 1.5 packs work as they are, and 1.6+ resource packs
are converted where 1.5.2 has a place for their textures (blocks, items, GUI, mobs,
environment, fonts); what has none, or changed shape since, is left out. Packs are kept in the
browser and can be deleted with their **X** button.

## Saved worlds

Worlds are saved in the browser (IndexedDB) the way 1.5.2 saves them: every 45 seconds, when you
pause, and on **Save and Quit to Title**, so they are still there after reloading the page.
**Singleplayer → Export** downloads the selected world as a `.zip` of a real 1.5.2 save folder
(`level.dat` and `region/*.mca`), which you can unzip into `.minecraft/saves/` and open in
Minecraft 1.5.2; **Import** adds such a `.zip` (a world folder zipped from 1.5.2's saves) to the
list. Clearing the browser's site data deletes the saves, so export worlds you want to keep.

## Credits and legal

- Textures: **Classic Faithful 32x** for 1.5.2, by Vattic, Evorp and the Faithful team,
  <https://faithfulpack.net>. The pack is included unmodified in `resourcepacks/` under the
  [Faithful License](resourcepacks/FAITHFUL_LICENSE.txt).
- Player models: user-supplied models: John Marston (Red Dead Redemption, Rockstar Games),
  Trevor Philips (GTA V, Rockstar Games), Roblox Noob (Roblox Corporation) — included at the
  repo owner's request. Converted into `public/models/` by `scripts/convert-models.mjs`.
- Sounds, music, fallback textures, and language files belong to **Mojang Studios**. They are
  downloaded from Mojang's servers at build time by `scripts/fetch-assets.mjs` and are not stored
  in this repository.
- This is a fan project. It is not affiliated with or endorsed by Mojang Studios or Microsoft.
  "Minecraft" is a trademark of Mojang Synergies AB.
