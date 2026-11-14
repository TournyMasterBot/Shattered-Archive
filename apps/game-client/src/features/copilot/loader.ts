import { COPILOT_BUNDLE_MARKER } from '@shatteredarchive/copilot-core';
import { createCopilotApi, type CopilotApi } from './api';
import { createAutopilotLink, type AutopilotLink } from './autopilotLink';
import { resolveApiBase } from './config';
import { ENABLED_KEY, createEnabledStore, type EnabledStore } from './enabled';
import { FOCUS_KEY, createFocusStore, type FocusStore } from './focus';
import { createCommandGate, type CommandGate } from './gate';
import { registerHistorySource } from '../worldmap/mine/history';
import { createCopilotHistorySource } from './mapHistory';
import { SETTINGS_KEY, createSettingsStore, type SettingsStore } from './settings';

/** Everything Copilot has at run time. The window (a later phase) is built on this. */
export interface CopilotRuntime {
  /** The string `check:local-only` looks for: present in a flagged bundle, absent from a production one. */
  marker: string;
  api: CopilotApi;
  settings: SettingsStore;
  /** The on/off switch: off until the owner turns it on, kept per browser. */
  enabled: EnabledStore;
  /** Training (everything waits for the owner) or AI agent (runs what the trust settings allow): Training until the owner picks the agent. */
  focus: FocusStore;
  gate: CommandGate;
  link: AutopilotLink;
  dispose(): void;
}

/**
 * Builds the Copilot plumbing in a flagged build. Reached only through `index.ts` behind `__COPILOT_LOCAL__`, so a production bundle
 * contains none of this. It listens for the user's typing and Autopilot's status (for the command gate) and for the cross-tab
 * `storage` event (for the settings); `dispose()` removes all three.
 */
let shared: CopilotRuntime | undefined;

/**
 * The one runtime of this page: `startCopilot` (at page load) and the Copilot window share it, so there is a single command gate
 * listening to the user's typing and a single view of Autopilot's status. Built on first use.
 */
export function getCopilotRuntime(): CopilotRuntime {
  shared ??= loadCopilot();
  return shared;
}

export function loadCopilot(win: Window = window): CopilotRuntime {
  let storage: Storage | undefined;
  try {
    storage = win.localStorage;
  } catch {
    storage = undefined; // storage blocked: settings last until the page closes
  }

  const settings = createSettingsStore(storage);
  const link = createAutopilotLink();
  const enabled = createEnabledStore(storage);
  const focus = createFocusStore(storage);
  const gate = createCommandGate({ getAutopilotStatus: () => link.status(), isEnabled: () => enabled.get() });
  const api = createCopilotApi({ baseUrl: resolveApiBase(storage) });

  const onStorage = (event: StorageEvent): void => {
    if (event.key === null || event.key === SETTINGS_KEY)
      settings.onStorageEvent({ key: event.key, newValue: event.newValue });
    if (event.key === null || event.key === ENABLED_KEY)
      enabled.onStorageEvent({ key: event.key, newValue: event.newValue });
    if (event.key === null || event.key === FOCUS_KEY) focus.onStorageEvent({ key: event.key, newValue: event.newValue });
  };
  win.addEventListener('storage', onStorage);
  // the map window's add-room flow may ask the server's walked rooms (only while the switch is on)
  const stops = [gate.trackUserTyping(), link.attach(), registerHistorySource(createCopilotHistorySource(api, () => enabled.get()))];
  // A page that loads with Copilot switched on tells the server (it starts with learning off after every restart). A page that loads
  // with it off asks nothing: off means nothing leaves the page.
  if (enabled.get()) void api.setLearning(true, new AbortController().signal);

  return {
    marker: COPILOT_BUNDLE_MARKER,
    api,
    settings,
    enabled,
    focus,
    gate,
    link,
    dispose() {
      win.removeEventListener('storage', onStorage);
      for (const stop of stops) stop();
    },
  };
}
