// apps\game-client\src\hooks\usePluginCssOverrides.ts
import { useEffect, useState } from 'react';

const PLUGIN_CSS_KEY_PREFIX = 'shatteredArchive.pluginCssOverride.';
const PLUGIN_CSS_STYLE_ID_PREFIX = 'plugin-css-override-style-';

function getStorageKey(connectionId: string, pluginId: string) {
  const c = connectionId && connectionId.trim().length > 0 ? connectionId.trim() : 'default';
  return `${PLUGIN_CSS_KEY_PREFIX}${c}.${pluginId}`;
}

function getStyleId(connectionId: string, pluginId: string) {
  const c = connectionId && connectionId.trim().length > 0 ? connectionId.trim() : 'default';
  return `${PLUGIN_CSS_STYLE_ID_PREFIX}${c}-${pluginId}`;
}

export function applyPluginUserCss(connectionId: string, pluginId: string, css: string) {
  if (typeof document === 'undefined') return;

  const styleId = getStyleId(connectionId, pluginId);
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }

  styleEl.innerHTML = css || '';
}

export function removePluginUserCss(connectionId: string, pluginId: string) {
  if (typeof document === 'undefined') return;
  const styleId = getStyleId(connectionId, pluginId);
  const el = document.getElementById(styleId);
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

export function usePluginCssOverrides(connectionId: string, pluginId: string) {
  const [appliedCss, setAppliedCss] = useState<string>('');
  const [draftCss, setDraftCss] = useState<string>('');
  const [isOpen, setIsOpen] = useState<boolean>(false);

  useEffect(() => {
    try {
      const key = getStorageKey(connectionId, pluginId);
      const stored = window.localStorage.getItem(key) || '';
      setAppliedCss(stored);
      setDraftCss(stored);
      applyPluginUserCss(connectionId, pluginId, stored);
    } catch {
      // ignore
    }
  }, [connectionId, pluginId]);

  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);

  const save = () => {
    const css = draftCss;
    setAppliedCss(css);
    applyPluginUserCss(connectionId, pluginId, css);

    try {
      const key = getStorageKey(connectionId, pluginId);
      if (css.trim()) {
        window.localStorage.setItem(key, css);
      } else {
        window.localStorage.removeItem(key);
      }
    } catch {
      // ignore
    }
  };

  const discardDraft = () => {
    setDraftCss(appliedCss);
  };

  return {
    appliedCss,
    draftCss,
    setDraftCss,
    isOpen,
    open,
    close,
    save,
    discardDraft,
  };
}
