// apps/game-client/src/hooks/useTerminal.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

import { ShatteredArchiveTerminal } from '../features/terminal/shatteredArchiveTerminal';
import { registerListener, unregisterListener } from '../features/event-emitter/event-dispatcher';

type ScrollTarget = {
  el: HTMLDivElement;
  kind: 'viewport' | 'scrollable';
};

export function useTerminal() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  const [showJump, setShowJump] = useState(false);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    const isSmall = typeof window !== 'undefined' && window.innerWidth <= 768;

    const term = new XTerm({
      convertEol: true,
      disableStdin: true,
      fontFamily: 'monospace',
      fontSize: isSmall ? 12 : 14,
      cursorBlink: false,
      cursorInactiveStyle: 'none',
      scrollback: 5000,
      theme: {
        background: '#000000',
        foreground: '#e0e0e0',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    termRef.current = term;
    fitRef.current = fitAddon;

    const container = containerRef.current;
    if (!container) {
      term.dispose();
      return;
    }

    term.open(container);

    // ============================================================
    // ✅ ALLOW SELECTION, BUT PREVENT MOBILE KEYBOARD
    // ============================================================
    const applyNoKeyboardToXtermTextarea = () => {
      const helper = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null;
      if (!helper) return;

      helper.tabIndex = -1;
      helper.setAttribute('tabindex', '-1');
      helper.setAttribute('readonly', 'true');

      helper.setAttribute('inputmode', 'none');
      helper.setAttribute('autocomplete', 'off');
      helper.setAttribute('autocorrect', 'off');
      helper.setAttribute('autocapitalize', 'off');
      helper.setAttribute('spellcheck', 'false');
    };

    applyNoKeyboardToXtermTextarea();
    const helperTick = window.setTimeout(() => applyNoKeyboardToXtermTextarea(), 0);

    // ============================================================
    // Layout / attach terminal singleton
    // ============================================================
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        term.scrollToBottom();
      } catch {
        // ignore
      }
    });

    // Attach terminal runtime singleton (handles write events + autoscroll)
    ShatteredArchiveTerminal.Instance.attach(term, fitAddon);

    // ============================================================
    // Scroll tracking (Jump-to-live) using xterm.js API
    // ============================================================
    const updateScrollState = () => {
      const t = termRef.current;
      if (!t) return;
      // xterm.js: buffer.active.viewportY is the top line in the viewport
      // buffer.active.baseY is the bottom-most line in the buffer
      // buffer.active.length is total lines in buffer
      // t.rows is number of visible rows
      const buffer = t.buffer.active;
      const viewportY = buffer.viewportY;
      const baseY = buffer.baseY;
      const rows = t.rows;
      // If the bottom of the viewport is at the baseY, we're at the bottom
      const atBottom = viewportY + rows >= baseY + rows;
      // DEBUG console.log('[useTerminal] updateScrollState', { viewportY, baseY, rows, atBottom });
      if (atBottom) {
        autoScrollRef.current = true;
        setShowJump(false);
        // DEBUG console.log('[useTerminal] at bottom, autoScroll true, showJump false');
        try {
          ShatteredArchiveTerminal.Instance.setAutoScroll(true);
        } catch {
          // ignore
        }
      } else {
        autoScrollRef.current = false;
        setShowJump(true);
        // DEBUG console.log('[useTerminal] not at bottom, autoScroll false, showJump true');
        try {
          ShatteredArchiveTerminal.Instance.setAutoScroll(false);
        } catch {
          // ignore
        }
      }
    };

    // Use xterm.js API to listen for scroll events
    term.onScroll(() => {
      updateScrollState();
    });

    // Initialize scroll state
    updateScrollState();

    // ============================================================
    // Resize -> fit terminal
    // ============================================================
    const handleResize = () => {
      requestAnimationFrame(() => {
        try {
          fitRef.current?.fit();
        } catch {
          // ignore
        }
      });
    };

    registerListener('useTerminal::window::resize', window, 'resize', handleResize as any);

    // ============================================================
    // Cleanup
    // ============================================================
    return () => {
      unregisterListener('useTerminal::window::resize', window, 'resize', handleResize as any);

      window.clearTimeout(helperTick);

      try {
        ShatteredArchiveTerminal.Instance.detach();
      } catch {
        // ignore
      }

      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  const handleJumpToLive = useCallback(() => {
    const term = termRef.current;
    if (!term) return;

    try {
      term.scrollToBottom();
      autoScrollRef.current = true;
      setShowJump(false);

      try {
        ShatteredArchiveTerminal.Instance.setAutoScroll(true);
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }
  }, []);

  return {
    containerRef,
    showJump,
    handleJumpToLive,
  };
}
