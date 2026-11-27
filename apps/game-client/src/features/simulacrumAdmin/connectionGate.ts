/**
 * Which connections count as "the simulacrum" (decision S2/S3 of the plan). A connection is accepted when its host AND port are both in
 * the accepted lists. The lists are the defaults below plus the owner's additions from browser storage. The owner's own LAN address is
 * never written in source (LOCAL-05): it comes from storage and must look like a local address.
 *
 * This is a convenience gate for a local-only tool, not a security boundary: a saved connection can be named anything. The real
 * boundary is the build constant and the server's own trust check on every command.
 */

/** The dev hostnames of the simulacrum: the web UI vhost and the game relay's name in the proxy allowlist. */
export const DEFAULT_HOSTS: readonly string[] = ['simulacrum.shatteredarchive.dev', 'simulacrum-server.shatteredarchive.dev'];
/** The relay port the proxy allowlist names (`simulacrum-server.shatteredarchive.dev:65001`). */
export const DEFAULT_PORTS: readonly number[] = [65001];

/** localStorage key holding the owner's additions: `{ "hosts": string[], "ports": number[] }`. Additions only, never the defaults. */
export const ADDITIONS_STORAGE_KEY = 'simulacrumAdmin.hosts';
/** Keeps a hand-edited value from growing without limit. */
export const MAX_ADDITIONS = 20;

export interface Additions {
  hosts: string[];
  ports: number[];
}

export const NO_ADDITIONS: Additions = Object.freeze({ hosts: [], ports: [] }) as Additions;

export interface ReadableStorage {
  getItem(key: string): string | null;
}
export interface WritableStorage extends ReadableStorage {
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// Same ranges the Copilot window allows for its address override (kept as its own copy: the two features share nothing).
const PRIVATE_V4 = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^127\./];

/**
 * A host as a bare lower-case name: trimmed, one trailing dot removed. Anything with a scheme, path, port, credentials, wildcard or
 * whitespace is not a host and gives `undefined`.
 */
export function normalizeHost(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  let host = value.trim().toLowerCase();
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (host === '' || host.length > 253) return undefined;
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host)) return undefined;
  if (host.includes('..')) return undefined;
  return host;
}

/** Only the local machine, a private network or the dev domain may be added: a public name or address is refused. */
export function isAllowedExtraHost(host: string): boolean {
  return (
    host === 'localhost' || host === 'shatteredarchive.dev' || host.endsWith('.shatteredarchive.dev') || PRIVATE_V4.some((re) => re.test(host))
  );
}

function isPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535;
}

/**
 * The one reader for every route that can write the storage entry (the console, a future editor, a hand edit): any wrong shape reads
 * as "no additions" for that part, duplicates collapse, and at most MAX_ADDITIONS of each are kept (E19, SETTINGS-04).
 */
export function normalizeAdditions(raw: unknown): Additions {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { hosts: [], ports: [] };
  const record = raw as Record<string, unknown>;

  const hosts: string[] = [];
  if (Array.isArray(record.hosts)) {
    for (const entry of record.hosts) {
      const host = normalizeHost(entry);
      // a default is never stored as an addition (SETTINGS-01): a later change to the defaults must reach this browser
      if (host === undefined || !isAllowedExtraHost(host) || DEFAULT_HOSTS.includes(host) || hosts.includes(host)) continue;
      hosts.push(host);
      if (hosts.length >= MAX_ADDITIONS) break;
    }
  }

  const ports: number[] = [];
  if (Array.isArray(record.ports)) {
    for (const entry of record.ports) {
      if (!isPort(entry) || DEFAULT_PORTS.includes(entry) || ports.includes(entry)) continue;
      ports.push(entry);
      if (ports.length >= MAX_ADDITIONS) break;
    }
  }
  return { hosts, ports };
}

/** The stored additions. Never throws: blocked storage, missing or corrupt values read as none (a fixed warning, no values). */
export function readAdditions(storage: ReadableStorage | undefined): Additions {
  if (!storage) return { hosts: [], ports: [] };
  try {
    const text = storage.getItem(ADDITIONS_STORAGE_KEY);
    if (text === null) return { hosts: [], ports: [] };
    return normalizeAdditions(JSON.parse(text));
  } catch {
    console.warn('[simulacrum-admin] could not read the stored host additions');
    return { hosts: [], ports: [] };
  }
}

/**
 * Stores only what the owner added (SETTINGS-01): nothing to add removes the entry instead of writing the defaults. Returns what is now
 * stored. A blocked storage keeps the value for this call only.
 */
export function saveAdditions(storage: WritableStorage | undefined, additions: unknown): Additions {
  const clean = normalizeAdditions(additions);
  try {
    if (clean.hosts.length === 0 && clean.ports.length === 0) storage?.removeItem(ADDITIONS_STORAGE_KEY);
    else storage?.setItem(ADDITIONS_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    console.warn('[simulacrum-admin] could not store the host additions');
  }
  return clean;
}

/** True when the host and the port are both accepted. Only an integer port number matches: a string port never does (E1). */
export function isSimulacrumConnection(host: unknown, port: unknown, additions: Additions = NO_ADDITIONS): boolean {
  const name = normalizeHost(host);
  if (name === undefined || !isPort(port)) return false;
  const hostOk = DEFAULT_HOSTS.includes(name) || additions.hosts.includes(name);
  const portOk = DEFAULT_PORTS.includes(port) || additions.ports.includes(port);
  return hostOk && portOk;
}
