export type BeepSound =
  | {
      kind: 'osc';
      frequencyHz: number;
      durationMs: number;
      volume: number; // 0..1
      type?: OscillatorType;
    }
  | {
      // Local user-selected file stored in IndexedDB
      kind: 'asset';
      assetId: string;
      volume: number; // 0..1
    }
  | {
      // Optional future: remote URL
      kind: 'file';
      url: string;
      volume: number; // 0..1
    };

export type InclusionRule = {
  id: string;
  pattern: string; // substring match (case-sensitive)
  enabled: boolean;
  sound?: BeepSound; // override; if missing uses defaultBeep
};

export type AudioSettings = {
  beepsEnabled: boolean;

  /** If a line contains BEL (\u0007), it’s a beep candidate unless excluded. */
  beepOnBellChar: boolean;

  /** Inclusion rules can force beeps even without BEL. */
  includeRules: InclusionRule[];

  /** If a line matches any exclusion pattern, suppress beeps (even if BEL). */
  excludePatterns: string[];

  /** Default sound used for BEL beeps and inclusion rules with no override. */
  defaultBeep: BeepSound;
};

const STORAGE_KEY = 'sa.audio.settings.v2';

const DEFAULT_SETTINGS: AudioSettings = {
  beepsEnabled: true,
  beepOnBellChar: true,
  excludePatterns: [],
  includeRules: [],
  defaultBeep: {
    kind: 'osc',
    frequencyHz: 880,
    durationMs: 60,
    volume: 0.18,
    type: 'sine',
  },
};

let current: AudioSettings = load();
const subscribers = new Set<(s: AudioSettings) => void>();

function isBeepSound(x: any): x is BeepSound {
  return x && typeof x === 'object' && typeof x.kind === 'string';
}

function normalizeBeepSound(x: any, fallback: BeepSound): BeepSound {
  if (!isBeepSound(x)) return fallback;

  if (x.kind === 'osc') {
    return {
      kind: 'osc',
      frequencyHz: Number(x.frequencyHz ?? (fallback as any).frequencyHz ?? 880),
      durationMs: Number(x.durationMs ?? (fallback as any).durationMs ?? 60),
      volume: Number(x.volume ?? (fallback as any).volume ?? 0.18),
      type: x.type,
    };
  }

  if (x.kind === 'asset') {
    const assetId = String(x.assetId ?? '').trim();
    if (!assetId) return fallback;
    return { kind: 'asset', assetId, volume: Number(x.volume ?? 0.18) };
  }

  if (x.kind === 'file') {
    const url = String(x.url ?? '').trim();
    if (!url) return fallback;
    return { kind: 'file', url, volume: Number(x.volume ?? 0.18) };
  }

  return fallback;
}

function load(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<AudioSettings>;

    const defaultBeep = normalizeBeepSound(parsed.defaultBeep, DEFAULT_SETTINGS.defaultBeep);

    const excludePatterns = Array.isArray(parsed.excludePatterns)
      ? parsed.excludePatterns.map((s) => String(s).trim()).filter(Boolean)
      : [];

    const includeRules = Array.isArray(parsed.includeRules)
      ? parsed.includeRules
          .map((r: any) => {
            const id = String(r?.id ?? '').trim() || `rule_${Math.random().toString(36).slice(2)}`;
            const pattern = String(r?.pattern ?? '').trim();
            if (!pattern) return null;

            return {
              id,
              pattern,
              enabled: typeof r?.enabled === 'boolean' ? r.enabled : true,
              sound: r?.sound ? normalizeBeepSound(r.sound, defaultBeep) : undefined,
            } as InclusionRule;
          })
          .filter(Boolean) as InclusionRule[]
      : [];

    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      defaultBeep,
      excludePatterns,
      includeRules,
      beepsEnabled: typeof parsed.beepsEnabled === 'boolean' ? parsed.beepsEnabled : DEFAULT_SETTINGS.beepsEnabled,
      beepOnBellChar:
        typeof parsed.beepOnBellChar === 'boolean' ? parsed.beepOnBellChar : DEFAULT_SETTINGS.beepOnBellChar,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function save(next: AudioSettings) {
  current = next;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }

  subscribers.forEach((fn) => fn(current));
}

export function getAudioSettings(): AudioSettings {
  return current;
}

export function setAudioSettings(next: AudioSettings) {
  save(next);
}

export function updateAudioSettings(patch: Partial<AudioSettings>) {
  save({
    ...current,
    ...patch,
    defaultBeep: patch.defaultBeep ? patch.defaultBeep : current.defaultBeep,
  });
}

export function subscribeAudioSettings(fn: (s: AudioSettings) => void) {
  subscribers.add(fn);
  fn(current);
  return () => subscribers.delete(fn);
}
