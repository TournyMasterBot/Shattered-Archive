// apps/dsl-color-preview/src/extension.ts

import * as vscode from 'vscode';
import { renderToHtml, toAnsiText, toPlainText } from './convert';
import { getWebviewHtml } from './getWebviewHtml';

const DEBOUNCE_MS = 120;

let panel: vscode.WebviewPanel | undefined;
let boundDocument: vscode.TextDocument | undefined;
let updateTimer: ReturnType<typeof setTimeout> | undefined;

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('dslColorPreview.showPreview', (uri?: vscode.Uri) => showPreview(context, uri)),
    vscode.commands.registerCommand('dslColorPreview.copyPlainText', () => copyText('plain text', toPlainText)),
    vscode.commands.registerCommand('dslColorPreview.copyAnsiText', () => copyText('ANSI text', toAnsiText)),
    vscode.window.onDidChangeActiveTextEditor(onActiveEditorChanged),
  );
}

// Copies the selection (all cursors, newline-joined like a normal copy) or, with
// nothing selected, the whole document. Target is the active editor; when the
// preview panel has focus there is no active text editor, so fall back to the
// previewed document and whatever selection it has in a visible editor.
async function copyText(label: string, convert: (text: string) => string): Promise<void> {
  const editor =
    vscode.window.activeTextEditor ?? vscode.window.visibleTextEditors.find((e) => e.document === boundDocument);
  const document = editor?.document ?? boundDocument;

  if (!document) {
    vscode.window.showInformationMessage('DSL Color Preview: open a text file first.');
    return;
  }

  const selected = (editor?.selections ?? [])
    .filter((s) => !s.isEmpty)
    .map((s) => document.getText(s))
    .join(document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n');
  const scope = selected.length > 0 ? 'selection' : 'whole file';

  const text = convert(selected.length > 0 ? selected : document.getText());
  await vscode.env.clipboard.writeText(text);
  vscode.window.setStatusBarMessage(`DSL Color Preview: copied ${scope} as ${label} (${text.length} chars)`, 4000);
}

// Auto-follow: once the panel is open, switching to another .txt file in the
// editor rebinds the preview to it. Manual invocation (command palette,
// context menu) still targets whatever was explicitly requested.
function onActiveEditorChanged(editor: vscode.TextEditor | undefined): void {
  if (!panel || !editor) return;
  if (editor.document.uri.scheme !== 'file') return;
  if (!editor.document.fileName.toLowerCase().endsWith('.txt')) return;
  if (editor.document === boundDocument) return;

  boundDocument = editor.document;
  render();
}

export function deactivate(): void {
  if (updateTimer) {
    clearTimeout(updateTimer);
    updateTimer = undefined;
  }
}

async function showPreview(context: vscode.ExtensionContext, uri?: vscode.Uri): Promise<void> {
  // uri is set when invoked from a context menu (explorer or editor title/gutter);
  // command palette / editor-body invocations fall back to the active editor.
  const document = uri ? await vscode.workspace.openTextDocument(uri) : vscode.window.activeTextEditor?.document;

  if (!document) {
    vscode.window.showInformationMessage('DSL Color Preview: open a text file first.');
    return;
  }

  boundDocument = document;

  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside, true);
    render();
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'dslColorPreview',
    'DSL Color Preview',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: false, retainContextWhenHidden: true },
  );

  panel.onDidDispose(
    () => {
      panel = undefined;
      boundDocument = undefined;
      if (updateTimer) {
        clearTimeout(updateTimer);
        updateTimer = undefined;
      }
    },
    null,
    context.subscriptions,
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (boundDocument && e.document === boundDocument) {
        scheduleRender();
      }
    }),
  );

  render();
}

function scheduleRender(): void {
  if (updateTimer) clearTimeout(updateTimer);
  updateTimer = setTimeout(render, DEBOUNCE_MS);
}

function render(): void {
  if (!panel || !boundDocument) return;

  const fileName = boundDocument.fileName.split(/[\\/]/).pop() ?? 'DSL Color Preview';
  panel.title = `Preview: ${fileName}`;
  panel.webview.html = getWebviewHtml(renderToHtml(boundDocument.getText()));
}
