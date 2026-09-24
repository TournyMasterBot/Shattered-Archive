import type { AutoLevelMode, AutoLevelRunState } from '../../features/autoleveling/autoleveling-types';

/**
 * Props every theme's shell component receives from MainContainer, regardless
 * of that theme's own internal layout. A theme's shell sources anything else
 * it needs (sizing, resize handles, its own sub-components) internally via
 * its own hooks, the way CompactLayoutShell already does — so every entry in
 * the theme registry can be swapped in/out through this one uniform contract.
 */
export interface HudShellBaseProps {
  isConnected: boolean;
  sendRaw: (data: string) => void;
  onOpenAutoLeveling?: () => void;
  autoLevelMode?: AutoLevelMode;
  autoLevelRunState?: AutoLevelRunState;
  onSightseeRescan?: () => void;
  /**
   * Every shell renders an empty div (in place of <Terminal/> directly) and
   * attaches this ref callback to it. MainContainer owns the single, real
   * <Terminal/> instance and portals it into whichever slot is currently
   * attached — so switching themes live moves the SAME xterm.js instance
   * (and its scrollback) into the new shell's layout instead of destroying
   * and recreating it. Required, not optional: a theme's shell that skips
   * this silently never shows a terminal at all.
   */
  terminalSlotRef: (el: HTMLDivElement | null) => void;
}
