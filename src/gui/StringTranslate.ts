import type { ResourceManager } from '../assets/ResourceManager';
import { I18n } from '../core/I18n';

type Listener = () => void;

/**
 * The language list and the active language (StringTranslate). The table always starts from
 * en_US and the selected language overrides it, so untranslated keys fall back to English.
 * A language whose strings use characters beyond U+00FF needs the unicode glyph pages
 * (isUnicode), and Arabic and Hebrew are drawn right to left (isBidirectional).
 */
export const StringTranslate = {
  /** code -> display name, sorted by code like the original's TreeMap. */
  languageList: new Map<string, string>([['en_US', 'English (US)']]),
  currentLanguage: 'en_US',
  unicode: false,
  rm: null as ResourceManager | null,
  /** Called after a language finished loading (screens re-translate their labels). */
  listeners: [] as Listener[],
  /** The request that is loading, so a later click wins over an earlier one. */
  pending: 0,

  /** Loads lang/languages.txt (the en_US table itself is loaded by Minecraft.startGame). */
  async init(rm: ResourceManager): Promise<void> {
    this.rm = rm;
    const text = (await rm.getText('lang/languages.txt', 'vanilla')) ?? '';
    const entries: [string, string][] = [];
    for (const line of text.split(/\r?\n/)) {
      const parts = line.trim().split('=');
      while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
      if (parts.length === 2) entries.push([parts[0], parts[1]]);
    }
    entries.push(['en_US', 'English (US)']);
    const map = new Map<string, string>();
    for (const [k, v] of entries) map.set(k, v);
    this.languageList = new Map([...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
  },

  getLanguageList(): Map<string, string> {
    return this.languageList;
  },

  getCurrentLanguage(): string {
    return this.currentLanguage;
  },

  isUnicode(): boolean {
    return this.unicode;
  },

  isBidirectional(code: string): boolean {
    return code === 'ar_SA' || code === 'he_IL';
  },

  /** Switches the table to `code` (en_US first, then the language on top). */
  async setLanguage(code: string, force = false): Promise<boolean> {
    if (!force && code === this.currentLanguage) return true;
    const rm = this.rm;
    if (!rm) return false;
    const ticket = ++this.pending;
    const en = await rm.getText('lang/en_US.lang', 'vanilla');
    const lang = code === 'en_US' ? null : await rm.getText(`lang/${code}.lang`, 'vanilla');
    if (ticket !== this.pending) return false;
    if (code !== 'en_US' && lang === null) return false;
    I18n.clear();
    if (en) I18n.load(en);
    let unicode = false;
    if (lang !== null) {
      I18n.load(lang);
      for (const v of I18n.values()) {
        for (let i = 0; i < v.length && !unicode; i++) if (v.charCodeAt(i) >= 256) unicode = true;
        if (unicode) break;
      }
    }
    this.unicode = unicode;
    this.currentLanguage = code;
    for (const l of this.listeners) l();
    return true;
  },
};
