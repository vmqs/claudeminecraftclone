# Player slice (wave 2) progress

Branch `w2/player`, base 96e8639.

## Findings at start
- Already present: F5 back/front camera with the 8-ray block pull-in, view bobbing (incl. roll),
  smooth camera, F1, FOV flying/speed, potion storage/ticking/swirl particles on EntityLiving,
  Potion/PotionEffect/PotionHelper, /effect, splash application (EntityPotion), milk, night vision
  lightmap + flicker, blindness fog, RenderPlayer armour layers/leather tint/glint/held item/head
  block, ModelBiped walk/sneak/swing/bow/block/riding poses, GuiSleepMP + sleep overlay in GuiIngame,
  first-person eat/drink/bow animation (ItemRenderer), eat/drink sounds and crumbs.
- 1.5.2 has no sneak-to-dismount (added in 1.6): vehicles are left by right-clicking them again.

## Done
- [x] Sleeping (EntityPlayer.sleepInBedAt/wakeUpPlayer/sleepTimer/bed spawn, World skip-night,
      camera, RenderManager view, RenderPlayer lying pose, bed respawn)
- [x] FOV bow zoom, nausea distortion (timeInPortal, speed 7), blindness blocks sprinting
- [x] InventoryEffectRenderer (effect list beside the survival inventory)
- [x] RenderPlayer details (fishing rod -> stick, name tags), EntityOtherPlayerMP, eating flag
- [x] Beacon effect hook, FOV settling for captures
- [x] Node test tests/player.test.ts (59 checks) + scripts/scenarios/player.json (all checks pass)
- [x] Vanilla references: scratchpad ref/extra/player (private harness vanilla-player with
      otherplayer/bed/sleepin/useitem/armorcolor commands)

## Observed outside this slice (reported, not fixed)
- Bed render type 14 is not ported (fallback cube: top texture rotated, stray face) - renderblocks.
- Sky dome: a fog-interpolation triangle shows in the sleeping (north, pitch 0) view at x>=center,
  absent in vanilla - sky/GL quad split.
- Skull helmets need RenderBiped.skullRenderer from the skull tile-entity renderer.
