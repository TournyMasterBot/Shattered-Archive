// apps\game-client\src\features\accessibility\accessibility-settings-store.ts
export type AccessibilitySettings = {
  fontScale: number; // 0.8..1.6
  preferHighContrast: boolean;
  reduceMotion: boolean;

  keepInputAfterSend: boolean;

  enableLocalPrefixes: boolean;

  clearStackKey: string; // user types (default "~")
  clearStackCommand: string; // we send to server (default "~")

  commandSplitChar: string; // default ";"

  repeaterPrefix: string; // default "#"

  repeatLastPrefix: string; // default "&"
};

const KEY = 'sa.accessibility.settings.v1';

const DEFAULTS: AccessibilitySettings = {
  fontScale: 1.0,
  preferHighContrast: false,
  reduceMotion: false,

  keepInputAfterSend: false,

  enableLocalPrefixes: true,

  clearStackKey: '~',
  clearStackCommand: '~',

  commandSplitChar: ';',
  repeaterPrefix: '#',
  repeatLastPrefix: '&',
};

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function oneChar(v: unknown, fallback: string) {
  const s = String(v ?? '').trim();
  if (!s) return fallback;
  return s.slice(0, 1);
}

export function getAccessibilitySettings(): AccessibilitySettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AccessibilitySettings>;

    return {
      ...DEFAULTS,
      ...parsed,

      fontScale: clamp(Number(parsed.fontScale ?? DEFAULTS.fontScale), 0.8, 1.6),

      clearStackKey: oneChar(parsed.clearStackKey, DEFAULTS.clearStackKey),
      clearStackCommand: oneChar(parsed.clearStackCommand, DEFAULTS.clearStackCommand),

      commandSplitChar: oneChar(parsed.commandSplitChar, DEFAULTS.commandSplitChar),
      repeaterPrefix: oneChar(parsed.repeaterPrefix, DEFAULTS.repeaterPrefix),
      repeatLastPrefix: oneChar(parsed.repeatLastPrefix, DEFAULTS.repeatLastPrefix),
    };
  } catch {
    return DEFAULTS;
  }
}

export function setAccessibilitySettings(next: AccessibilitySettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}
