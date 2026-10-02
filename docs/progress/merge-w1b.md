# merge-w1b progress

Order: w1/worldgen, w1/items, w1/entities, w1/effects, w1/gui, w1/blocks, w1/sky -> claude/minecraft-1-5-html-clone-wyzct1
(w1a already merged blocks/items/entities/effects/sky/gui; this pass adds worldgen + newer heads.)

- [x] worldgen (worker+protocol: worldgen WorldGenServer side; ChunkProviderClient options {generatorOptions,bonusChest} + gui suspend/adoptStore + EntityList.fromDescriptor; WorldInfo.bonusChest added so resume keeps it)
- [ ] items
