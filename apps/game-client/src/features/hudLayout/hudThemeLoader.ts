import type { HudTheme } from './hudThemeStore';

const LINK_ID = 'hud-theme-style';
const THEME_HREF: Partial<Record<HudTheme, string>> = {
  'slate-amber': '/themes/slate-amber.css',
};

export function applyHudTheme(theme: HudTheme): void {
  const existing = document.getElementById(LINK_ID) as HTMLLinkElement | null;
  const href = THEME_HREF[theme];

  if (!href) {
    existing?.remove();
    return;
  }

  if (existing) {
    if (!existing.href.endsWith(href)) existing.href = href;
    return;
  }

  const link = document.createElement('link');
  link.id = LINK_ID;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}
