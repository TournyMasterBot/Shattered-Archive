// apps/game-client/src/features/movement/movementTracker.ts
//
// Single shared movement tracker — the one place that decides whether a sent movement
// command succeeded or failed, for every source (compass clicks, autoleveling, typed
// commands, plugins/scripts). Replaces the two independently-broken trackers this
// codebase used to carry (useCompassBlock.ts, autoleveling-engine.ts).
//
// Design is corpus-validated against real DSL MUD play (35,362 real moves across 229
// game-server log files) — see .ai-plans/20260813-1325-movement-tracking-fix.md for the
// full research. The two load-bearing findings that shape this file:
//   - A room diff must include `exits`, not just `room`/`sector` — 13.4% of real moves land
//     in a same-name/same-sector room with a different exit set.
//   - The per-entry timeout MUST be head-of-queue-relative (reset whenever an entry
//     becomes the front of the queue), not absolute-from-send-time — an absolute timeout
//     misclassifies 44.7% of real movement as failed under a realistic burst depth,
//     because the server paces real movement at ~500ms+/hop regardless of how fast the
//     client enqueues. Head-of-queue-relative timing drops that to 5.4%.
//
// NOT yet wired into the live app (see Step 3/4 of the plan above) — binding this now
// would double-dispatch `movement-attempt` alongside the two old senders' own dispatches
// until they're migrated onto this module instead.

import { DispatchEvent, ListenEvent } from '../event-emitter/event-dispatcher';
import { classifyMovement } from './classifyMovement';

export type RoomSnapshot = { room?: string; sector?: string; exits?: string[] };

type PendingEntry = {
  cmd: string;
  dir?: string;
  sentAt: number;
};

/** Head-of-queue-relative timeout — corpus-validated, see file header. */
const HEAD_TIMEOUT_MS = 1200;
const TIMEOUT_POLL_MS = 100;

