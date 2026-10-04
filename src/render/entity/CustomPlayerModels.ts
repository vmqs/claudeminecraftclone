import { PlayerModels, STEVE_KEY, type ModelKey } from '../../client/model/PlayerModels';
import { CustomModelMesh } from './CustomModelMesh';
import { ModelCustomPlayer } from './ModelCustomPlayer';

interface Slot {
  model: ModelCustomPlayer | null;
  failed: boolean;
}

/** The GPU copies of the models players wear, by model key (created on first use). */
const slots = new Map<ModelKey, Slot>();

PlayerModels.releaseListeners.push((key) => {
  const s = slots.get(key);
  if (!s) return;
  slots.delete(key);
  s.model?.mesh.dispose();
});
PlayerModels.loadListeners.push((key) => {
  // Data that arrived again (another player sent it) replaces a failed attempt.
  if (slots.get(key)?.failed) slots.delete(key);
});

/**
 * The ModelBiped to draw for a model key, or null for Steve (also while the model loads or
 * when it cannot be shown). One model object per key is shared by every player wearing it.
 */
export function customModelForKey(key: ModelKey): ModelCustomPlayer | null {
  if (key === STEVE_KEY) return null;
  const slot = slots.get(key);
  if (slot) return slot.model;
  const data = PlayerModels.dataFor(key);
  if (!data) return null;
  const s: Slot = { model: null, failed: false };
  slots.set(key, s);
  CustomModelMesh.create(data).then(
    (mesh) => {
      if (slots.get(key) !== s) {
        mesh.dispose();
        return;
      }
      s.model = new ModelCustomPlayer(mesh);
    },
    (e) => {
      s.failed = true;
      console.warn(`[models] ${key} could not be shown`, e);
    },
  );
  return null;
}

/** The custom model a player wears, or null for Steve. */
export function customModelFor(player: { readonly username: string }): ModelCustomPlayer | null {
  return customModelForKey(PlayerModels.keyFor(player));
}

/** ItemRenderer's empty hand: the model's own right arm; false to draw Steve's. */
export function renderCustomFirstPersonArm(player: { readonly username: string } | null): boolean {
  if (!player) return false;
  const m = customModelFor(player);
  if (!m) return false;
  m.renderFirstPersonArm(player as never);
  return true;
}

/** How many models are on the GPU and their triangles (debugging). */
export function customModelStats(): { models: number; triangles: number } {
  let triangles = 0;
  let models = 0;
  for (const s of slots.values()) {
    if (!s.model) continue;
    models++;
    triangles += s.model.mesh.triangles;
  }
  return { models, triangles };
}
