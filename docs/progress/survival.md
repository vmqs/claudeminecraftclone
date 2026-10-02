# Survival slice progress (w2/survival)

Base: 96e8639. Commits are small; each typechecks and builds.

## Plan
1. [ ] EnumGameType + PlayerControllerMP (survival branch: break progress, tool wear, harvest, reach 4.5)
2. [ ] FoodStats + EntityPlayer hunger/exhaustion/regen/starvation, canEat, sprint gate
3. [ ] Crack overlay (destroy_0..9) via RenderGlobal.destroyBlockPartially / drawBlockDamageTexture
4. [ ] HUD check vs GuiIngame (hearts, armour, food, air, XP), F3
5. [ ] Death / respawn (bed or spawn, keep game type), hardcore screen
6. [ ] /gamemode live switching, /xp, ?mode= dev param
7. [ ] Node tests + scripts/scenarios/survival.json + screenshots

## Log
