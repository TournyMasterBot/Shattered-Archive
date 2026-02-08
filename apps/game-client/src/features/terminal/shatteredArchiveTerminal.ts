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
    this.Fit();
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

  private attachWindowEvents(): void {
    if (ShatteredArchiveTerminal._windowEventsRegistered) return;

    ListenEvent<WriteTerminalPayload>('shatteredarchive:write-terminal', (payload) => {
      const t = this.term;
      if (!t) return;

      const raw = payload.rawText;
      if (!raw) return;
      /*DEBUG
      console.log("Preparing to check terminal output", {
        payload,
        shouldOmit: shouldOmitLine(payload.rawText)
      });
      */

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
          // DEBUG console.log('[shatteredArchiveTerminal] save scrollTop', prevScrollTop);
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
        // Restore previous scroll position
        scrollable.scrollTop = prevScrollTop;
        //DEBUG : console.log('[shatteredArchiveTerminal] restore scrollTop', prevScrollTop);
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
