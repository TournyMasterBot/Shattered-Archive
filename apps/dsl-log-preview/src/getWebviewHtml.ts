// apps/dsl-log-preview/src/getWebviewHtml.ts

/**
 * Wraps rendered ANSI log HTML in a full webview document. Same near-black
 * backdrop as dsl-color-preview's webview, for the same reason: the palette
 * (and its true-black handling) assumes that background.
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
    white-space: pre-wrap;
    word-break: break-word;
  }
  .empty {
    color: #6a6a6a;
    font-style: italic;
  }
</style>
</head>
<body>${renderedBody || '<span class="empty">(no renderable log records found)</span>'}</body>
</html>`;
}
