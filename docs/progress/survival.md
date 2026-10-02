# Survival slice progress (w2/survival)

Base: 96e8639. Commits are small; each typechecks and builds.

## Plan
1. [x] EnumGameType + PlayerControllerMP (survival branch: break progress, tool wear, harvest, reach 4.5) wired into Minecraft
2. [x] FoodStats + EntityPlayer hunger/exhaustion/regen/starvation, canEat, CombatTracker death messages, spawn protection
3. [ ] Crack overlay (destroy_0..9) via RenderGlobal.destroyBlockPartially / drawBlockDamageTexture
4. [ ] HUD check vs GuiIngame (hearts, armour, food, air, XP), sprint gate, hurt camera
5. [x] Death / respawn (bed or spawn, keep game type) — [ ] hardcore kick screen
6. [x] /gamemode live switching through EntityPlayer.setGameType, ?mode= dev param, mc.dev.survival
7. [ ] Node tests + scripts/scenarios/survival.json + screenshots

## Reference captures
Vanilla survival HUD/crack/gameover shots: scratchpad/ref/extra/survival/ (private harness copy in
scratchpad/vanilla-surv with servercmd/health/food/armor/xpadd/hurtflash/crack commands).

## Log
- Controller: PlayerControllerMP extends PlayerControllerCreative (keeps the inventory slice's API).
- Difficulty now follows options (GameSettings.onSettingsSaved) and is Hard in Hardcore.
