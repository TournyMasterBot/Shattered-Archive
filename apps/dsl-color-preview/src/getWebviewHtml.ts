// apps/dsl-color-preview/src/getWebviewHtml.ts

/**
 * Wraps rendered DSL color HTML in a full webview document. Styling mirrors
 * the game-client Library modal's .previewBody (near-black background,
 * monospace, white-space: pre) so the preview looks like the in-game one.
 */
export function getWebviewHtml(renderedBody: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';" />
<style>
  html, body {
    margin: 0;
    padding: 0;
    background: #0b0b0b;
  }
  body {
    padding: 10px;
    color: #e6e6e6;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.85rem;
    line-height: 1.35;
    white-space: pre;
  }
  .empty {
    color: #6a6a6a;
    font-style: italic;
  }
</style>
</head>
<body>${renderedBody || '<span class="empty">(empty document)</span>'}</body>
</html>`;
}
