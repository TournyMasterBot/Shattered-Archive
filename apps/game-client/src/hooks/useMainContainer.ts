// apps/game-client/src/hooks/useMainContainer.ts
import { useState, useEffect, useCallback, CSSProperties } from 'react';
import type React from 'react';
import { initBrowserLuaRunner } from '../features/userScripts/luaRuntime';
import { ensureAudioRuntimeAttached } from '../features/audio/audio-runtime';
import { getAccessibilitySettings } from '../features/accessibility/accessibility-settings-store';

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

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function buildAccessibilityCss(): string {
  const settings = getAccessibilitySettings();

  const fontScale = clamp(Number(settings.fontScale ?? 1), 0.8, 1.6);

  const fontCss = `
/* [sa-accessibility] Font scale */
:root { --sa-font-scale: ${fontScale}; }
html { font-size: calc(16px * var(--sa-font-scale)); }
`.trim();

  const highContrastCss = settings.preferHighContrast
    ? `
/* [sa-accessibility] Prefer high contrast UI (reasonable) */
#root {
  /* Core palette */
  --sa-hc-bg: #0b0c0f;
  --sa-hc-surface: #12141a;
  --sa-hc-surface2: #171a22;

  --sa-hc-text: #f5f7ff;
  --sa-hc-muted: #c5ccdd;

  --sa-hc-border: #3a4153;
  --sa-hc-border-strong: #6b7590;

  --sa-hc-accent: #7dd3fc;      /* cyan-ish */
  --sa-hc-accent2: #a78bfa;     /* purple-ish */
  --sa-hc-danger: #fb7185;

  --sa-hc-focus: #fbbf24;       /* amber focus ring */
  --sa-hc-shadow: rgba(0, 0, 0, 0.55);

  background: var(--sa-hc-bg) !important;
  color: var(--sa-hc-text) !important;
}

/* Text hierarchy */
#root .muted,
#root [data-muted="true"] {
  color: var(--sa-hc-muted) !important;
}

/* Surfaces (common containers) */
#root .panel,
#root .card,
#root .modal,
#root [role="dialog"],
#root .rightPane,
#root .leftNav {
  background: var(--sa-hc-surface) !important;
  color: var(--sa-hc-text) !important;
  border-color: var(--sa-hc-border) !important;
  box-shadow: 0 8px 24px var(--sa-hc-shadow);
}

/* Dividers */
#root hr,
#root .divider {
  border-color: var(--sa-hc-border) !important;
  opacity: 1 !important;
}

/* Links */
#root a {
  color: var(--sa-hc-accent) !important;
  text-decoration: underline;
  text-underline-offset: 2px;
}
#root a:hover {
  color: #b7ecff !important;
}

/* Buttons */
#root button,
#root [role="button"],
#root input[type="button"],
#root input[type="submit"] {
  background: var(--sa-hc-surface2) !important;
  color: var(--sa-hc-text) !important;
  border: 1px solid var(--sa-hc-border-strong) !important;
}

#root button:hover,
#root [role="button"]:hover {
  border-color: var(--sa-hc-accent) !important;
}

#root button:disabled,
#root input:disabled,
#root select:disabled,
#root textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Inputs */
#root input,
#root textarea,
#root select {
  background: #0e1016 !important;
  color: var(--sa-hc-text) !important;
  border: 1px solid var(--sa-hc-border-strong) !important;
}
#root input::placeholder,
#root textarea::placeholder {
  color: #9aa6bf !important;
  opacity: 1;
}

/* Checkbox / radio accent */
#root input[type="checkbox"],
#root input[type="radio"] {
  accent-color: var(--sa-hc-accent);
}

/* Selection */
#root ::selection {
  background: rgba(125, 211, 252, 0.35);
}

/* Focus: make it obvious and consistent */
#root :focus-visible {
  outline: 3px solid var(--sa-hc-focus) !important;
  outline-offset: 2px;
}

/* Scrollbars (Chromium / Edge) */
#root *::-webkit-scrollbar {
  width: 12px;
  height: 12px;
}
#root *::-webkit-scrollbar-thumb {
  background: #3b4256;
  border: 2px solid var(--sa-hc-surface);
  border-radius: 10px;
}
#root *::-webkit-scrollbar-thumb:hover {
  background: #4b5470;
}
#root *::-webkit-scrollbar-corner {
  background: var(--sa-hc-surface);
}
`.trim()
    : '';

  // (Reduce motion can be added here later, same pattern.)
  return [fontCss, highContrastCss].filter(Boolean).join('\n\n');
}

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

