// apps/game-client/src/hooks/useTerminal.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

import { ShatteredArchiveTerminal } from '../features/terminal/shatteredArchiveTerminal';

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
      disableStdin: true, // external input box handles typing
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

    // 1) xterm root itself is focusable (tabindex=0)
    const xtermRoot = container.querySelector('.xterm') as HTMLElement | null;
    if (xtermRoot) {
      xtermRoot.tabIndex = -1;
      xtermRoot.setAttribute('tabindex', '-1');
      xtermRoot.addEventListener('focus', blurActive, true);
      xtermRoot.addEventListener('focusin', blurActive, true);
    }

    // 2) Kill the helper textarea (main Android keyboard trigger)
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

      helper.addEventListener('focus', blurActive, true);
      helper.addEventListener('focusin', blurActive, true);
    }

    // 3) Block focus at the container level (tap / click)
    const preventPointerFocus = (e: Event) => {
      e.preventDefault();
    };

    container.addEventListener('pointerdown', preventPointerFocus, {
      capture: true,
      passive: false,
    });
    container.addEventListener('touchstart', preventPointerFocus, {
      capture: true,
      passive: false,
    });

    // 4) Global safety net: if ANYTHING inside terminal focuses, blur it
    const onFocusInCapture = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Allow your real command input to keep focus
      if (target.id === 'game-command-input') return;

      if (container.contains(target)) {
        blurActive();
      }
    };

    document.addEventListener('focusin', onFocusInCapture, true);

    // Ensure starting state is unfocused
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

        // optional: tell singleton we are live
        try {
          ShatteredArchiveTerminal.Instance.setAutoScroll(true);
        } catch {
          // ignore
        }
      } else {
        autoScrollRef.current = false;
        setShowJump(true);

        // optional: tell singleton to stop auto-scroll
        try {
          ShatteredArchiveTerminal.Instance.setAutoScroll(false);
        } catch {
          // ignore
        }
      }
    };

    viewport?.addEventListener('scroll', handleScroll);

    // ============================================================
    // ✅ Attach terminal runtime singleton (writes happen there now)
    // ============================================================
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

    window.addEventListener('resize', handleResize);

    // ============================================================
    // Cleanup
    // ============================================================

    return () => {
      viewport?.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('focusin', onFocusInCapture, true);

      container.removeEventListener('pointerdown', preventPointerFocus, { capture: true } as any);
      container.removeEventListener('touchstart', preventPointerFocus, { capture: true } as any);

      xtermRoot?.removeEventListener('focus', blurActive, true);
      xtermRoot?.removeEventListener('focusin', blurActive, true);
      helper?.removeEventListener('focus', blurActive, true);
      helper?.removeEventListener('focusin', blurActive, true);

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

      // optional: tell singleton
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
