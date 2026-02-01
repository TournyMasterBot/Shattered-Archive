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
    // Scroll tracking (Jump-to-live)
    //
    // The key fix: resolve scroll element asynchronously and retry
    // until xterm has created it, then attach listener.
    // ============================================================
    let attachedScroll: ScrollTarget | null = null;

    const computeAndApplyScrollState = (el: HTMLDivElement) => {
      const threshold = 10;
      const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
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

    const handleScroll = () => {
      if (!attachedScroll?.el) return;
      computeAndApplyScrollState(attachedScroll.el);
    };

    const findScrollTarget = (): ScrollTarget | null => {
      // Primary: xterm viewport (most common)
      const viewport = container.querySelector('.xterm-viewport') as HTMLDivElement | null;
      if (viewport) return { el: viewport, kind: 'viewport' };

      // Fallback: sometimes the scrollable element is the one emitting scroll
      const scrollable = container.querySelector('.xterm-scrollable-element') as HTMLDivElement | null;
      if (scrollable) return { el: scrollable, kind: 'scrollable' };

      return null;
    };

    let findAttempts = 0;
    const maxAttempts = 10;

    const attachScrollListener = () => {
      const target = findScrollTarget();
      if (!target) {
        findAttempts++;
        if (findAttempts <= maxAttempts) {
          // retry next frame; xterm can create these elements async
          requestAnimationFrame(attachScrollListener);
        }
        return;
      }

      attachedScroll = target;

      registerListener(
        'useTerminal::scroll',
        attachedScroll.el,
        'scroll',
        handleScroll as any,
      );

      // Initialize state once we’ve attached
      handleScroll();
    };

    // Kick off async attachment
    requestAnimationFrame(attachScrollListener);

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
      if (attachedScroll?.el) {
        unregisterListener('useTerminal::scroll', attachedScroll.el, 'scroll', handleScroll as any);
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
