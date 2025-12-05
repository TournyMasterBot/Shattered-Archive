// apps/game-client/src/hooks/useMainContainer.ts
import { useState, useEffect, useCallback, CSSProperties } from 'react';
import type React from 'react';
import { initBrowserLuaRunner } from '../features/userScripts/luaRuntime';

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

/**
 * Injects or updates a <style> tag in <head> with user-supplied CSS.
 *
 * This is used by the custom CSS override feature so users can
 * visually customize the client without reloading the page.
 *
 * @param css Raw CSS string to inject. Empty string clears the style tag.
 */
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

/**
 * Manages layout sizing for the main split container (right pane width
 * and bottom pane height), and exposes mouse handlers that perform
 * drag-to-resize behavior.
 *
 * Returned `layoutVars` is meant to be spread onto the root layout
 * element as inline style so SCSS can consume the CSS custom properties.
 *
 * @returns Object containing:
 * - `layoutVars`: CSS custom properties for the layout.
 * - `handleVerticalResizeMouseDown`: mousedown handler for the right splitter.
 * - `handleHorizontalResizeMouseDown`: mousedown handler for the bottom splitter.
 */
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
/** Available menu items for Game --> Settings */
type GameSettingsSection = 'Graphics' | 'Audio' | 'Controls' | null;

/**
 * Encapsulates state and event handlers for the top menu bar, including:
 * - which root menu is open (File / Profiles / Game / Help)
 * - whether the Game > Settings submenu is open
 * - which Settings sub-section (Graphics / Audio / Controls) is expanded.
 *
 * This keeps menu logic out of the page component and makes it easier
 * to test or swap the menu implementation later.
 *
 * @returns Object containing menu state and toggle helpers.
 */
export function useMenuState() {
  const [openRootMenu, setOpenRootMenu] = useState<string | null>(null);
  const [isGameSettingsOpen, setIsGameSettingsOpen] = useState(false);
  const [openGameSettingsSection, setOpenGameSettingsSection] = useState<GameSettingsSection>(null);

  /**
   * Opens or closes a specific root menu. Also resets any deeper
   * Game Settings menus when switching between root menus.
   *
   * @param id Root menu identifier (e.g. "File", "Profiles", "Game", "Help").
   */
  const toggleRootMenu = (id: string) => {
    setOpenRootMenu((prev) => (prev === id ? null : id));
    setIsGameSettingsOpen(false);
    setOpenGameSettingsSection(null);
  };

  /**
   * Closes all menus at every level (root + nested).
   * Useful when opening dialogs or when clicking outside the menu bar.
   */
  const closeAllMenus = () => {
    setOpenRootMenu(null);
    setIsGameSettingsOpen(false);
    setOpenGameSettingsSection(null);
  };

  /**
   * Toggles the Game > Settings submenu.
   * Stops event propagation so clicking the item doesn’t re-trigger
   * the root menu toggle.
   */
  const toggleGameSettings = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsGameSettingsOpen((prev) => !prev);
    setOpenGameSettingsSection(null);
  };

  /**
   * Toggles a specific Game Settings section (Graphics / Audio / Controls).
   * Clicking the same section twice will collapse it.
   *
   * @param e Mouse event from the menu item.
   * @param section Settings section identifier.
   */
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
/**
 * Handles the Custom CSS Overrides feature:
 * - Loads any previously applied CSS from localStorage on mount.
 * - Maintains separate "applied" and "draft" CSS strings so users
 *   can experiment without committing changes.
 * - Injects CSS into the document head when saved.
 * - Tracks whether the Custom Styles modal is open.
 *
 * @returns Object containing:
 * - `userCssApplied`: currently active CSS string.
 * - `userCssDraft`: editable draft CSS string.
 * - `setUserCssDraft`: setter for the draft string.
 * - `isStyleModalOpen`: whether the modal is visible.
 * - `openStyleModal` / `closeStyleModal`: modal visibility controls.
 * - `saveUserCss`: applies the draft, injects it, and persists to localStorage.
 * - `discardDraft`: resets the draft back to the last applied CSS.
 */
export function useUserCssOverrides() {
  const [userCssApplied, setUserCssApplied] = useState<string>('');
  const [userCssDraft, setUserCssDraft] = useState<string>('');
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);

  // Load existing applied CSS on mount
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

  /**
   * Opens the Custom Styles modal.
   */
  const openStyleModal = () => setIsStyleModalOpen(true);

  /**
   * Closes the Custom Styles modal.
   * Does not change applied or draft CSS by itself.
   */
  const closeStyleModal = () => setIsStyleModalOpen(false);

  /**
   * Applies the current draft CSS as the active override, injects it
   * into the document, and persists it to localStorage. Passing an
   * empty or whitespace-only draft clears any stored override.
   */
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

  /**
   * Discards any unsaved edits in the draft, restoring it to the
   * last applied CSS value.
   */
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
   Hook: main initialization container
-------------------------------------------- */
export function useMainContainer() {
  // any state here...

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

  return {
    // return layout + menus + css etc
  };
}
