/**
 * The session-only world list was replaced by real saves (SaveFormat over IndexedDB); these
 * names stay for code written against it.
 */
export { SaveFormat as SaveFormatMemory, formatSaveDate, type SaveSummary } from './SaveFormat';
