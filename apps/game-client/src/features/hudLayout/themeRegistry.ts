import React from 'react';
import type { HudShellBaseProps } from '../../components/hud/LayoutShellProps';
import { pluginHost } from '../plugins/pluginHost';
import type { HudThemeId } from './hudThemeStore';

export type { HudThemeId } from './hudThemeStore';

const DEFAULT_NARROW_BREAKPOINT = 900;

export interface ThemeDefinition {
  id: HudThemeId;
  label: string;
  ShellComponent: React.LazyExoticComponent<React.ComponentType<HudShellBaseProps>>;
  /**
   * A theme's own narrow-viewport variant, styled with that theme's own
   * color scheme. If a theme doesn't define one, resolveActiveTheme falls
   * back to 'default's shell (and styles) at narrow widths — today's
   * behavior for any theme that hasn't built its own narrow layout yet.
   */
  NarrowShellComponent?: React.LazyExoticComponent<React.ComponentType<HudShellBaseProps>>;
  /** Width at/below which NarrowShellComponent (or the fallback) applies. */
  narrowBreakpoint?: number;
  /** Applies this theme's visual skin. Called whenever it becomes active. */
  loadStyles?: () => void;
  /**
   * Called once whenever this theme becomes the resolved active theme
   * (MainContainer calls it AFTER core plugins are registered —
   * pluginHost.enable silently no-ops on an unregistered id otherwise).
   * Separate from loadStyles: this is theme→plugin lifecycle, not visual
   * application. Never auto-DISABLES anything — pluginHost.enable() is
   * idempotent, and a user's own explicit choice (via the Plugins list)
   * always wins since pluginHost.syncInstalled only reconciles plugins
   * present in plugins.installed, leaving anything enabled from here alone.
   */
  onActivate?: () => void;
}

/**
 * Themes apply via a `data-hud-theme` attribute on the root element, not a
 * swapped <link>. A theme's own CSS (e.g. slateAmber.theme.scss) is gated
 * entirely behind `:root[data-hud-theme='<id>']`, and is loaded onto the
 * page as a side effect of its ShellComponent's own lazy chunk — this just
 * flips the attribute that makes those already-loaded rules take effect.
 */
function setActiveThemeAttribute(id: HudThemeId): void {
  try {
    document.documentElement.setAttribute('data-hud-theme', id);
  } catch {
    // non-browser environment (SSR/tests) — nothing to set
  }
}

export const THEME_REGISTRY: Record<HudThemeId, ThemeDefinition> = {
  default: {
    id: 'default',
    label: 'Default',
    ShellComponent: React.lazy(() => import('../../components/hud/DefaultThemeShell')),
    loadStyles: () => setActiveThemeAttribute('default'),
  },
  'slate-amber': {
    id: 'slate-amber',
    label: 'Slate & Amber',
    ShellComponent: React.lazy(() => import('../../components/hud/CompactLayoutShell')),
    NarrowShellComponent: React.lazy(() => import('../../components/hud/CompactLayoutShellNarrow')),
    narrowBreakpoint: DEFAULT_NARROW_BREAKPOINT,
    loadStyles: () => setActiveThemeAttribute('slate-amber'),
    onActivate: () => pluginHost.enable('world-time-and-identity'),
  },
};

export interface ResolvedTheme {
  /** The theme whose STYLES should apply — matches ShellComponent below (may
   *  differ from the originally-selected theme id when falling back at a
   *  narrow width). */
  theme: ThemeDefinition;
  ShellComponent: React.LazyExoticComponent<React.ComponentType<HudShellBaseProps>>;
  isNarrow: boolean;
}

/**
 * Resolves which shell (and whose styles) should actually render for a given
 * selected theme id and viewport width. Pure and synchronous — safe to call
 * every render, no memoization needed.
 */
export function resolveActiveTheme(themeId: HudThemeId, viewportWidth: number): ResolvedTheme {
  const selected = THEME_REGISTRY[themeId] ?? THEME_REGISTRY.default;
  const breakpoint = selected.narrowBreakpoint ?? DEFAULT_NARROW_BREAKPOINT;
  const isNarrow = viewportWidth <= breakpoint;

  if (isNarrow) {
    if (selected.NarrowShellComponent) {
      return { theme: selected, ShellComponent: selected.NarrowShellComponent, isNarrow: true };
    }
    const fallback = THEME_REGISTRY.default;
    return { theme: fallback, ShellComponent: fallback.ShellComponent, isNarrow: true };
  }

  return { theme: selected, ShellComponent: selected.ShellComponent, isNarrow: false };
}
