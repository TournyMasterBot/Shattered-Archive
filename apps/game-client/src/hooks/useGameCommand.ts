// apps/game-client/src/hooks/useGameCommand.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { RuntimeSingleton } from '../features/userScripts/runtimeSingleton';
import { preprocessOutgoingCommand } from '../features/accessibility/accessibility-command';
import { OutboundQueue } from '../features/commands/outbount-queue';
import { DispatchEvent } from '../features/event-emitter/event-dispatcher';

interface UseGameCommandOptions {
  sendRaw: (data: string) => void;
  isConnected?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

interface UseGameCommandResult {
  inputValue: string;
  setInputValue: (value: string) => void;
  sendCommand: () => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  isConnected: boolean;
}

export function useGameCommand(options: UseGameCommandOptions): UseGameCommandResult {
  const { sendRaw, isConnected = false, inputRef } = options;

  const [inputValue, setInputValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);

  const selectInputAll = useCallback(() => {
    const el = inputRef?.current;
    if (!el) return;

    queueMicrotask(() => {
      try {
        el.focus();
        el.select();
      } catch {
        // ignore
      }
    });
  }, [inputRef]);

  const sendLineRef = useRef<(line: string) => void>(() => {});

  useEffect(() => {
    sendLineRef.current = (line: string) => {
      if (!isConnected) return;

      try {
        DispatchEvent('game:command-sent', {
          text:line
        });
      } catch {
        // ignore
      }

      if (RuntimeSingleton.Runtime) {
        RuntimeSingleton.Runtime.executeAlias(line);
      } else {
        sendRaw(line);
      }
    };
  }, [isConnected, sendRaw]);

  const queue = useMemo(() => new OutboundQueue(sendLineRef), []);

  const sendCommand = useCallback(() => {
    if (!isConnected) return;

    const txt = inputValue;
    const action = preprocessOutgoingCommand(txt, history);

    if (action.kind === 'noop') {
      setHistoryIndex(null);

      if (!action.keepInputAfterSend) {
        setInputValue('');
      } else {
        selectInputAll();
      }

      return;
    }

    if (action.flushQueue) {
      queue.flushPending();
    }

    for (const line of action.lines) {
      queue.enqueue({ kind: 'sendLine', line });
    }

    // Save the ORIGINAL, UNMODIFIED input as a single history entry
    setHistory((prev) => {
      if (txt.trim().length === 0) return prev;

      const next = [...prev, txt];
      if (next.length > 500) return next.slice(next.length - 500);
      return next;
    });

    setHistoryIndex(null);

    if (!action.keepInputAfterSend) {
      setInputValue('');
    } else {
      selectInputAll();
    }
  }, [inputValue, isConnected, history, queue, selectInputAll]);

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

        if (historyIndex === null) {
          const newIndex = history.length - 1;
          setHistoryIndex(newIndex);
          setInputValue(history[newIndex]);
          return;
        }

        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setInputValue(history[newIndex]);
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (history.length === 0) return;
        if (historyIndex === null) return;

        if (historyIndex === history.length - 1) {
          setHistoryIndex(null);
          setInputValue('');
          return;
        }

        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInputValue(history[newIndex]);
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
