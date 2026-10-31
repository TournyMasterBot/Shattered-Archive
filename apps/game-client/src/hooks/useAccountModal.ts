// apps/game-client/src/hooks/useAccountModal.ts
import { useEffect, useState } from 'react';
import { getToken, clearToken, isExpired, subscribeToToken } from '../features/auth/authTokenStore';
import { startLogin } from '../features/auth/gameSso';
import * as cloudSync from '../features/auth/cloudSync';
import { RuntimeSingleton } from '../features/userScripts/runtimeSingleton';
import {
  getAllGlobalScriptBuckets,
  languagesWithSource,
  normalizeGlobalBuckets,
  replaceGlobalScriptBuckets,
} from '../features/userScripts/globalScriptsStore';
import { canonicalConnectionId } from '../features/connection/connectionId';
import { describeLoadResult, planCloudLoad, savesThatWouldErase } from '../features/auth/loadImpact';
import { PLUGINS_STORAGE_KEY, writeInstalledPlugins, type InstalledPluginRecord } from './usePlugins';
import { saveLibraryToCloud, loadLibraryFromCloud } from '../features/library/librarySync';
import { exportAll as exportAutolevelUserData, importRecords as importAutolevelUserData } from '../features/autoleveling/autoleveling-user-data';

interface UseAccountModalOptions {
  isOpen: boolean;
  connectionId: string;
  onClose: () => void;
}

type Status = { kind: 'ok' | 'err' | 'info'; text: string } | null;

/** How long the result of a load stays readable before the page reloads to apply it. */
const RELOAD_DELAY_MS = 3000;

