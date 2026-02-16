// apps\game-client\src\features\audio\audio-runtime.ts
import { getAudioSettings, subscribeAudioSettings } from './audio-settings-store';
import { tryBeepForLine } from './audio-beep';
import { ListenEvent } from '../event-emitter/event-dispatcher';

const RUNTIME_KEY = '__shatteredarchive_audio_runtime__';

type AudioRuntimeState = {
  attached: boolean;
  offTelnet?: () => void;
  offSettings?: () => void;
};

function getRuntimeState(): AudioRuntimeState {
  const g = globalThis as any;
  if (!g[RUNTIME_KEY]) {
    g[RUNTIME_KEY] = { attached: false } as AudioRuntimeState;
  }
  return g[RUNTIME_KEY] as AudioRuntimeState;
}

let settingsCache = getAudioSettings();

export function ensureAudioRuntimeAttached() {
  if (typeof window === 'undefined') return;

  const rt = getRuntimeState();
  if (rt.attached) return;

  // live settings cache so we don’t read storage each line
  const offSettings = subscribeAudioSettings((s) => {
    settingsCache = s;
  });

  const offTelnet = ListenEvent<any>(
    'shatteredarchive:raw-data',
    (payload) => {
      const text: string = payload?.text ?? '';
      void tryBeepForLine(text, settingsCache);
    },
    {
      key: 'audio-runtime:game:telnet-raw-line',
    },
  );

  rt.attached = true;
  rt.offSettings = typeof offSettings === 'function' ? offSettings : undefined;
  rt.offTelnet = offTelnet;
}
