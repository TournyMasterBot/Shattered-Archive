// apps/game-client/src/features/userStyles/userStyleOverrideStore.ts

const KEY_APPLIED = 'shatteredarchive.userStyleOverrides.appliedCss.v1';
const STYLE_TAG_ID = 'shatteredarchive-user-style-overrides';

export function getAppliedCss(): string {
  try {
    return localStorage.getItem(KEY_APPLIED) ?? '';
  } catch {
    return '';
  }
}

export function setAppliedCss(css: string): void {
  try {
    localStorage.setItem(KEY_APPLIED, css ?? '');
  } catch {
    // ignore
  }
  applyCssToDom(css ?? '');
}

export function applyCssToDom(css: string): void {
  const safeCss = css ?? '';

  // If this can ever run before <head> exists, you can optionally queue it.
  const head = document.head || document.getElementsByTagName('head')[0];
  if (!head) return;

  let el = document.getElementById(STYLE_TAG_ID);

  // If something else stole the id, remove it and recreate properly.
  if (el && el.tagName.toLowerCase() !== 'style') {
    el.parentElement?.removeChild(el);
    el = null;
  }

  const styleEl = (el as HTMLStyleElement) ?? document.createElement('style');
  styleEl.id = STYLE_TAG_ID;

  // Set CSS first
  styleEl.textContent = safeCss;

  // Then ensure it's LAST in <head> so it wins the cascade.
  // appendChild() will move it if it already exists.
  head.appendChild(styleEl);
}

// ------------------------------------------------------------
// High contrast block management (does NOT wipe user CSS)
// ------------------------------------------------------------

const HC_BEGIN = '/* SA:HIGH_CONTRAST_BEGIN */';
const HC_END = '/* SA:HIGH_CONTRAST_END */';

export const DEFAULT_HIGH_CONTRAST_CSS = `
${HC_BEGIN}
body * {
  color: #00ff66 !important;
  font-size: 18px !important;
}

button {
  background: #ffff00 !important;
  color: #000000 !important;
  border: 2px solid #ff00ff !important;
}

#root {
  border: 4px dashed #ff00ff !important;
}
${HC_END}
`.trim();

function stripHighContrastBlock(css: string): string {
  const raw = css ?? '';
  const start = raw.indexOf(HC_BEGIN);
  const end = raw.indexOf(HC_END);
  if (start === -1 || end === -1 || end < start) return raw;
  const before = raw.slice(0, start).trimEnd();
  const after = raw.slice(end + HC_END.length).trimStart();
  return [before, after].filter(Boolean).join('\n\n');
}

function ensureHighContrastBlock(css: string, block: string): string {
  const without = stripHighContrastBlock(css);
  if (!block?.trim()) return without;
  if (!without.trim()) return block.trim();
  return `${without.trim()}\n\n${block.trim()}\n`;
}

export function setHighContrastEnabled(enabled: boolean, blockCss: string = DEFAULT_HIGH_CONTRAST_CSS): void {
  const current = getAppliedCss();
  const next = enabled ? ensureHighContrastBlock(current, blockCss) : stripHighContrastBlock(current);
  if (next !== current) setAppliedCss(next);
}
