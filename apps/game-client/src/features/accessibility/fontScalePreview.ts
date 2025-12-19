// apps/game-client/src/features/accessibility/fontScalePreview.ts

const PREVIEW_TAG_ID = 'sa-font-scale-preview';

export function setPreviewFontScale(scale: number): void {
  try {
    let tag = document.getElementById(PREVIEW_TAG_ID) as HTMLStyleElement | null;
    if (!tag) {
      tag = document.createElement('style');
      tag.id = PREVIEW_TAG_ID;
      document.head.appendChild(tag);
    }

    // Simple: apply to root via CSS variable
    tag.textContent = `
:root {
  --sa-font-scale-preview: ${scale};
}
`;
  } catch {
    // ignore
  }
}

export function clearPreviewFontScale(): void {
  try {
    const tag = document.getElementById(PREVIEW_TAG_ID);
    if (tag && tag.parentNode) tag.parentNode.removeChild(tag);
  } catch {
    // ignore
  }
}
