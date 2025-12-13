// apps/game-client/src/hooks/useGameCommand.ts
import { useCallback, useState } from 'react';
import type React from 'react';
import { userScriptRuntime } from '../features/userScripts/runtimeSingleton';

interface UseGameCommandOptions {
  /** Raw send function from useGameConnection (or equivalent). */
  sendRaw: (data: string) => void;

  /** Optional connection flag so the input can disable itself if needed. */
  isConnected?: boolean;
}

interface UseGameCommandResult {
  /** Bound value for your input box. */
  inputValue: string;

  /** Setter for your input box onChange. */
  setInputValue: (value: string) => void;

  /**
   * Send the current inputValue.
   * Does NOT trim or alter the input string.
   */
  sendCommand: () => void;

  /** Key handler for Enter / ArrowUp / ArrowDown (history). */
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;

  /** Convenience flag for UI state (disable send, show status, etc). */
  isConnected: boolean;
}

/**
 * Higher-level command hook.
 * Wraps a low-level sendRaw so UI components don't care about WebSockets.
 * Includes command history with Up/Down navigation.
 */
export function useGameCommand(options: UseGameCommandOptions): UseGameCommandResult {
  const { sendRaw, isConnected = false } = options;

  const [inputValue, setInputValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  /**
   * null  => editing a fresh command
   * 0..n  => index into `history` (0 = oldest, history.length-1 = newest)
   */
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);

  const sendCommand = useCallback(() => {
    if (!isConnected) {
      return;
    }

    const txt = inputValue;

    // Send to the game server
    if (userScriptRuntime) {
      userScriptRuntime.executeAlias(txt);
    } else {
      // 2) Fallback: no runtime available, send the raw line directly
      sendRaw(txt);

      try {
        window.dispatchEvent(
          new CustomEvent('dsl:command-sent', {
            detail: { text: txt },
          }),
        );
      } catch {
        // ignore
      }
    }

    // Push onto history (newest at the end)
    setHistory((prev) => [...prev, txt]);

    // Reset editing state
    setHistoryIndex(null);
    setInputValue('');
  }, [inputValue, sendRaw, isConnected]);

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendCommand();
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (history.length === 0) return;

        // First press: jump to newest
        if (historyIndex === null) {
          const newIndex = history.length - 1;
          setHistoryIndex(newIndex);
          setInputValue(history[newIndex]);
          return;
        }

        // Subsequent presses: walk backward, but don't go past oldest
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setInputValue(history[newIndex]);
        }
        // If already at 0, stay there (per your "stay on last going back" rule)
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (history.length === 0) return;

        // If not in history, nothing to do
        if (historyIndex === null) return;

        // If we're at the newest entry and go "forward", clear the input
        if (historyIndex === history.length - 1) {
          setHistoryIndex(null);
          setInputValue('');
          return;
        }

        // Otherwise move toward newer
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInputValue(history[newIndex]);
        return;
      }
    },
    [history, historyIndex, sendCommand],
  );

  return {
    inputValue,
    setInputValue,
    sendCommand,
    handleKeyDown,
    isConnected,
  };
}
