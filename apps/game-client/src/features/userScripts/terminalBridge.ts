// apps/game-client/src/features/userScripts/terminalBridge.ts
import { renderDslToAnsi } from './dslToAnsi';

/**
 * Emit raw ANSI text directly to the xterm terminal bypass path.
 *
 * This writes to the same xterm instance used by useTerminal,
 * but via the `game:terminal-data-script` event that does NOT go
 * through omit/line filtering.
 */
export function emitScriptTerminal(text: string): void {
  if (!text) return;

  try {
    window.dispatchEvent(
      new CustomEvent('game:terminal-data-script', {
        detail: { text },
      }),
    );
  } catch {
    // Ignore in non-browser / test environments
  }
}

/**
 * High-level helper: take DSL-colored text, convert it to ANSI,
 * and emit it to the xterm play area.
 *
 * NOTE: To avoid color bleed, the DSL line should end with {x.
 */
export function writeTerminalFromDsl(dsl: string): void {
  const raw = dsl ?? '';
  if (!raw) return;

  const ansi = renderDslToAnsi(raw);
  if (!ansi) return;

  emitScriptTerminal(ansi);
}