const EMPTY_SOURCES = { javascript: '', lua: '', python: '', typescript: '' };

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

      // A save uploads whole collections, so an EMPTY local one would erase a non-empty
      // cloud copy. Look at the cloud first and ask before that can happen.
      const [cloudScripts, cloudPlugins, cloudGlobals] = await Promise.all([
        cloudSync.loadScripts(),
        cloudSync.loadPluginConfigs(),
        cloudSync.loadGlobalScripts(),
      ]);
      if (
        cloudScripts.kind === 'unauthenticated' ||
        cloudPlugins.kind === 'unauthenticated' ||
        cloudGlobals.kind === 'unauthenticated'
      ) {
        setIsLoggedIn(false);
        setStatus({ kind: 'err', text: 'Your session expired — please log in again.' });
        return;
      }
      // A failed look-ahead must not silently skip the safety check.
      if (cloudScripts.kind === 'error' || cloudPlugins.kind === 'error' || cloudGlobals.kind === 'error') {
        const failed = [cloudScripts, cloudPlugins, cloudGlobals].find((r) => r.kind === 'error');
        setStatus({
          kind: 'err',
          text: `Save stopped: could not check what is already in the cloud (${failed?.kind === 'error' ? failed.message : 'error'}).`,
        });
        return;
      }

      const erasing = savesThatWouldErase({
        local: {
          scripts: scripts.length,
          plugins: plugins.length,
          hasGlobals: globals.some((b) => languagesWithSource(b.sources).length > 0),
        },
        cloud: {
          scripts: Array.isArray(cloudScripts.data) ? cloudScripts.data.length : 0,
          plugins: Array.isArray(cloudPlugins.data) ? cloudPlugins.data.length : 0,
          hasGlobals: normalizeGlobalBuckets(Array.isArray(cloudGlobals.data) ? cloudGlobals.data : []).length > 0,
        },
      });
      if (erasing.length > 0) {
        const proceed = window.confirm(
          `Saving now would erase data that is in the cloud:\n\n• ${erasing.join('\n• ')}\n\n` +
            'If you meant to bring that data HERE, cancel and use Load instead. Erase it and save anyway?',
        );
        if (!proceed) {
          setStatus({ kind: 'info', text: 'Save cancelled. Nothing in the cloud was changed.' });
          return;
        }
      }

      const autolevelRecords = await exportAutolevelUserData();

      const [scriptsResult, pluginsResult, globalsResult, libraryResult, autolevelResult] = await Promise.all([
        cloudSync.saveScripts(scripts),
        cloudSync.savePluginConfigs(plugins),
        cloudSync.saveGlobalScripts(normalizeGlobalBuckets(globals)),
        saveLibraryToCloud(connectionId),
        cloudSync.saveAutolevelUserData(autolevelRecords),
      ]);

      if (
        scriptsResult.kind === 'unauthenticated' ||
        pluginsResult.kind === 'unauthenticated' ||
        globalsResult.kind === 'unauthenticated' ||
        libraryResult.kind === 'unauthenticated' ||
        autolevelResult.kind === 'unauthenticated'
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
      if (libraryResult.kind === 'error') {
        setStatus({ kind: 'err', text: `Save failed (library): ${libraryResult.message}` });
        return;
      }
      if (autolevelResult.kind === 'error') {
        setStatus({ kind: 'err', text: `Save failed (auto-leveling data): ${autolevelResult.message}` });
        return;
      }

      const lib = libraryResult.data;
      // The server omits `count` when it is 0 (it answers `{}`), so a missing count is zero.
      const n = (r: { count?: number } | undefined) => r?.count ?? 0;
      setStatus({
        kind: 'ok',
        text:
          `Saved ${n(scriptsResult.data)} script(s), ${n(pluginsResult.data)} plugin config(s), ` +
          `${n(globalsResult.data)} global-script set(s), ${lib.parchment} parchment / ${lib.notes} note(s) / ` +
          `${lib.books} book(s), and ${n(autolevelResult.data)} auto-leveling record(s) to the cloud.`,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleLoadFromCloud = async () => {
    setBusy(true);
    setStatus({ kind: 'info', text: 'Checking what is saved in the cloud…' });
    try {
      // Fetch first, change nothing yet: the confirm below names what will be replaced.
      const [scriptsResult, pluginsResult, globalsResult, autolevelResult] = await Promise.all([
        cloudSync.loadScripts(),
        cloudSync.loadPluginConfigs(),
        cloudSync.loadGlobalScripts(),
        cloudSync.loadAutolevelUserData(),
      ]);

      if (
        scriptsResult.kind === 'unauthenticated' ||
        pluginsResult.kind === 'unauthenticated' ||
        globalsResult.kind === 'unauthenticated' ||
        autolevelResult.kind === 'unauthenticated'
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
      if (autolevelResult.kind === 'error') {
        setStatus({ kind: 'err', text: `Load failed (auto-leveling data): ${autolevelResult.message}` });
        return;
      }

      const cloudScripts = Array.isArray(scriptsResult.data) ? scriptsResult.data : [];
      const cloudPlugins = Array.isArray(pluginsResult.data) ? pluginsResult.data : [];
      const cloudBuckets = normalizeGlobalBuckets(Array.isArray(globalsResult.data) ? globalsResult.data : []);

      const localScripts = RuntimeSingleton.Runtime.loadScriptsFromStorage(connectionId);
      const localBuckets = getAllGlobalScriptBuckets().filter((b) => languagesWithSource(b.sources).length > 0);
      const currentId = canonicalConnectionId(connectionId);
      const localCurrent = localBuckets.find((b) => b.connectionId === currentId);

      const plan = planCloudLoad(
        {
          scripts: localScripts.length,
          plugins: loadPluginsFromStorage().length,
          globalLanguages: localCurrent ? languagesWithSource(localCurrent.sources) : [],
        },
        {
          scripts: cloudScripts.length,
          plugins: cloudPlugins.length,
          globalLanguages: languagesWithSource(cloudBuckets.find((b) => b.connectionId === currentId)?.sources ?? EMPTY_SOURCES),
          replacedOtherGlobals: cloudBuckets
            .filter((b) => b.connectionId !== currentId && localBuckets.some((l) => l.connectionId === b.connectionId))
            .map((b) => b.connectionId),
        },
      );

      if (plan.needsConfirm && !window.confirm(`${plan.title}\n\n${plan.message}`)) {
        setStatus({ kind: 'info', text: 'Load cancelled. Nothing on this connection was changed.' });
        return;
      }

      // Apply. Each collection is only touched when the cloud actually has something for it.
      if (plan.replaceScripts) {
        const scriptsKey = RuntimeSingleton.Runtime.getStorageKey(connectionId);
        window.localStorage.setItem(scriptsKey, JSON.stringify(cloudScripts));
      }
      // Notifies mounted usePlugins() instances. The reload below still happens anyway —
      // the SCRIPTS write above has no such notification path, since
      // UserScriptRuntime.saveScriptsToStorage (which does dispatch one) is private.
      if (plan.replacePlugins) writeInstalledPlugins(cloudPlugins);
      if (plan.replaceGlobals) replaceGlobalScriptBuckets(cloudBuckets);

      const autolevelRecords = Array.isArray(autolevelResult.data) ? autolevelResult.data : [];
      await importAutolevelUserData(autolevelRecords);

      // Library writings are merge-only and written to IndexedDB by the call itself, so
      // they run after the confirm — a cancelled load must not have touched anything.
      const libraryResult = await loadLibraryFromCloud(connectionId);
      if (libraryResult.kind === 'unauthenticated') {
        setIsLoggedIn(false);
        setStatus({ kind: 'err', text: 'Your session expired — please log in again.' });
        return;
      }
      if (libraryResult.kind === 'error') {
        setStatus({ kind: 'err', text: `Scripts and plugins were loaded, but the library failed: ${libraryResult.message}. Reload the page to apply what was loaded.` });
        return;
      }

      const result = describeLoadResult(
        plan,
        {
          scripts: cloudScripts.length,
          plugins: cloudPlugins.length,
          globalBuckets: cloudBuckets.length,
          parchment: libraryResult.data.parchment,
          notes: libraryResult.data.notes,
          books: libraryResult.data.books,
          autolevelRecords: autolevelRecords.length,
        },
        localScripts.length,
      );
      setStatus({ kind: result.changed ? 'ok' : 'info', text: result.text });

      // Reload only when something was applied: the user script runtime and the IndexedDB
      // hooks pick the new data up on a fresh start. Delayed so the result can be read.
      if (result.changed) window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
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
