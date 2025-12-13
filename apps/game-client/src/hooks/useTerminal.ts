// apps/game-client/src/hooks/useTerminal.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

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
    if (container) {
      term.open(container);

      // Force an initial render so internal dimensions are set
      term.write('\x1b[0m');

      // Defer fit until after layout/render to avoid dimensions errors
      requestAnimationFrame(() => {
        try {
          fitAddon.fit();
          term.scrollToBottom();
        } catch {
          // swallow any early fit issues
        }
      });
    }

    // Grab xterm's own viewport element for scroll tracking
    const viewport = container?.querySelector('.xterm-viewport') as HTMLDivElement | null;

    const handleScroll = () => {
      if (!viewport) return;

      const threshold = 10;
      const distance = viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight);
      const atBottom = distance <= threshold;

      if (atBottom) {
        autoScrollRef.current = true;
        setShowJump(false);
      } else {
        autoScrollRef.current = false;
        setShowJump(true);
      }
    };

    viewport?.addEventListener('scroll', handleScroll);

    // Event bus: write text into terminal
    const handleTerminalData = (ev: Event) => {
      const e = ev as CustomEvent<{ text: string }>;
      const text = e.detail?.text ?? '';
      if (!text || !termRef.current) return;

      termRef.current.write(text);

      // Let xterm manage scroll sync instead of touching scrollTop directly
      if (autoScrollRef.current) {
        try {
          termRef.current.scrollToBottom();
        } catch {
          // ignore; terminal might be mid-resize/refresh
        }
      }
    };

    window.addEventListener('game:terminal-data', handleTerminalData as EventListener);

    // Re-fit on window resize
    const handleResize = () => {
      if (!fitRef.current) return;
      // Defer to next frame so container layout is stable
      requestAnimationFrame(() => {
        try {
          fitRef.current?.fit();
          termRef.current?.scrollToBottom();
        } catch {
          // ignore if xterm is mid-internal update
        }
      });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      viewport?.removeEventListener('scroll', handleScroll);
      window.removeEventListener('game:terminal-data', handleTerminalData as EventListener);
      window.removeEventListener('resize', handleResize);

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
