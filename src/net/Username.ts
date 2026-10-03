/**
 * The player's name for multiplayer: 3 to 16 characters of A-Z, a-z, 0-9 and _, as 1.5.2's
 * launcher and servers accepted. Kept in localStorage (like the launcher's lastlogin); the
 * first visit gets "Player" and three random digits.
 */

const KEY = 'mc152.username';
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;

export function isValidUsername(name: string): boolean {
  return USERNAME_PATTERN.test(name);
}

/** Characters a name field accepts while typing. */
export function isUsernameChar(ch: string): boolean {
  return /^[A-Za-z0-9_]$/.test(ch);
}

/** Keeps only the characters a username may have (at most 16). */
export function filterUsername(s: string): string {
  return [...s].filter(isUsernameChar).join('').slice(0, 16);
}

export function defaultUsername(random: () => number = Math.random): string {
  return 'Player' + String(Math.floor(random() * 1000)).padStart(3, '0');
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The saved name, or a new default (saved right away so it stays the same). */
export function loadUsername(): string {
  const s = storage();
  try {
    const v = s?.getItem(KEY);
    if (v && isValidUsername(v)) return v;
  } catch {
    /* storage blocked */
  }
  const name = defaultUsername();
  saveUsername(name);
  return name;
}

export function saveUsername(name: string): void {
  if (!isValidUsername(name)) return;
  try {
    storage()?.setItem(KEY, name);
  } catch {
    /* storage blocked */
  }
}
