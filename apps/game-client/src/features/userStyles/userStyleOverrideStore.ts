// apps/game-client/src/features/userStyles/userStyleOverrideStore.ts

const KEY_APPLIED = 'sa.userStyleOverrides.appliedCss.v1';
const STYLE_TAG_ID = 'sa-user-style-overrides';

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
  try {
    let tag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null;
    if (!tag) {
      tag = document.createElement('style');
      tag.id = STYLE_TAG_ID;
      document.head.appendChild(tag);
    }
    tag.textContent = css ?? '';
  } catch {
    // ignore
  }
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
