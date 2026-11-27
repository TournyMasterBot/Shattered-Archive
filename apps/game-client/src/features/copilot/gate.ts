import { DispatchEvent, ListenEvent } from '../event-emitter/event-dispatcher';

/** Why the gate would not send. */
export type GateRefusal = 'copilot-off' | 'autopilot-running' | 'user-typing' | 'invalid-command';

export interface GateRefusalRecord {
  at: number;
  reason: GateRefusal;
}

export type GateResult = { ok: true } | { ok: false; reason: GateRefusal };

export interface CommandGateOptions {
  now?: () => number;
  /** How long after the user's last keystroke Copilot stays quiet (default 2000 ms). */
  typingWindowMs?: number;
  /** Autopilot's current run status (`running`, `paused`, `idle`, ...). */
  getAutopilotStatus: () => string;
  /** The most recent refusals are kept (default 50). */
  keepRefusals?: number;
  /** Copilot's on/off switch. While it says no, nothing is sent. Absent: always on (tests). */
  isEnabled?: () => boolean;
}

const MAX_COMMAND = 200;
/** Any control character, a line break above all: a command that holds one could be two commands. */
const CONTROL = /[\u0000-\u001f\u007f]/;

export interface CommandGate {
  /** Send one command to the game, unless a more important sender has the line. Never queues. */
  send(command: string): GateResult;
  /** The refusals so far (newest last): the window and the ledger record them. */
  refusals(): readonly GateRefusalRecord[];
  /** Start listening for the user's typing; returns the stop function. */
  trackUserTyping(): () => void;
  noteUserTyped(at?: number): void;
}

/**
 * The single place Copilot sends a command to the game (E2). One controller at a time: the user first, then Autopilot, then Copilot.
 * A Copilot command is refused while Copilot is switched off, while Autopilot is running, or when the user typed in the last 2 seconds; a refusal is recorded and
 * the command is NOT queued (the owner can approve it again). A command that is empty, too long, or holds a control character is
 * refused too, so a suggestion can never carry a second command into the game.
 */
export function createCommandGate(options: CommandGateOptions): CommandGate {
  const now = options.now ?? Date.now;
  const windowMs = options.typingWindowMs ?? 2000;
  const keep = options.keepRefusals ?? 50;
  const log: GateRefusalRecord[] = [];
  let lastTypedAt = Number.NEGATIVE_INFINITY;

  function refuse(reason: GateRefusal): GateResult {
    log.push({ at: now(), reason });
    if (log.length > keep) log.splice(0, log.length - keep);
    return { ok: false, reason };
  }

  const gate: CommandGate = {
    send(command) {
      const cmd = typeof command === 'string' ? command.trim() : '';
      if (options.isEnabled && !options.isEnabled()) return refuse('copilot-off');
      if (cmd === '' || cmd.length > MAX_COMMAND || CONTROL.test(cmd)) return refuse('invalid-command');
      if (now() - lastTypedAt < windowMs) return refuse('user-typing');
      if (options.getAutopilotStatus() === 'running') return refuse('autopilot-running');
      DispatchEvent('shatteredarchive:send-command', { cmd });
      return { ok: true };
    },
    refusals: () => log,
    noteUserTyped(at) {
      lastTypedAt = at ?? now();
    },
    trackUserTyping() {
      return ListenEvent<{ at?: number }>(
        'shatteredarchive:user-typing',
        (payload) => gate.noteUserTyped(payload?.at),
        { key: 'copilot::gate::user-typing' },
      );
    },
  };
  return gate;
}
