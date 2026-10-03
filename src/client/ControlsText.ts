import { I18n } from '../core/I18n';

/**
 * English text for the controls and texture-pack additions that 1.5.2's language files do not
 * have. The keys follow later versions (key.sprint, key.hotbar.N, controls.resetAll,
 * options.key.hold/toggle) and OptiFine (of.key.zoom), so a language file that has them wins.
 */
const FALLBACK: Record<string, string> = {
  'key.sprint': 'Sprint',
  'of.key.zoom': 'Zoom',
  'key.hotbar.1': 'Hotbar Slot 1',
  'key.hotbar.2': 'Hotbar Slot 2',
  'key.hotbar.3': 'Hotbar Slot 3',
  'key.hotbar.4': 'Hotbar Slot 4',
  'key.hotbar.5': 'Hotbar Slot 5',
  'key.hotbar.6': 'Hotbar Slot 6',
  'key.hotbar.7': 'Hotbar Slot 7',
  'key.hotbar.8': 'Hotbar Slot 8',
  'key.hotbar.9': 'Hotbar Slot 9',
  'options.sprintMode': 'Sprint',
  'options.key.hold': 'Hold',
  'options.key.toggle': 'Toggle',
  'controls.resetAll': 'Reset Keys',
  'texturePack.importInfo': '(Choose .zip texture packs to add)',
  'texturePack.importing': 'Importing %s...',
  'texturePack.imported': 'Added %s',
  'texturePack.importFailed': 'Could not add %s: %s',
  'texturePack.converted': 'Converted from a 1.6+ resource pack',
  'texturePack.deleteQuestion': 'Are you sure you want to delete this texture pack?',
  'texturePack.deleteWarning': "'%s' will be lost forever! (A long time!)",
  'texturePack.delete': 'Delete',
};

/** translateToLocal with the English fallback above for keys 1.5.2 does not know. */
export function translateOr(key: string): string {
  return I18n.canTranslate(key) ? I18n.translateToLocal(key) : (FALLBACK[key] ?? key);
}

/** translateToLocalFormatted with the same fallback. */
export function translateOrFormatted(key: string, ...args: unknown[]): string {
  if (I18n.canTranslate(key)) return I18n.translateToLocalFormatted(key, ...args);
  let i = 0;
  return (FALLBACK[key] ?? key).replace(/%s/g, () => String(args[i++] ?? ''));
}
