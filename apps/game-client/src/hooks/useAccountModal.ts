// apps/game-client/src/hooks/useAccountModal.ts
import { useEffect, useState } from 'react';
import { getToken, clearToken, isExpired } from '../features/auth/authTokenStore';
import { startLogin } from '../features/auth/gameSso';
import * as cloudSync from '../features/auth/cloudSync';
import { RuntimeSingleton } from '../features/userScripts/runtimeSingleton';
import { PLUGINS_STORAGE_KEY, type InstalledPluginRecord } from './usePlugins';

interface UseAccountModalOptions {
  isOpen: boolean;
  connectionId: string;
  onClose: () => void;
}

type Status = { kind: 'ok' | 'err'; text: string } | null;

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
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    if (!isOpen) return;
    const stored = getToken();
    setIsLoggedIn(!!stored && !isExpired(stored));
    setStatus(null);
  }, [isOpen]);

  const handleLogin = () => {
    startLogin();
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

      const [scriptsResult, pluginsResult] = await Promise.all([
        cloudSync.saveScripts(scripts),
        cloudSync.savePluginConfigs(plugins),
      ]);

      if (scriptsResult.kind === 'unauthenticated' || pluginsResult.kind === 'unauthenticated') {
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

      setStatus({
        kind: 'ok',
        text: `Saved ${scriptsResult.data.count} script(s) and ${pluginsResult.data.count} plugin config(s) to the cloud.`,
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
      const [scriptsResult, pluginsResult] = await Promise.all([cloudSync.loadScripts(), cloudSync.loadPluginConfigs()]);

      if (scriptsResult.kind === 'unauthenticated' || pluginsResult.kind === 'unauthenticated') {
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

      const scriptsKey = RuntimeSingleton.Runtime.getStorageKey(connectionId);
      window.localStorage.setItem(scriptsKey, JSON.stringify(scriptsResult.data));
      window.localStorage.setItem(PLUGINS_STORAGE_KEY, JSON.stringify(pluginsResult.data));

      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  return {
    isLoggedIn,
    busy,
    status,
    handleLogin,
    handleLogout,
    handleSaveToCloud,
    handleLoadFromCloud,
  };
}
