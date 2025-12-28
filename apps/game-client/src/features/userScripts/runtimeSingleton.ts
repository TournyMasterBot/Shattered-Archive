// apps\game-client\src\features\userScripts\runtimeSingleton.ts
import { getAccessibilitySettings } from '../accessibility/accessibility-settings-store';
import { UserScriptRuntime } from './userScriptRuntime';

const settings = getAccessibilitySettings();

export const userScriptRuntime = new UserScriptRuntime({
  aliasSplitChar: settings.commandSplitChar,
});

window.addEventListener('sa:accessibility-updated', (e: any) => {
  const next = e?.detail;
  userScriptRuntime.setAliasSplitChar(next?.commandSplitChar);
});
