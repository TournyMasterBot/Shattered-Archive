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
    const t = this.term;
    if (!f || !t) return;

    try {
      f.fit();

      // xterm renders its own overlay scrollbar widget (.scrollbar.vertical) inside
      // .xterm-scrollable-element. FitAddon measures the full clientWidth of that element,
      // which includes the area the scrollbar covers — so the rightmost columns end up
      // hidden behind it. We correct by shrinking cols by the scrollbar's column width.
      const core = (t as any)._core;
      const el = t.element;
      const scrollbarEl: HTMLElement | null = el
        ? (el.querySelector('.xterm-scrollable-element > .scrollbar.vertical') ??
           el.querySelector('.scrollbar.vertical'))
        : null;
      const scrollbarW = scrollbarEl ? (scrollbarEl.offsetWidth || 0) : 0;

      if (scrollbarW > 0 && core) {
        const cellW: number =
          core._renderService?.dimensions?.css?.cell?.width ??
          core._renderService?.dimensions?.actualCellWidth ??
          0;
        if (cellW > 0) {
          const colsToRemove = Math.ceil(scrollbarW / cellW);
          const correctedCols = Math.max(2, t.cols - colsToRemove);
          if (correctedCols !== t.cols) {
            t.resize(correctedCols, t.rows);
          }
        }
      }
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