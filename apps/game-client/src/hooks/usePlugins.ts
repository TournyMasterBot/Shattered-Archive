// apps\game-client\src\hooks\usePlugins.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PluginId } from '@shatteredarchive/types-client';
import { findCorePlugin } from '../features/plugins/registry';

/* -------------------------------------------
   Types (local to game-client)
-------------------------------------------- */

export type InstalledPluginRecord = {
  id: PluginId;
  name: string;
  version: string;
  description?: string;
  author?: string;
  enabled: boolean;
  installedAt: number;
  userConfig: Record<string, unknown>;
};

/* -------------------------------------------
   Storage
-------------------------------------------- */

const STORAGE_KEY_PREFIX = 'shatteredArchive.plugins.installed.';

function getStorageKey(connectionId?: string | null) {
  const safe = connectionId && connectionId.trim().length > 0 ? connectionId.trim() : 'default';
  return `${STORAGE_KEY_PREFIX}${safe}`;
}

function loadFromStorage(connectionId?: string | null): InstalledPluginRecord[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(getStorageKey(connectionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as InstalledPluginRecord[]) : [];
  } catch {
    return [];
  }
}

function saveToStorage(connectionId: string | null | undefined, items: InstalledPluginRecord[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getStorageKey(connectionId), JSON.stringify(items));
  } catch {
    // ignore
  }
}

/* -------------------------------------------
   Hook
-------------------------------------------- */

export function usePlugins(connectionId?: string | null) {
  const [plugins, setPlugins] = useState<InstalledPluginRecord[]>([]);

  // keep latest connectionId inside state closures
  const connectionRef = useRef<string | null | undefined>(connectionId);
  useEffect(() => {
    connectionRef.current = connectionId;
  }, [connectionId]);

  // Load whenever connection changes
  useEffect(() => {
    setPlugins(loadFromStorage(connectionId));
  }, [connectionId]);

  // Persist immediately with the computed "next" value (no effect-race)
  const setPluginsPersist = useCallback((updater: (prev: InstalledPluginRecord[]) => InstalledPluginRecord[]) => {
    setPlugins((prev) => {
      const next = updater(prev);
      saveToStorage(connectionRef.current, next);
      return next;
    });
  }, []);

  /* -------------------------------------------
     Derived
  -------------------------------------------- */

  // aliases your UI may expect
  const installed = plugins;

  const byId = useMemo(() => {
    const map = new Map<string, InstalledPluginRecord>();
    for (const p of plugins) map.set(p.id, p);
    return map;
  }, [plugins]);

  const getInstallRecord = useCallback((id: PluginId) => byId.get(id) ?? null, [byId]);
  const getPlugin = useCallback((id: PluginId) => byId.get(id) ?? null, [byId]);

  const isInstalled = useCallback((id: PluginId) => byId.has(id), [byId]);

  const isEnabled = useCallback(
    (id: PluginId) => {
      const rec = byId.get(id);
      return !!rec?.enabled;
    },
    [byId],
  );

  /* -------------------------------------------
     Actions
  -------------------------------------------- */

  /**
   * Install core plugin by id (from registry).
   * Safe to call multiple times.
   */
  const installCorePlugin = useCallback(
    (id: PluginId) => {
      const core = findCorePlugin(id);
      if (!core) return;

      setPluginsPersist((prev) => {
        if (prev.some((p) => p.id === id)) return prev;

        const rec: InstalledPluginRecord = {
          id: core.id,
          name: core.manifest.name,
          version: core.manifest.version,
          author: core.manifest.author,
          description: core.manifest.description,
          enabled: false,
          installedAt: Date.now(),
          userConfig: {},
        };

        return [...prev, rec];
      });
    },
    [setPluginsPersist],
  );

  const uninstallPlugin = useCallback(
    (id: PluginId) => {
      setPluginsPersist((prev) => prev.filter((p) => p.id !== id));
    },
    [setPluginsPersist],
  );

  // compatibility name some UI used
  const removePlugin = uninstallPlugin;

  const enablePlugin = useCallback(
    (id: PluginId) => {
      setPluginsPersist((prev) => prev.map((p) => (p.id === id ? { ...p, enabled: true } : p)));
    },
    [setPluginsPersist],
  );

  const disablePlugin = useCallback(
    (id: PluginId) => {
      setPluginsPersist((prev) => prev.map((p) => (p.id === id ? { ...p, enabled: false } : p)));
    },
    [setPluginsPersist],
  );

  // compatibility name some UI used
  const setPluginEnabled = useCallback(
    (id: PluginId, enabled: boolean) => {
      if (enabled) enablePlugin(id);
      else disablePlugin(id);
    },
    [enablePlugin, disablePlugin],
  );

  /**
   * Persist FULL userConfig object (what your modal "Save" is doing).
   * This avoids merge bugs where old keys stick around.
   */
  const updatePluginConfig = useCallback(
    (id: PluginId, nextUserConfig: Record<string, unknown>) => {
      setPluginsPersist((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                userConfig: { ...nextUserConfig },
              }
            : p,
        ),
      );
    },
    [setPluginsPersist],
  );

  return {
    // base
    plugins,

    // selectors
    installed,
    getPlugin,
    getInstallRecord,
    isInstalled,
    isEnabled,

    // actions
    installCorePlugin,
    uninstallPlugin,
    removePlugin,
    enablePlugin,
    disablePlugin,
    setPluginEnabled,
    updatePluginConfig,
  };
}

export default usePlugins;
