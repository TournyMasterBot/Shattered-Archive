/**
 * Build-time configuration for the app's single ad placement.
 *
 * These are Vite `define` constants rather than `import.meta.env` reads. That is deliberate:
 * this repo's Jest client setup cannot compile `import.meta` anywhere in a module graph
 * (see the note in game-client's features/auth/authFragment.ts), so reading env that way
 * would make `AdSlot` and everything importing it untestable. `define` substitutes a plain
 * literal at build time, and under Jest the identifiers simply don't exist — hence the
 * try/catch, which is the whole reason this indirection is a function rather than a constant.
 *
 * Values come from Docker build args (see deploy/scrum-poker-client.Dockerfile). With either
 * missing, `<AdSlot />` renders nothing at all: no box, no placeholder, no third-party script.
 */
declare const __SP_AD_CLIENT__: string;
declare const __SP_AD_SLOT__: string;
declare const __SP_DEV__: boolean;

export interface AdConfig {
  /** Publisher id, e.g. `ca-pub-0000000000000000`. */
  readonly client?: string;
  /** Ad unit id for this placement. */
  readonly slot?: string;
  /** True under `vite dev`, where an unconfigured slot shows a placeholder so it stays visible. */
  readonly isDev: boolean;
}

function defined<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined; // not a Vite build (Jest) — the constant was never substituted
  }
}

export function readAdConfig(): AdConfig {
  return {
    client: defined(() => __SP_AD_CLIENT__) || undefined,
    slot: defined(() => __SP_AD_SLOT__) || undefined,
    isDev: defined(() => __SP_DEV__) === true,
  };
}
