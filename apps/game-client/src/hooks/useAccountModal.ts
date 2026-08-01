// apps/game-client/src/hooks/useAccountModal.ts
import { useEffect, useState } from 'react';
import { getToken, clearToken, isExpired, subscribeToToken } from '../features/auth/authTokenStore';
import { startLogin } from '../features/auth/gameSso';
import * as cloudSync from '../features/auth/cloudSync';
import { RuntimeSingleton } from '../features/userScripts/runtimeSingleton';
import { getAllGlobalScriptBuckets, replaceGlobalScriptBuckets } from '../features/userScripts/globalScriptsStore';
import { PLUGINS_STORAGE_KEY, writeInstalledPlugins, type InstalledPluginRecord } from './usePlugins';

interface UseAccountModalOptions {
  isOpen: boolean;
  connectionId: string;
  onClose: () => void;
}

type Status = { kind: 'ok' | 'err' | 'info'; text: string } | null;

function loadPluginsFromStorage(): InstalledPluginRecord[] {
  try {
    const raw = window.localStorage.getItem(PLUGINS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as InstalledPluginRecord[]) : [];
  } catch {
    return [];
  }
}

export function useAccountModal({ isOpen, connectionId }: UseAccountModalOptions) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loginPending, setLoginPending] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    if (!isOpen) return;
    const stored = getToken();
    setIsLoggedIn(!!stored && !isExpired(stored));
    setStatus(null);
  }, [isOpen]);

  // The login popup writes the token from ANOTHER window, so nothing in this one
  // re-runs on its own — this subscription is what flips the panel over to the
  // logged-in view the moment the sign-in lands, without a reload or a reopen.
  useEffect(() => subscribeToToken((stored) => setIsLoggedIn(!!stored && !isExpired(stored))), []);

  const handleLogin = async () => {
    setLoginPending(true);
    setStatus({ kind: 'info', text: 'Waiting for the sign-in window…' });
    try {
      const outcome = await startLogin();
      switch (outcome.kind) {
        case 'success':
          setIsLoggedIn(true);
          setStatus({ kind: 'ok', text: 'Signed in.' });
          break;
        case 'blocked':
          setStatus({
            kind: 'err',
            text: 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again — your game connection is still open.',
          });
          break;
        case 'cancelled':
          setStatus({ kind: 'err', text: 'Sign-in was cancelled. Your game connection is unaffected.' });
          break;
        case 'timeout':
          setStatus({ kind: 'err', text: 'Sign-in timed out. Your game connection is unaffected — try again when ready.' });
          break;
      }
    } finally {
      setLoginPending(false);
    }
  };

  const handleLogout = () => {
    clearToken();
    setIsLoggedIn(false);
    setStatus({ kind: 'ok', text: 'Logged out.' });
  };

  const handleSaveToCloud = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const scripts = RuntimeSingleton.Runtime.loadScriptsFromStorage(connectionId);
      const plugins = loadPluginsFromStorage();
      // Every connection's globals, not just this one — see
      // getAllGlobalScriptBuckets on why a partial save would drop the rest.
      const globals = getAllGlobalScriptBuckets();

      const [scriptsResult, pluginsResult, globalsResult] = await Promise.all([
        cloudSync.saveScripts(scripts),
        cloudSync.savePluginConfigs(plugins),
        cloudSync.saveGlobalScripts(globals),
      ]);

      if (
        scriptsResult.kind === 'unauthenticated' ||
        pluginsResult.kind === 'unauthenticated' ||
        globalsResult.kind === 'unauthenticated'
      ) {
        setIsLoggedIn(false);
        setStatus({ kind: 'err', text: 'Your session expired — please log in again.' });
        return;
      }
      if (scriptsResult.kind === 'error') {
        setStatus({ kind: 'err', text: `Save failed (scripts): ${scriptsResult.message}` });
        return;
      }
      if (pluginsResult.kind === 'error') {
        setStatus({ kind: 'err', text: `Save failed (plugin configs): ${pluginsResult.message}` });
        return;
      }
      if (globalsResult.kind === 'error') {
        setStatus({ kind: 'err', text: `Save failed (global scripts): ${globalsResult.message}` });
        return;
      }

      setStatus({
        kind: 'ok',
        text:
          `Saved ${scriptsResult.data.count} script(s), ${pluginsResult.data.count} plugin config(s) ` +
          `and ${globalsResult.data.count} global-script set(s) to the cloud.`,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleLoadFromCloud = async () => {
    const confirmed = window.confirm(
      "Load from the cloud into this connection? This replaces this connection's local scripts and " +
        'plugin configs with whatever was last saved to the cloud, and reloads the page.',
    );
    if (!confirmed) return;

    setBusy(true);
    setStatus(null);
    try {
      const [scriptsResult, pluginsResult, globalsResult] = await Promise.all([
        cloudSync.loadScripts(),
        cloudSync.loadPluginConfigs(),
        cloudSync.loadGlobalScripts(),
      ]);

      if (
        scriptsResult.kind === 'unauthenticated' ||
        pluginsResult.kind === 'unauthenticated' ||
        globalsResult.kind === 'unauthenticated'
      ) {
        setIsLoggedIn(false);
        setStatus({ kind: 'err', text: 'Your session expired — please log in again.' });
        return;
      }
      if (scriptsResult.kind === 'error') {
        setStatus({ kind: 'err', text: `Load failed (scripts): ${scriptsResult.message}` });
        return;
      }
      if (pluginsResult.kind === 'error') {
        setStatus({ kind: 'err', text: `Load failed (plugin configs): ${pluginsResult.message}` });
        return;
      }
      if (globalsResult.kind === 'error') {
        setStatus({ kind: 'err', text: `Load failed (global scripts): ${globalsResult.message}` });
        return;
      }

      const scriptsKey = RuntimeSingleton.Runtime.getStorageKey(connectionId);
      window.localStorage.setItem(scriptsKey, JSON.stringify(scriptsResult.data));
      // Notifies mounted usePlugins() instances. The reload below still happens
      // anyway — the SCRIPTS write above has no such notification path, since
      // UserScriptRuntime.saveScriptsToStorage (which does dispatch one) is
      // private — so this is for correctness rather than to avoid the reload.
      writeInstalledPlugins(pluginsResult.data);
      replaceGlobalScriptBuckets(Array.isArray(globalsResult.data) ? globalsResult.data : []);

      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  return {
    isLoggedIn,
    busy,
    loginPending,
    status,
    handleLogin,
    handleLogout,
    handleSaveToCloud,
    handleLoadFromCloud,
  };
}
