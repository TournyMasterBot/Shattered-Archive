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
    // 🔒 ANDROID / MOBILE HARD STOP: NO FOCUS, NO KEYBOARD
    // ============================================================

    const blurActive = () => {
      try {
        (document.activeElement as HTMLElement | null)?.blur?.();
      } catch {
        // ignore
      }
    };

    const xtermRoot = container.querySelector('.xterm') as HTMLElement | null;
    if (xtermRoot) {
      xtermRoot.tabIndex = -1;
      xtermRoot.setAttribute('tabindex', '-1');

      registerListener('useTerminal::xtermRoot::focus', xtermRoot, 'focus', blurActive as any, true);

      registerListener('useTerminal::xtermRoot::focusin', xtermRoot, 'focusin', blurActive as any, true);
    }

    const helper = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null;
    if (helper) {
      helper.tabIndex = -1;
      helper.setAttribute('tabindex', '-1');
      helper.setAttribute('readonly', 'true');
      helper.setAttribute('inputmode', 'none');
      helper.setAttribute('autocomplete', 'off');
      helper.setAttribute('autocorrect', 'off');
      helper.setAttribute('autocapitalize', 'off');
      helper.setAttribute('spellcheck', 'false');

      helper.style.pointerEvents = 'none';
      helper.style.opacity = '0';
      helper.style.position = 'fixed';
      helper.style.left = '-10000px';
      helper.style.top = '0';
      helper.style.width = '1px';
      helper.style.height = '1px';

      registerListener('useTerminal::helper::focus', helper, 'focus', blurActive as any, true);

      registerListener('useTerminal::helper::focusin', helper, 'focusin', blurActive as any, true);
    }

    const preventPointerFocus = (e: Event) => {
      e.preventDefault();
    };

    registerListener('useTerminal::container::pointerdown', container, 'pointerdown', preventPointerFocus as any, {
      capture: true,
      passive: false,
    });

    registerListener('useTerminal::container::touchstart', container, 'touchstart', preventPointerFocus as any, {
      capture: true,
      passive: false,
    });

    const onFocusInCapture = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Allow your real command input to keep focus
      if (target.id === 'game-command-input') return;

      if (container.contains(target)) {
        blurActive();
      }
    };

    registerListener('useTerminal::document::focusinCapture', document, 'focusin', onFocusInCapture as any, true);

    blurActive();
    try {
      term.blur();
    } catch {
      // ignore
    }

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
          termRef.current?.scrollToBottom();
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
      // viewport scroll
      if (viewport) {
        unregisterListener('useTerminal::viewport::scroll', viewport, 'scroll', handleScroll as any);
      }

      // resize
      unregisterListener('useTerminal::window::resize', window, 'resize', handleResize as any);

      // document focusin capture
      unregisterListener('useTerminal::document::focusinCapture', document, 'focusin', onFocusInCapture as any, true);

      // container pointer/touch capture
      unregisterListener('useTerminal::container::pointerdown', container, 'pointerdown', preventPointerFocus as any, {
        capture: true,
        passive: false,
      });

      unregisterListener('useTerminal::container::touchstart', container, 'touchstart', preventPointerFocus as any, {
        capture: true,
        passive: false,
      });

      // xtermRoot focus blockers
      if (xtermRoot) {
        unregisterListener('useTerminal::xtermRoot::focus', xtermRoot, 'focus', blurActive as any, true);

        unregisterListener('useTerminal::xtermRoot::focusin', xtermRoot, 'focusin', blurActive as any, true);
      }

      // helper textarea focus blockers
      if (helper) {
        unregisterListener('useTerminal::helper::focus', helper, 'focus', blurActive as any, true);

        unregisterListener('useTerminal::helper::focusin', helper, 'focusin', blurActive as any, true);
      }

      // Detach singleton references
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
