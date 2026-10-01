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

## Credits and legal

- Textures: **Classic Faithful 32x** for 1.5.2, by Vattic, Evorp and the Faithful team,
  <https://faithfulpack.net>. The pack is included unmodified in `resourcepacks/` under the
  [Faithful License](resourcepacks/FAITHFUL_LICENSE.txt).
- Sounds, music, fallback textures, and language files belong to **Mojang Studios**. They are
  downloaded from Mojang's servers at build time by `scripts/fetch-assets.mjs` and are not stored
  in this repository.
- This is a fan project. It is not affiliated with or endorsed by Mojang Studios or Microsoft.
  "Minecraft" is a trademark of Mojang Synergies AB.