const ANSI_CSI_RE = /\[[0-9;]*m/g;
function stripAnsi(input: string): string {
  return String(input ?? '').replace(ANSI_CSI_RE, '');
}

/**
 * Corpus-confirmed fixed failure substrings (see plan Context — each independently
 * grepped and quote-verified against real DSL MUD server.log-*.jsonl files). Checked as
 * a line-start match after ANSI/CR stripping and trimming, not a bare substring search.
 */
const FIXED_FAILURE_LINES = [
  'Alas, you cannot go that way.',
  'You are too exhausted.',
  "You aren't allowed in there.",
  "You can't fly.",
  'You need a boat to go there.',
  'What?  And leave your beloved master?',
];

/**
 * Templated door-closed message ("The <keyword> is closed.", keyword genuinely varies:
 * door/gate/bridgegate/secret/boulder/travelers all corpus-confirmed). Line-anchored
 * (`^The `) so it never matches the same substring inside ordinary chat — "Cedarmold
 * says 'The stairway is closed....'" was a real false-positive under a naive search.
 */
const DOOR_CLOSED_RE = /^The .+ is closed\.$/;

function matchFailureLine(raw: string): string | null {
  const line = stripAnsi(raw).replace(/\r/g, '').trim();
  if (!line) return null;
  for (const f of FIXED_FAILURE_LINES) {
    if (line.startsWith(f)) return f;
  }
  if (DOOR_CLOSED_RE.test(line)) return line;
  return null;
}

/** `{room, sector, exits}` equality — exits compared as an ordered list (server-supplied order is stable). */
function sameRoom(a: RoomSnapshot | null, b: RoomSnapshot): boolean {
  if (!a) return false;
  const exitsA = Array.isArray(a.exits) ? a.exits.join(',') : '';
  const exitsB = Array.isArray(b.exits) ? b.exits.join(',') : '';
  return a.room === b.room && a.sector === b.sector && exitsA === exitsB;
}

class MovementTracker {
  private queue: PendingEntry[] = [];
  private lastRoom: RoomSnapshot | null = null;
  /** When the current queue[0] became the head — null when the queue is empty. */
  private headSince: number | null = null;
  private timeoutTimer: ReturnType<typeof setInterval> | null = null;
  private bound = false;

  /** Idempotent; returns an unbind function. Safe to call multiple times (no-op after the first). */
  bind(): () => void {
    if (this.bound) return () => {};
    this.bound = true;

    const offSent = ListenEvent<{ text?: string }>(
      'shatteredarchive:command-sent',
      (payload) => this.onCommandSent(String(payload?.text ?? '')),
      { key: 'movementTracker::command-sent' },
    );
    const offRoom = ListenEvent<RoomSnapshot>(
      'game:room-data',
      (payload) => this.onRoomData(payload ?? {}),
      { key: 'movementTracker::game-room-data' },
    );
    const offRaw = ListenEvent<{ text?: string }>(
      'shatteredarchive:raw-data',
      (payload) => this.onRawLine(String(payload?.text ?? '')),
      { key: 'movementTracker::raw-data' },
    );

    this.timeoutTimer = setInterval(() => this.checkTimeout(), TIMEOUT_POLL_MS);

    return () => {
      offSent();
      offRoom();
      offRaw();
      if (this.timeoutTimer) {
        clearInterval(this.timeoutTimer);
        this.timeoutTimer = null;
      }
      this.queue = [];
      this.headSince = null;
      this.bound = false;
    };
  }

  /** Test/debug seam — current queue depth. */
  pendingCount(): number {
    return this.queue.length;
  }

  private armHeadIfNeeded(): void {
    if (this.queue.length === 0) {
      this.headSince = null;
      return;
    }
    if (this.headSince === null) this.headSince = Date.now();
  }

  private onCommandSent(text: string): void {
    const trimmed = text.trim();
    const mv = classifyMovement(trimmed);
    if (!mv.isMove) return;

    this.queue.push({ cmd: trimmed, dir: mv.dir, sentAt: Date.now() });
    this.armHeadIfNeeded();
    DispatchEvent('shatteredarchive:movement-attempt', { cmd: trimmed, dir: mv.dir });
  }

  private resolveHead(outcome: 'succeeded' | 'failed', extra: { room?: RoomSnapshot; reasonLine?: string }): void {
    const entry = this.queue.shift();
    if (!entry) return;
    this.headSince = null;
    this.armHeadIfNeeded(); // re-arm for whatever is now at the front, if anything

    if (outcome === 'succeeded') {
      DispatchEvent('shatteredarchive:movement-succeeded', {
        cmd: entry.cmd,
        dir: entry.dir,
        ts: entry.sentAt,
        room: extra.room,
      });
    } else {
      DispatchEvent('shatteredarchive:movement-failed', {
        cmd: entry.cmd,
        dir: entry.dir,
        ts: entry.sentAt,
        reasonLine: extra.reasonLine,
      });
    }
  }

  private onRoomData(payload: RoomSnapshot): void {
    // The "darkness" sentinel resolves nothing, either way, and must not become the new
    // last-known room — once sight returns, the next real room_data still diffs against
    // whatever the room was before blindness.
    if (payload.room === 'darkness') return;

    const prev = this.lastRoom;
    const changed = !sameRoom(prev, payload);

    if (this.queue.length > 0) {
      if (changed) {
        this.resolveHead('succeeded', { room: payload });
      } else {
        // An EXACT repeat of {room,sector,exits} while an entry is pending. Two real,
        // corpus-confirmed causes: a genuinely indistinguishable adjacent room (e.g. two
        // "Thieves Row" segments sharing name/sector/exits) or a same-tick server-side
        // drop. Either way, leave it queued and the entry blocks for a full 1200ms for
        // nothing — resolve it immediately instead. Maps onto `succeeded`: the move
        // usually did happen (a real failure would have printed failure text, caught by
        // onRawLine below), and CRITICAL #3's dominant finding was that promptly clearing
        // the head of the queue matters far more than which exact label this case gets.
        this.resolveHead('succeeded', { room: payload });
      }
    }

    this.lastRoom = payload;
  }

  private onRawLine(text: string): void {
    if (this.queue.length === 0) return;
    const reasonLine = matchFailureLine(text);
    if (!reasonLine) return;
    this.resolveHead('failed', { reasonLine });
  }

  private checkTimeout(): void {
    if (this.queue.length === 0 || this.headSince === null) return;
    if (Date.now() - this.headSince >= HEAD_TIMEOUT_MS) {
      // No success/failure signal arrived while this entry was at the front of the
      // queue for the full window — treat as a failure so the caller doesn't hang
      // forever; `reasonLine` flags it as a timeout rather than an explicit server
      // failure text, for a consumer that wants to tell the two apart.
      this.resolveHead('failed', { reasonLine: '(timeout)' });
    }
  }
}

/** App-wide singleton — call `.bind()` once (Step 3/4 of the plan) to activate it. */
export const movementTracker = new MovementTracker();
