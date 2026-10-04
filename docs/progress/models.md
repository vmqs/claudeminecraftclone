# Custom player models (w6/models) — progress

Plan:
1. Pure-TS parsers (no three.js): FBX (binary/ASCII), glTF/GLB (+zip), OBJ/MTL (+zip) -> SourceScene
2. Normalise (1.8 tall, feet y=0, centred, facing +Z like Steve) + rig (bone names -> 6 biped parts, or geometry segmentation)
3. Packed runtime format (src/client/model/PlayerModelFormat.ts), built-ins in public/models/<id>/model.cpm + index.json
4. scripts/convert-models.mjs (bundles the TS pipeline with rolldown, runs in Node)
5. Rendering: GPU skinning (6 biped bones) in the uber shader, ModelCustomPlayer (ModelBiped subclass), RenderPlayer/ItemRenderer hooks
6. Account Manager: Model button, Import Model..., Delete Model; IndexedDB store; persisted choice
7. Multiplayer: MC|Model sync (id or compressed data <= 3 MB, hash cache), protocol bump
8. Tests + scenarios/models.json + docs

Status (commit after each):
- [x] 1 parsers  - [x] 2 normalise + rig  - [x] 3 format + built-ins  - [x] 4 convert script
- [x] 5 rendering (GL.drawSkinned, ModelCustomPlayer, RenderPlayer/ItemRenderer hooks)
- [x] 6 Account Manager + import worker + IndexedDB  - [x] 7 MC|Model sync (protocol 4)
- [x] tests/models.test.ts (145 checks)
- [x] tests/netmodels.test.ts (20), scripts/scenarios/models.json (3 browser runs done: models x2, mp-models x1), docs
- Done. Possible follow-ups: per-vertex colours (glTF COLOR_0) are ignored; no "turn around" button for
  imported models whose front/back cannot be told apart (blocky bodies without toes); no LOD.
