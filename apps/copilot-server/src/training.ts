import type { World } from './world/worlds.js';

/**
 * Claude training mode: a switch that lets the AI trainer (Claude Code, driving the game client the way a person would) answer Copilot's
 * suggestions in place of the owner, against the Simulacrum and nowhere else. It is on only while ALL of these hold, and the first time one
 * stops holding it turns itself off (it never resumes by itself when the conditions come back):
 *
 *   1. Copilot is on (learning), the same switch the owner uses;
 *   2. the connection the log feed saw goes to the Simulacrum (world `sandbox`, decided by the connection, never by the player).
 *
 * The client adds its own gates (the development build only, and only while it is connected to the Simulacrum); this is the server's, so a
 * client that is wrong, or another program, cannot start training against the DSL.
 *
 * It is an in-memory flag on purpose: nothing about it is stored, so there is nothing to forget to turn off, and a restart is off.
 */
export type TrainingRefusal = 'not-simulacrum' | 'copilot-off';

export interface Training {
  /** True only while it was switched on and every condition still holds. Reading it after a condition failed turns it off for good. */
  enabled(): boolean;
  /** Turn it on or off. On is refused, with the reason, when a condition does not hold. Off is always allowed. */
  set(on: boolean): { ok: true; enabled: boolean } | { ok: false; reason: TrainingRefusal };
  /** What a client needs to show: whether it is on, which world the connection is in, and why it could not be turned on now (if so). */
  status(): { enabled: boolean; world: World | undefined; canEnable: boolean; refusal?: TrainingRefusal };
}

export interface TrainingDeps {
  /** The world of the current connection (the world router's). */
  world: () => World | undefined;
  /** Whether Copilot is on. */
  learning: () => boolean;
  /** Called when the state changes (for the log). */
  onChange?: (on: boolean) => void;
}

export function createTraining(deps: TrainingDeps): Training {
  let on = false;
  const refusal = (): TrainingRefusal | undefined => {
    if (!deps.learning()) return 'copilot-off';
    if (deps.world() !== 'sandbox') return 'not-simulacrum';
    return undefined;
  };
  const turnOff = (): void => {
    on = false;
    deps.onChange?.(false);
  };
  const enabled = (): boolean => {
    if (on && refusal() !== undefined) turnOff();
    return on;
  };
  return {
    enabled,
    set(next) {
      if (!next) {
        if (on) turnOff();
        return { ok: true, enabled: false };
      }
      const reason = refusal();
      if (reason !== undefined) return { ok: false, reason };
      if (!on) {
        on = true;
        deps.onChange?.(true);
      }
      return { ok: true, enabled: true };
    },
    status() {
      const isOn = enabled();
      const reason = refusal();
      const status: ReturnType<Training['status']> = { enabled: isOn, world: deps.world(), canEnable: reason === undefined };
      if (reason !== undefined) status.refusal = reason;
      return status;
    },
  };
}

/** The body of `POST /training`: exactly `{ "enabled": true|false }`. */
export function validateTrainingRequest(body: unknown): { ok: true; enabled: boolean } | { ok: false; errors: string[] } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, errors: ['body must be an object'] };
  const record = body as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of Object.keys(record)) if (key !== 'enabled') errors.push(`unknown field: ${key.slice(0, 40)}`);
  if (typeof record.enabled !== 'boolean') errors.push('enabled must be true or false');
  return errors.length > 0 ? { ok: false, errors } : { ok: true, enabled: record.enabled as boolean };
}
