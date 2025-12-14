// apps/game-client/src/hooks/useMainContainer.ts
import { useState, useEffect, useCallback, CSSProperties } from 'react';
import type React from 'react';
import { initBrowserLuaRunner } from '../features/userScripts/luaRuntime';
import { ensureAudioRuntimeAttached } from '../features/audio/audio-runtime';

/* -------------------------------------------
   Layout constants
-------------------------------------------- */
/** Min width of SideBar.tsx */
const MIN_RIGHT_WIDTH = 220;
/** Max width of SideBar.tsx */
const MAX_RIGHT_WIDTH = 640;

/** Min height of BottomPane.tsx */
const MIN_BOTTOM_HEIGHT = 120;
/** Max height of BottomPane.tsx */
const MAX_BOTTOM_HEIGHT = 480;

/* -------------------------------------------
   User CSS constants / helpers
-------------------------------------------- */
/** Local storage key for CSS overrides */
const USER_CSS_KEY = 'shatteredArchive.userCssOverride';
/** ID of user css override */
const USER_CSS_STYLE_ID = 'user-css-override-style';

function applyUserCss(css: string) {
  if (typeof document === 'undefined') return;

  let styleEl = document.getElementById(USER_CSS_STYLE_ID) as HTMLStyleElement | null;

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = USER_CSS_STYLE_ID;
    document.head.appendChild(styleEl);
  }

  styleEl.innerHTML = css || '';
}

/* -------------------------------------------
   Layout sizing
-------------------------------------------- */
export function useLayoutSizing() {
  const [rightWidth, setRightWidth] = useState(320);
  const [bottomHeight, setBottomHeight] = useState(220);

  const layoutVars: CSSProperties = {
    '--right-pane-width': `${rightWidth}px`,
    '--bottom-pane-height': `${bottomHeight}px`,
  } as CSSProperties;

  const handleVerticalResizeMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = rightWidth;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = startX - ev.clientX;
        let nextWidth = startWidth + delta;
        nextWidth = Math.min(MAX_RIGHT_WIDTH, Math.max(MIN_RIGHT_WIDTH, nextWidth));
        setRightWidth(nextWidth);
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [rightWidth],
  );

  const handleHorizontalResizeMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = bottomHeight;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = startY - ev.clientY;
        let nextHeight = startHeight + delta;
        nextHeight = Math.min(MAX_BOTTOM_HEIGHT, Math.max(MIN_BOTTOM_HEIGHT, nextHeight));
        setBottomHeight(nextHeight);
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [bottomHeight],
  );

  return {
    layoutVars,
    handleVerticalResizeMouseDown,
    handleHorizontalResizeMouseDown,
  };
}

/* -------------------------------------------
   Hook: top menu state
-------------------------------------------- */
type GameSettingsSection = 'Graphics' | 'Audio' | null;

export function useMenuState() {
  const [openRootMenu, setOpenRootMenu] = useState<string | null>(null);
  const [isGameSettingsOpen, setIsGameSettingsOpen] = useState(false);
  const [openGameSettingsSection, setOpenGameSettingsSection] = useState<GameSettingsSection>(null);

  const toggleRootMenu = (id: string) => {
    setOpenRootMenu((prev) => (prev === id ? null : id));
    setIsGameSettingsOpen(false);
    setOpenGameSettingsSection(null);
  };

  const closeAllMenus = () => {
    setOpenRootMenu(null);
    setIsGameSettingsOpen(false);
    setOpenGameSettingsSection(null);
  };

  const toggleGameSettings = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsGameSettingsOpen((prev) => !prev);
    setOpenGameSettingsSection(null);
  };

  const toggleGameSettingsSection = (e: React.MouseEvent, section: Exclude<GameSettingsSection, null>) => {
    e.stopPropagation();
    setOpenGameSettingsSection((prev) => (prev === section ? null : section));
  };

  return {
    openRootMenu,
    isGameSettingsOpen,
    openGameSettingsSection,
    toggleRootMenu,
    closeAllMenus,
    toggleGameSettings,
    toggleGameSettingsSection,
  };
}

/* -------------------------------------------
   Hook: user CSS overrides + modal state
-------------------------------------------- */
export function useUserCssOverrides() {
  const [userCssApplied, setUserCssApplied] = useState<string>('');
  const [userCssDraft, setUserCssDraft] = useState<string>('');
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(USER_CSS_KEY) || '';
      setUserCssApplied(stored);
      setUserCssDraft(stored);
      applyUserCss(stored);
    } catch {
      // ignore localStorage errors
    }
  }, []);

  const openStyleModal = () => setIsStyleModalOpen(true);
  const closeStyleModal = () => setIsStyleModalOpen(false);

  const saveUserCss = () => {
    const css = userCssDraft;
    setUserCssApplied(css);
    applyUserCss(css);
    try {
      if (css.trim()) {
        window.localStorage.setItem(USER_CSS_KEY, css);
      } else {
        window.localStorage.removeItem(USER_CSS_KEY);
      }
    } catch {
      // ignore storage errors
    }
  };

  const discardDraft = () => {
    setUserCssDraft(userCssApplied);
  };

  return {
    userCssApplied,
    userCssDraft,
    setUserCssDraft,
    isStyleModalOpen,
    openStyleModal,
    closeStyleModal,
    saveUserCss,
    discardDraft,
  };
}

/* -------------------------------------------
   Hook: main initialization + connect modal
-------------------------------------------- */
export function useMainContainer() {
  // Initialize Lua runtime once
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        initBrowserLuaRunner();
        console.log('[Lua] Browser Lua runtime initialized');
      } catch (err) {
        console.error('[Lua] Failed to initialize Lua runtime:', err);
      }
    }
  }, []);

  useEffect(() => {
    ensureAudioRuntimeAttached();
  }, []);

  // Only connect modal open/close lives here now
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);

  const openConnectModal = () => setIsConnectModalOpen(true);
  const closeConnectModal = () => setIsConnectModalOpen(false);

  return {
    isConnectModalOpen,
    openConnectModal,
    closeConnectModal,
  };
}
