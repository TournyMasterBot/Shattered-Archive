// apps/game-client/src/features/terminal/shatteredArchiveTerminal.ts
import type { Terminal as XTerm } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { ListenEvent } from '../event-emitter/event-dispatcher';
import { StripAnsi } from '@shatteredarchive/utils-client';

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
  }

  public detach(): void {
    this.term = null;
    this.fit = null;
    this.autoScroll = true;
  }

  public setAutoScroll(enabled: boolean): void {
    this.autoScroll = !!enabled;
  }

  private attachWindowEvents(): void {
    if (ShatteredArchiveTerminal._windowEventsRegistered) return;

    ListenEvent<WriteTerminalPayload>('shatteredarchive:write-terminal', (payload) => {
      const t = this.term;
      if (!t) return;

      const raw = payload.rawText;
      if (!raw) return;

      t.write(raw);

      if (this.autoScroll) {
        // scroll can still occasionally be touchy, so keep it guarded
        try {
          t.scrollToBottom();
        } catch {
          // ignore
        }
      }
    });

    ListenEvent<WriteTerminalPayload>('shatteredarchive:write-console', (payload) => {
      const t = this.term;
      if (!t) return;

      const raw = payload.rawText;
      if (!raw) {
        return;
      }

      const cleanText = StripAnsi(raw);

      console.log('shatteredarchive:write-console', {
        cleanText,
      });
    });

    ShatteredArchiveTerminal._windowEventsRegistered = true;
  }
}
