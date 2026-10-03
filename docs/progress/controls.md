# Wave 4: controls and texture packs (branch w4/controls)

Done:
- GameSettings: Sprint (I), Zoom (C), Hotbar Slot 1-9 (1-9) bindings, `toggleSprint` option,
  Reset Keys; English fallback names in `src/client/ControlsText.ts`.
- Hotbar keys used by the HUD (Minecraft.handleKeyBindings) and container swaps (GuiContainer).
- Sprint key hold/toggle (MovementInput.sprint, EntityPlayerSP.updateSprintKey).
- OptiFine zoom (`src/client/Zoom.ts`, EntityRenderer hooks).
- GuiControls scrolls (6 rows, wheel + bar), Sprint Hold/Toggle and Reset Keys buttons.
- Texture packs: Default by default, `?pack=`, import .zip (picker or drop) into IndexedDB,
  delete with confirmation, 1.6+ packs converted (`scripts/gen-pack-map.mjs` ->
  `src/assets/ModernPackMap.ts`), "Incompatible" like 1.5.2 for packs without textures/.
- tests/controls.test.ts, scripts/scenarios/controls.json, mc.dev.controls, docs.

Next:
- Verify the screenshots of the scenario (world with the imported pack, zoom, inventory swap).
