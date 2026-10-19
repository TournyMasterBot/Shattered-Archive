import { DispatchEvent } from '../event-emitter/event-dispatcher';

export type HudThemeId = 'default' | 'slate-amber';

const KEY = 'shatteredArchive.hudTheme.id.v1';
const VALID: HudThemeId[] = ['default', 'slate-amber'];

/** Fired whenever setHudThemeId changes the value — same-tab live reactivity.
 * (localStorage's own native `storage` event only fires cross-tab, never for
 * a change made in the tab that called setItem, so MainContainer can't rely
 * on that alone to switch live.) */
export const HUD_THEME_CHANGED_EVENT = 'shatteredarchive:hud-theme-changed';

export function getHudThemeId(): HudThemeId {
  try {
    const raw = window.localStorage.getItem(KEY);
    return VALID.includes(raw as HudThemeId) ? (raw as HudThemeId) : 'default';
  } catch {
    return 'default';
  }
}

export function setHudThemeId(id: HudThemeId): void {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // ignore
  }
  DispatchEvent(HUD_THEME_CHANGED_EVENT, { id });
}
