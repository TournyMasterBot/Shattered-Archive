/**
 * Every localStorage touch in the app goes through here.
 *
 * Two reasons: the key names stay in one place (they are a de-facto data format — a rename
 * silently signs everyone out of their rooms), and access is wrapped, because localStorage
 * throws rather than returning null in a Safari private window or with site data blocked.
 * A user with storage disabled should lose reconnect convenience, not the whole app.
 *
 * The participant secret and host token used to live here too. Both moved to HttpOnly cookies
 * (2026-08-05, see apps/scrum-poker-server/src/http/cookies.ts) specifically because anything
 * in localStorage is readable by any script running on the page — the exact exposure removing
 * `'unsafe-inline'` from script-src was meant to shrink. `cleanupLegacyCredentialKeys` sweeps
 * away what's left of them from browsers that visited before the migration; nothing here
 * writes a new one.
 */

const NAME_KEY = 'scrum-poker:name';
const THEME_KEY = 'scrum-poker:theme';
const LEGACY_SECRET_PREFIX = 'scrum-poker:participant-secret:';
const LEGACY_HOST_PREFIX = 'scrum-poker:host:';
/** Pre-split-identity key; it held a PUBLIC participant id, which was never a credential. */
const LEGACY_PARTICIPANT_PREFIX = 'scrum-poker:participant:';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — reconnect convenience is lost, nothing else */
  }
}

/**
 * Removes every now-dead per-room credential key a pre-2026-08-05 visit may have left behind.
 * Best-effort and safe to call on every app start: it only ever deletes, and a browser that
 * never held one of these (or has storage disabled entirely) just does nothing.
 */
function cleanupLegacyCredentialKeys(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (
        key &&
        (key.startsWith(LEGACY_SECRET_PREFIX) || key.startsWith(LEGACY_HOST_PREFIX) || key.startsWith(LEGACY_PARTICIPANT_PREFIX))
      ) {
        doomed.push(key);
      }
    }
    for (const key of doomed) window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable — nothing to clean up */
  }
}

export const storage = {
  /** The display name, remembered across rooms so a regular never retypes it. */
  getName: () => read(NAME_KEY) ?? '',
  setName: (name: string) => write(NAME_KEY, name),

  getTheme: () => read(THEME_KEY),
  setTheme: (theme: string) => write(THEME_KEY, theme),

  cleanupLegacyCredentialKeys,
};

export const THEME_STORAGE_KEY = THEME_KEY;
