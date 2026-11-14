/**
 * The server's learning switch: whether it reads the game logs and feeds what it finds to the character registry, the world memory
 * and the suggestions. It starts OFF on every start (the owner turns Copilot on in the game client, which tells the server), so a
 * restart never learns by itself. It is a plain in-memory flag on purpose: nothing about it is stored, so there is nothing to
 * forget to turn off.
 */
export interface Learning {
  enabled(): boolean;
  /** Returns whether the state changed (a repeat of the current state changes nothing and calls nothing). */
  set(on: boolean): boolean;
}

export function createLearning(onChange: (on: boolean) => void): Learning {
  let on = false;
  return {
    enabled: () => on,
    set(next) {
      if (next === on) return false;
      on = next;
      onChange(on);
      return true;
    },
  };
}

/** The body of `POST /control`: exactly `{ "enabled": true|false }`. Anything else is refused with the reasons. */
export function validateControl(body: unknown): { ok: true; enabled: boolean } | { ok: false; errors: string[] } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, errors: ['body must be an object'] };
  const record = body as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of Object.keys(record)) if (key !== 'enabled') errors.push(`unknown field: ${key.slice(0, 40)}`);
  if (typeof record.enabled !== 'boolean') errors.push('enabled must be true or false');
  return errors.length > 0 ? { ok: false, errors } : { ok: true, enabled: record.enabled as boolean };
}
