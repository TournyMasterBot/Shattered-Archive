import { useCallback, useEffect, useState } from 'react';

import { storage } from '../storage.js';

export type Theme = 'light' | 'dark';

/**
 * Light/dark theming, driven by a `data-theme` attribute on `<html>` that the CSS variable
 * blocks in index.css key off.
 *
 * The attribute is set by an inline script in index.html BEFORE React mounts, so a
 * dark-mode visitor never sees a white flash. This hook adopts whatever that script decided
 * rather than recomputing it — two sources of truth would produce exactly the flash the
 * inline script exists to prevent.
 */
function currentTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  const stored = storage.getTheme();
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((previous) => {
      const next: Theme = previous === 'dark' ? 'light' : 'dark';
      // An explicit choice is sticky: once you pick, the OS preference stops overriding you.
      storage.setTheme(next);
      return next;
    });
  }, []);

  return { theme, toggle };
}
