/**
 * Reads the answer of a `consider` the character typed (by Copilot or by a person) from the feed and records it in a `MonsterKnowledge`.
 *
 * The game answers a `consider` with one line (`consider.ts`) right after the command. The tracker remembers the last `consider` command and
 * the room, and records the first answer line that follows, for that keyword. It forgets the command when another command is typed, when
 * the room changes, or when too long has passed (a `consider` that was never answered).
 *
 * Pure: events in, records out.
 */

import { stripAnsi } from '../color/ansi.js';
import type { FeedEvent } from '../log/reducer.js';
import { parseConsiderLine } from './consider.js';
import { keywordOf, type MonsterKnowledge } from './knowledge.js';

/** An unanswered `consider` is dropped after this long. */
export const CONSIDER_ANSWER_MS = 10_000;

// "con" is how players type it; the game takes it as `consider` (first match in its command table), and so does every longer prefix.
const CONSIDER_COMMAND = /^con(?:s(?:i(?:d(?:e(?:r)?)?)?)?)?\s+(\S+)/i;

export class ConsiderTracker {
  private room: string | undefined;
  private pending: { keyword: string; at: number } | undefined;

  constructor(private readonly knowledge: MonsterKnowledge) {}

  /** The room the character is in, as the last room event named it. */
  currentRoom(): string | undefined {
    return this.room;
  }

  feed(event: FeedEvent): void {
    switch (event.type) {
      case 'room':
        this.room = event.room;
        this.pending = undefined;
        break;
      case 'session':
        this.pending = undefined;
        if (event.state === 'closed') this.room = undefined;
        break;
      case 'command': {
        const match = CONSIDER_COMMAND.exec(event.command.trim());
        const keyword = match ? keywordOf(match[1]) : '';
        this.pending = keyword === '' ? undefined : { keyword, at: event.at };
        break;
      }
      case 'lines':
        if (this.pending === undefined) break;
        for (const raw of event.lines) {
          const result = parseConsiderLine(stripAnsi(raw));
          if (result === undefined) continue;
          if (this.room !== undefined && event.at - this.pending.at <= CONSIDER_ANSWER_MS) this.knowledge.recordConsider(this.room, this.pending.keyword, result, event.at);
          this.pending = undefined;
          break;
        }
        break;
      default:
        break;
    }
  }
}
