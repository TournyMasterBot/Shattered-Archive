// apps/game-client/src/hooks/useTerminal.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

import { ShatteredArchiveTerminal } from '../features/terminal/shatteredArchiveTerminal';
import { registerListener, unregisterListener } from '../features/event-emitter/event-dispatcher';

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

    // IMPORTANT:
    // - DO NOT preventDefault pointerdown/touchstart on container
    // - DO NOT blur focus inside terminal (breaks selection)
    // - Instead: neuter the helper textarea inputmode
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
    const helperTick = window.setTimeout(() => {
      applyNoKeyboardToXtermTextarea();
    }, 0);

    // ============================================================
    // Layout / scrolling / data handling
    // ============================================================

    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        term.scrollToBottom();
      } catch {
        // ignore
      }
    });

    const viewport = container.querySelector('.xterm-viewport') as HTMLDivElement | null;

    const handleScroll = () => {
      if (!viewport) return;

      const threshold = 10;
      const distance = viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight);
      const atBottom = distance <= threshold;

      if (atBottom) {
        autoScrollRef.current = true;
        setShowJump(false);

        try {
          ShatteredArchiveTerminal.Instance.setAutoScroll(true);
        } catch {
          // ignore
        }
      } else {
        autoScrollRef.current = false;
        setShowJump(true);

        try {
          ShatteredArchiveTerminal.Instance.setAutoScroll(false);
        } catch {
          // ignore
        }
      }
    };

    if (viewport) {
      registerListener('useTerminal::viewport::scroll', viewport, 'scroll', handleScroll as any);
    }

    // Attach terminal runtime singleton
    ShatteredArchiveTerminal.Instance.attach(term, fitAddon);

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
      if (viewport) {
        unregisterListener('useTerminal::viewport::scroll', viewport, 'scroll', handleScroll as any);
      }

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
