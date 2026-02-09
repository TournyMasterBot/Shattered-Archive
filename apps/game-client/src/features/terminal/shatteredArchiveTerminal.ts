// apps/game-client/src/features/terminal/shatteredArchiveTerminal.ts
import type { Terminal as XTerm } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { ListenEvent } from '../event-emitter/event-dispatcher';
import { StripAnsi } from '@shatteredarchive/utils-client';
import { shouldOmitLine } from '../userScripts/triggerOmitStore';

export type WriteTerminalPayload = {
  rawText: string; // required for writes
  fromUserScript?: boolean;
  receivedTimestamp?: string;
};

export class ShatteredArchiveTerminal {
  private static _instance: ShatteredArchiveTerminal | null = null;
  private static _windowEventsRegistered = false;

  public static get Instance(): ShatteredArchiveTerminal {
    if (!ShatteredArchiveTerminal._instance) {
      ShatteredArchiveTerminal._instance = new ShatteredArchiveTerminal();
    }
    return ShatteredArchiveTerminal._instance;
  }

  private term: XTerm | null = null;
  private fit: FitAddon | null = null;
  private autoScroll = true;

  private constructor() {
    this.attachWindowEvents();
  }

  public attach(term: XTerm, fitAddon: FitAddon): void {
    this.term = term;
    this.fit = fitAddon;

    // Source-of-truth font settings for xterm (canvas glyphs).
    // CSS alone does not reliably affect rendered glyph size.
    try {
      // Prefer setOption when available, otherwise fall back to options assignment.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyTerm = term as any;

      const fontFamily =
        `"Cascadia Mono","Cascadia Code","JetBrains Mono",` +
        `ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,` +
        `"Liberation Mono","DejaVu Sans Mono",monospace`;

      if (typeof anyTerm.setOption === 'function') {
        anyTerm.setOption('fontSize', 16);
        anyTerm.setOption('lineHeight', 1.2);
        anyTerm.setOption('fontFamily', fontFamily);
        // Helps when high DPI looks “fuzzy” after refresh in some setups
        anyTerm.setOption('letterSpacing', 0);
      } else if (anyTerm.options) {
        anyTerm.options.fontSize = 16;
        anyTerm.options.lineHeight = 1.2;
        anyTerm.options.fontFamily = fontFamily;
        anyTerm.options.letterSpacing = 0;
      }
    } catch {
      // ignore
    }

    // Fit immediately, then re-fit once fonts are ready.
    this.Fit();
    this.refreshAll();

    this.fitAfterFontsReady();
  }

  public detach(): void {
    this.term = null;
    this.fit = null;
    this.autoScroll = true;
  }

  public setAutoScroll(enabled: boolean): void {
    this.autoScroll = !!enabled;
  }

  public Fit(): void {
    const f = this.fit;
    if (!f) return;

    try {
      f.fit();
    } catch {
      // ignore
    }
  }

  private refreshAll(): void {
    const t = this.term;
    if (!t) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyTerm = t as any;
      if (typeof anyTerm.refresh === 'function' && Number.isFinite(anyTerm.rows) && anyTerm.rows > 0) {
        anyTerm.refresh(0, Math.max(0, anyTerm.rows - 1));
      }
    } catch {
      // ignore
    }
  }

  private fitAfterFontsReady(): void {
    // On hard refresh, xterm may measure before preferred fonts load.
    // Waiting for document.fonts.ready, then fit+refresh, fixes “HMR ok / refresh bad”.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fonts = (document as any).fonts;
      if (!fonts?.ready) return;

      void fonts.ready
        .then(() => {
          this.Fit();
          this.refreshAll();

          // One extra delayed fit helps with late font swaps/layout settle.
          window.setTimeout(() => {
            this.Fit();
            this.refreshAll();
          }, 50);

          window.setTimeout(() => {
            this.Fit();
            this.refreshAll();
          }, 250);
        })
        .catch(() => {
          // ignore
        });
    } catch {
      // ignore
    }
  }

  private attachWindowEvents(): void {
    if (ShatteredArchiveTerminal._windowEventsRegistered) return;

    ListenEvent<WriteTerminalPayload>('shatteredarchive:write-terminal', (payload) => {
      const t = this.term;
      if (!t) return;

      const raw = payload.rawText;
      if (!raw) return;

      if (!payload.fromUserScript && shouldOmitLine('shatteredarchive:raw-data', payload.rawText)) {
        return;
      }

      // Save scroll position if autoScroll is false
      let prevScrollTop: number | null = null;
      let scrollable: HTMLDivElement | null = null;
      if (!this.autoScroll && t.element) {
        scrollable = t.element.querySelector('.xterm-scrollable-element') as HTMLDivElement | null;
        if (scrollable) {
          prevScrollTop = scrollable.scrollTop;
        }
      }

      t.write(raw);

      if (this.autoScroll) {
        try {
          t.scrollToBottom();
        } catch {
          // ignore
        }
      } else if (scrollable && prevScrollTop !== null) {
        scrollable.scrollTop = prevScrollTop;
      }
    });

    ListenEvent<WriteTerminalPayload>('shatteredarchive:write-console', (payload) => {
      const t = this.term;
      if (!t) return;

      const raw = payload.rawText;
      if (!raw) return;

      const cleanText = StripAnsi(raw);

      console.log('shatteredarchive:write-console', {
        cleanText,
      });
    });

    ShatteredArchiveTerminal._windowEventsRegistered = true;
  }
}