function applyCombinedCss(userCss: string) {
  const accessibilityCss = buildAccessibilityCss();

  const combined = `
/* =========================================================
   Shattered Archive CSS Overrides
   ========================================================= */

/* [user-css] */
${userCss ?? ''}

/* [accessibility-css] */
${accessibilityCss ?? ''}
`.trim();

  applyUserCss(combined);
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

      let isActive = true;

      const onMouseMove = (ev: MouseEvent) => {
        if (!isActive) return;

        const delta = startX - ev.clientX;
        let nextWidth = startWidth + delta;
        nextWidth = Math.min(MAX_RIGHT_WIDTH, Math.max(MIN_RIGHT_WIDTH, nextWidth));
        setRightWidth(nextWidth);
      };

      const onMouseUp = () => {
        if (!isActive) return;
        isActive = false;

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

      // Apply combined CSS at startup
      applyCombinedCss(stored);
    } catch {
      // ignore localStorage errors
    }
  }, []);

  // When accessibility settings change, re-apply combined CSS (using current applied user css)
  useEffect(() => {
    const onUpdated = () => {
      applyCombinedCss(userCssApplied);
    };

    window.addEventListener('shatteredarchive:accessibility-updated', onUpdated);
    return () => window.removeEventListener('shatteredarchive:accessibility-updated', onUpdated);
  }, [userCssApplied]);

  const openStyleModal = () => setIsStyleModalOpen(true);

  const closeStyleModal = () => {
    // If user was previewing draft, revert to applied on close
    applyCombinedCss(userCssApplied);
    setIsStyleModalOpen(false);
  };

  const saveUserCss = () => {
    const css = userCssDraft;
    setUserCssApplied(css);

    // Apply combined and persist only the user portion
    applyCombinedCss(css);

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

  const previewDraft = () => {
    // Apply combined but do NOT persist
    applyCombinedCss(userCssDraft);
  };

  const discardDraft = () => {
    setUserCssDraft(userCssApplied);

    // Revert preview immediately if they discard
    applyCombinedCss(userCssApplied);
  };

  return {
    userCssApplied,
    userCssDraft,
    setUserCssDraft,
    isStyleModalOpen,
    openStyleModal,
    closeStyleModal,
    saveUserCss,
    previewDraft,
    discardDraft,
  };
}

/* -------------------------------------------
   Hook: main initialization + connect modal + library modal
-------------------------------------------- */
export function useMainContainer() {
  // Initialize Lua runtime once
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        initBrowserLuaRunner();
        //console.log('[Lua] Browser Lua runtime initialized');
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

  // Library modal open/close (Notes & Books)
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);
  const openLibraryModal = () => setIsLibraryModalOpen(true);
  const closeLibraryModal = () => setIsLibraryModalOpen(false);

  const [isEquipmentModalOpen, setIsEquipmentModalOpen] = useState(false);
  const openEquipmentModal = () => setIsEquipmentModalOpen(true);
  const closeEquipmentModal = () => setIsEquipmentModalOpen(false);

  return {
    isConnectModalOpen,
    openConnectModal,
    closeConnectModal,

    isLibraryModalOpen,
    openLibraryModal,
    closeLibraryModal,

    isEquipmentModalOpen,
    openEquipmentModal,
    closeEquipmentModal,
  };
}
