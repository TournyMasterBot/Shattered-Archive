import { ListenEvent } from '../event-emitter/event-dispatcher';

// A unique key: the shared dispatcher keeps ONE listener per key, and the default key for this event would replace the app's own (A1, E26).
export const KEY_REPLY = 'simulacrumAdmin::reply';

export const DEFAULT_QUIET_MS = 600;
export const DEFAULT_MAX_MS = 4000;

export interface Reply {
  /** The reply as text to read: terminal escapes and colour codes removed, one entry per line. */
  lines: string[];
  /** Exactly what arrived, joined, for "copy raw". */
  rawText: string;
  /** `quiet` after the quiet period, `timeout` at the cap (nothing, or still talking), `cancelled` when the connection ended. */
  endedBy: 'quiet' | 'timeout' | 'cancelled';
}

const CSI = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const OSC = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
const OTHER_ESC = /\u001b[@-Z\\-_]/g;
const STRAY_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const COLOUR_CODE = /\{(?:\{|[A-Za-z])/g;

/** Text the owner reads: escapes and `{x` colour codes gone, `{{` back to `{`. The raw text is kept separately (E22). */
export function toDisplayText(raw: string): string {
  return raw
    .replace(OSC, '')
    .replace(CSI, '')
    .replace(OTHER_ESC, '')
    .replace(COLOUR_CODE, (m) => (m === '{{' ? '{' : ''))
    .replace(STRAY_CONTROL, '');
}

/** Splits on the game's `\n\r` and on plain `\n`/`\r`, trims trailing blanks, drops blank lines at both ends. */
export function toLines(displayText: string): string[] {
  const lines = displayText.split(/\r\n|\n\r|\n|\r/).map((l) => l.replace(/\s+$/, ''));
  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export interface ReplyCollectorOptions {
  quietMs?: number;
  maxMs?: number;
}

export interface ReplyCollector {
  /** Starts listening now (call before sending, so the first chunk is not missed). Resolves when the reply is complete (E6). */
  begin(): Promise<Reply>;
  /** Ends a running collection early (the connection closed). */
  cancel(): void;
  dispose(): void;
}

/**
 * Collects the text the game sends right after a command. Chunks are joined BEFORE escapes are removed, so a sequence split across two
 * network reads is removed whole (E22). The wait ends 600 ms after the last chunk, or 4 s after the start when nothing arrives, so a
 * tell that comes later is not attributed to the command (E6). One collection at a time: the sender serialises sends (E24).
 */
export function createReplyCollector(options: ReplyCollectorOptions = {}): ReplyCollector {
  const quietMs = options.quietMs ?? DEFAULT_QUIET_MS;
  const maxMs = options.maxMs ?? DEFAULT_MAX_MS;
  let chunks: string[] | undefined;
  let finish: ((endedBy: Reply['endedBy']) => void) | undefined;
  let quietTimer: ReturnType<typeof setTimeout> | undefined;

  const stop = ListenEvent<{ payload?: unknown }>(
    'game:remote-server:raw',
    (event) => {
      if (!chunks || typeof event?.payload !== 'string') return;
      chunks.push(event.payload);
      clearTimeout(quietTimer);
      quietTimer = setTimeout(() => finish?.('quiet'), quietMs);
    },
    { key: KEY_REPLY },
  );

  return {
    begin() {
      if (chunks) return Promise.reject(new Error('A reply is already being collected.'));
      const collected: string[] = [];
      chunks = collected;
      return new Promise<Reply>((resolve) => {
        const maxTimer = setTimeout(() => finish?.('timeout'), maxMs);
        finish = (endedBy) => {
          clearTimeout(maxTimer);
          clearTimeout(quietTimer);
          chunks = undefined;
          finish = undefined;
          const rawText = collected.join('');
          resolve({ lines: toLines(toDisplayText(rawText)), rawText, endedBy });
        };
      });
    },
    cancel() {
      finish?.('cancelled');
    },
    dispose() {
      finish?.('cancelled');
      stop();
    },
  };
}
