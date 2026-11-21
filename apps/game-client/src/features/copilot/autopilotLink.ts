import { DispatchEvent, ListenEvent } from '../event-emitter/event-dispatcher';

/** Autopilot asking for help: it stopped on an error. Copilot may offer to look at it. */
export interface NeedHelp {
  reason: string;
  message: string;
}

export interface AutopilotLink {
  /** Autopilot's last reported status (`idle` until it reports). */
  status(): string;
  start(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  /** Called when Autopilot reports that it needs help. Returns the stop function. */
  onNeedHelp(handler: (help: NeedHelp) => void): () => void;
  /** Start following Autopilot's status; returns the stop function. */
  attach(): () => void;
}

/**
 * The two-way link between Copilot and Autopilot, over the existing event bus. Copilot to Autopilot: the same
 * `shatteredarchive:autoleveling-*` events the toolbar buttons dispatch (so Autopilot treats Copilot like a button press). Autopilot to
 * Copilot: `shatteredarchive:autopilot-status` (every status change, which the command gate reads) and
 * `shatteredarchive:autopilot-need-help` (the run state became `error`, or the engine paused itself after a timeout: `reason` says which).
 */
export function createAutopilotLink(): AutopilotLink {
  let status = 'idle';
  return {
    status: () => status,
    start: () => DispatchEvent('shatteredarchive:autoleveling-start', {}),
    pause: () => DispatchEvent('shatteredarchive:autoleveling-pause', {}),
    resume: () => DispatchEvent('shatteredarchive:autoleveling-resume', {}),
    stop: () => DispatchEvent('shatteredarchive:autoleveling-stop', {}),
    onNeedHelp(handler) {
      return ListenEvent<Partial<NeedHelp>>(
        'shatteredarchive:autopilot-need-help',
        (payload) => handler({ reason: typeof payload?.reason === 'string' ? payload.reason : 'unknown', message: typeof payload?.message === 'string' ? payload.message : '' }),
        { key: `copilot::link::need-help::${Math.random().toString(36).slice(2)}` },
      );
    },
    attach() {
      return ListenEvent<{ status?: unknown }>(
        'shatteredarchive:autopilot-status',
        (payload) => {
          if (typeof payload?.status === 'string') status = payload.status;
        },
        { key: 'copilot::link::status' },
      );
    },
  };
}
