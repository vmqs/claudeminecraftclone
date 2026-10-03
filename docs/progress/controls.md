# Wave 4: controls and texture packs (branch w4/controls)

Done:
- GameSettings: Sprint (I), Zoom (C), Hotbar Slot 1-9 (1-9) bindings, `toggleSprint` option,
  Reset Keys; English fallback names in `src/client/ControlsText.ts`.
- Hotbar keys used by the HUD (Minecraft.handleKeyBindings) and container swaps (GuiContainer).
- Sprint key hold/toggle (MovementInput.sprint, EntityPlayerSP.updateSprintKey).
- OptiFine zoom (`src/client/Zoom.ts`, EntityRenderer hooks).
- GuiControls scrolls (6 rows, wheel + bar), Sprint Hold/Toggle and Reset Keys buttons.

Next:
- Texture packs: Default as the default, import .zip into IndexedDB, delete, 1.6+ mapping.
- Node test, scripts/scenarios/controls.json, screenshots, docs.
