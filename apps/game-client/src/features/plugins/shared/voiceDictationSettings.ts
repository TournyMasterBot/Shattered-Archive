// apps/game-client/src/features/plugins/shared/voiceDictationSettings.ts
//
// Small, framework-free settings store written by voice-dictation.plugin.ts's
// syncSettings() and read fresh on every dictation attempt by that same
// plugin's recognition call. Deliberately not layered on top of the host's
// internal per-plugin config storage (undocumented shape) — this is its own
// dedicated localStorage key so it can be read directly without depending on
// host storage internals.

export type VoiceDictationEngineKind = 'browser' | 'advanced';

export interface VoiceDictationSettings {
  engine: VoiceDictationEngineKind;
  language: string; // BCP-47, e.g. "en-US"
  advancedModel: string; // model id understood by advancedSttEngine.ts
  customVocabulary: string[]; // MUD-specific words/names, see voiceDictationVocabulary.ts
}

const STORAGE_KEY = 'shatteredArchive.plugins.speechToText.engineSettings';

export const DEFAULT_VOICE_DICTATION_SETTINGS: VoiceDictationSettings = {
  engine: 'browser',
  language: 'en-US',
  advancedModel: 'Xenova/wav2vec2-base-960h',
  customVocabulary: [],
};

export function getVoiceDictationSettings(): VoiceDictationSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VOICE_DICTATION_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_VOICE_DICTATION_SETTINGS,
      ...(parsed && typeof parsed === 'object' ? parsed : {}),
    };
  } catch {
    return { ...DEFAULT_VOICE_DICTATION_SETTINGS };
  }
}

export function setVoiceDictationSettings(next: VoiceDictationSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore (e.g. storage disabled/full)
  }
}
