// apps/dsl-log-preview/src/extension.ts

import * as vscode from 'vscode';
import { parseJsonlLog } from './parseJsonlLog';
import { ansiToHtml } from './ansiToHtml';
import { getWebviewHtml } from './getWebviewHtml';

const DEBOUNCE_MS = 200;

let panel: vscode.WebviewPanel | undefined;
let boundDocument: vscode.TextDocument | undefined;
let updateTimer: ReturnType<typeof setTimeout> | undefined;

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('dslLogPreview.showPreview', (uri?: vscode.Uri) => showPreview(context, uri)),
    vscode.window.onDidChangeActiveTextEditor(onActiveEditorChanged),
  );
}

export function deactivate(): void {
  if (updateTimer) {
    clearTimeout(updateTimer);
    updateTimer = undefined;
  }
}

// Auto-follow: once the panel is open, switching to another .jsonl file in
// the editor rebinds the preview to it. Manual invocation (command palette,
// context menu) still targets whatever was explicitly requested.
function onActiveEditorChanged(editor: vscode.TextEditor | undefined): void {
  if (!panel || !editor) return;
  if (editor.document.uri.scheme !== 'file') return;
  if (!editor.document.fileName.toLowerCase().endsWith('.jsonl')) return;
  if (editor.document === boundDocument) return;

  boundDocument = editor.document;
  render();
}

async function showPreview(context: vscode.ExtensionContext, uri?: vscode.Uri): Promise<void> {
  const document = uri ? await vscode.workspace.openTextDocument(uri) : vscode.window.activeTextEditor?.document;

  if (!document) {
    vscode.window.showInformationMessage('DSL Log Preview: open a .jsonl log file first.');
    return;
  }

  boundDocument = document;

  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside, true);
    render();
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'dslLogPreview',
    'DSL Log Preview',
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

  const fileName = boundDocument.fileName.split(/[\\/]/).pop() ?? 'DSL Log Preview';
  panel.title = `Preview: ${fileName}`;

  const ansiText = parseJsonlLog(boundDocument.getText());
  panel.webview.html = getWebviewHtml(ansiToHtml(ansiText));
}
