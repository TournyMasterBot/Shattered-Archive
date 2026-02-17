import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

import { ShatteredArchiveTerminal } from '../features/terminal/shatteredArchiveTerminal';
import { registerListener, unregisterListener } from '../features/event-emitter/event-dispatcher';

type ScrollTarget = {
  el: HTMLDivElement;
  kind: 'viewport' | 'scrollable';
};

// ---- CSS sync helpers ----------------------------------------------------

function parseCssPx(v: string | null | undefined): number | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (s.endsWith('px')) {
    const n = parseFloat(s.slice(0, -2));
    return Number.isFinite(n) ? n : null;
  }
  // allow "16" as px-ish
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function parseCssNumber(v: string | null | undefined): number | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Reads CSS in a “user override friendly” way:
 * - Prefer CSS variables if present:
 *    --sa-terminal-font-size: 14px
 *    --sa-terminal-line-height: 1.2   (ratio)
 *    --sa-terminal-letter-spacing: 0px
 *    --sa-terminal-scale: 1
 * - Otherwise fall back to computed style on the .xterm element.
 */
function readTerminalCssMetrics(host: HTMLElement) {
  const xtermEl = (host.querySelector('.xterm') as HTMLElement | null) ?? host;

  const hostStyle = window.getComputedStyle(host);
  const cs = window.getComputedStyle(xtermEl);

  const varFontSize = parseCssPx(hostStyle.getPropertyValue('--sa-terminal-font-size'));
  const varLineHeight = parseCssNumber(hostStyle.getPropertyValue('--sa-terminal-line-height'));
  const varLetterSpacing = parseCssPx(hostStyle.getPropertyValue('--sa-terminal-letter-spacing'));
  const varScale = parseCssNumber(hostStyle.getPropertyValue('--sa-terminal-scale')) ?? 1;

  // computed fallbacks
  const computedFontSizePx = parseCssPx(cs.fontSize) ?? 14;
  const computedLetterSpacingPx = parseCssPx(cs.letterSpacing) ?? 0;

  // line-height: if "normal", approximate as 1.2 (browser default-ish)
  // If px, convert to ratio.
  let computedLineHeightRatio: number | null = null;
  const lh = String(cs.lineHeight ?? '').trim();
  if (lh && lh !== 'normal') {
    if (lh.endsWith('px')) {
      const lhPx = parseCssPx(lh);
      if (lhPx && computedFontSizePx > 0) computedLineHeightRatio = lhPx / computedFontSizePx;
    } else {
      const lhNum = parseCssNumber(lh);
      if (lhNum && lhNum > 0) computedLineHeightRatio = lhNum;
    }
  } else {
    computedLineHeightRatio = 1.2;
  }

  const fontSizePx = (varFontSize ?? computedFontSizePx) * clamp(varScale, 0.5, 3);
  const lineHeightRatio = clamp(varLineHeight ?? computedLineHeightRatio ?? 1.2, 0.8, 2.0);
  const letterSpacingPx = clamp(varLetterSpacing ?? computedLetterSpacingPx, -2, 6);

  return {
    fontSizePx,
    lineHeightRatio,
    letterSpacingPx,
    scale: clamp(varScale, 0.5, 3),
  };
}

// Signature to detect changes without being too noisy
function metricsSignature(m: { fontSizePx: number; lineHeightRatio: number; letterSpacingPx: number }) {
  // round a bit to avoid tiny float churn
  const fs = Math.round(m.fontSizePx * 100) / 100;
  const lh = Math.round(m.lineHeightRatio * 1000) / 1000;
  const ls = Math.round(m.letterSpacingPx * 100) / 100;
  return `${fs}|${lh}|${ls}`;
}

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

      // baseline defaults; CSS may override via sync below
      fontFamily: 'monospace',
      fontSize: isSmall ? 12 : 14,
      lineHeight: 1.2,
      letterSpacing: 0,

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
    // Allow selection, but prevent mobile keyboard (your existing behavior)
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
    // Attach terminal singleton (handles write events + autoscroll)
    // ============================================================
    ShatteredArchiveTerminal.Instance.attach(term, fitAddon);

    // ============================================================
    // CSS-driven metrics sync (fontSize / lineHeight / letterSpacing / scale)
    // ============================================================
    let lastSig = '';
    let rafSync = 0;

    const syncFromCss = () => {
      rafSync = 0;
      const host = containerRef.current;
      const t = termRef.current;
      const fit = fitRef.current;
      if (!host || !t || !fit) return;

      const m = readTerminalCssMetrics(host);
      const sig = metricsSignature(m);

      if (sig === lastSig) return;
      lastSig = sig;

      // Apply to xterm options
      // - fontSize expects px as number
      // - lineHeight is ratio
      // - letterSpacing is px as number
      t.options.fontSize = Math.round(m.fontSizePx * 100) / 100;
      t.options.lineHeight = m.lineHeightRatio;
      t.options.letterSpacing = Math.round(m.letterSpacingPx * 100) / 100;

      // Fit + refresh AFTER options change.
      // Guard: do it on the next frame to avoid RenderService.dimensions undefined.
      window.requestAnimationFrame(() => {
        try {
          fit.fit();
        } catch {
          // ignore
        }
        try {
          // refresh visible viewport; this is cheap and fixes “ASCII art looks off”
          t.refresh(0, t.rows - 1);
        } catch {
          // ignore
        }
      });
    };

    const scheduleCssSync = () => {
      if (rafSync) return;
      rafSync = window.requestAnimationFrame(syncFromCss);
    };

    // Initial sync after mount/attach
    scheduleCssSync();
    window.setTimeout(scheduleCssSync, 50);
    window.setTimeout(scheduleCssSync, 250);

    // Watch for layout & style changes:
    // - ResizeObserver catches size changes
    // - MutationObserver catches class/style changes that might affect CSS variables
    const ro = new ResizeObserver(() => scheduleCssSync());
    ro.observe(container);
    if (container.parentElement) ro.observe(container.parentElement);

    const mo = new MutationObserver(() => scheduleCssSync());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    mo.observe(container, { attributes: true, attributeFilter: ['style', 'class'] });

    // Also resync on font loading and zoom-like changes
    const onWindowResize = () => scheduleCssSync();
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('orientationchange', onWindowResize);

    // ============================================================
    // Scroll tracking (Jump-to-live) using xterm.js API
    // ============================================================
    const updateScrollState = () => {
      const t = termRef.current;
      if (!t) return;

      const buffer = t.buffer.active;
      const viewportY = buffer.viewportY;
      const baseY = buffer.baseY;

      // at bottom when viewport top is at baseY (xterm semantics)
      const atBottom = viewportY >= baseY;

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

    term.onScroll(() => updateScrollState());
    updateScrollState();

    // ============================================================
    // Cleanup
    // ============================================================
    return () => {
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('orientationchange', onWindowResize);

      try {
        ro.disconnect();
      } catch {}
      try {
        mo.disconnect();
      } catch {}

      if (rafSync) window.cancelAnimationFrame(rafSync);
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
