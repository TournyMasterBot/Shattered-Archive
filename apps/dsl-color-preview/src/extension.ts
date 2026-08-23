// apps/dsl-color-preview/src/extension.ts

import * as vscode from 'vscode';
import { renderDslToHtml } from './renderDslToHtml';
import { getWebviewHtml } from './getWebviewHtml';

const DEBOUNCE_MS = 120;

let panel: vscode.WebviewPanel | undefined;
let boundDocument: vscode.TextDocument | undefined;
let updateTimer: ReturnType<typeof setTimeout> | undefined;

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('dslColorPreview.showPreview', (uri?: vscode.Uri) => showPreview(context, uri)),
    vscode.window.onDidChangeActiveTextEditor(onActiveEditorChanged),
  );
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
  panel.webview.html = getWebviewHtml(renderDslToHtml(boundDocument.getText()));
}
