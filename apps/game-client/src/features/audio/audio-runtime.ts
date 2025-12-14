import { getAudioSettings, subscribeAudioSettings } from './audio-settings-store';
import { tryBeepForLine } from './audio-beep';

let attached = false;
let settingsCache = getAudioSettings();

export function ensureAudioRuntimeAttached() {
  if (attached) return;
  if (typeof window === 'undefined') return;

  // live settings cache so we don’t read storage each line
  subscribeAudioSettings((s) => {
    settingsCache = s;
  });

  const handler = (ev: Event) => {
    const ce = ev as CustomEvent<any>;
    const text: string = ce.detail?.text ?? '';

    // Hot path: only do the minimum work
    // - no regex
    // - no splitting
    // - relies on substring checks
    void tryBeepForLine(text, settingsCache);
  };

  window.addEventListener('game:telnet-raw-line', handler as EventListener);
  attached = true;
}
