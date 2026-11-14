/**
 * Where the Copilot server is. The game-client Dockerfile is shared with production and may carry only the one COPILOT_LOCAL switch
 * (LOCAL-02), so the address is not a build variable: it is the dev vhost, which a developer can override for one browser.
 */
export const DEV_API_BASE = 'https://copilot.shatteredarchive.dev';
export const API_BASE_STORAGE_KEY = 'copilot.api.base';

const PRIVATE_V4 = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^127\./];

/** A base the browser may talk to: this machine, a private network, or the dev domain, as a bare origin (no path, no credentials). */
export function isAllowedApiBase(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.origin !== value || url.username !== '' || url.password !== '') return false;
  const host = url.hostname;
  return host === 'localhost' || host === 'shatteredarchive.dev' || host.endsWith('.shatteredarchive.dev') || PRIVATE_V4.some((re) => re.test(host));
}

export interface ReadableStorage {
  getItem(key: string): string | null;
}

/** The override in storage if it is allowed, otherwise the dev vhost. Never throws (a blocked storage reads as "no override"). */
export function resolveApiBase(storage: ReadableStorage | undefined): string {
  try {
    const override = storage?.getItem(API_BASE_STORAGE_KEY);
    if (override !== null && override !== undefined && isAllowedApiBase(override)) return override;
  } catch {
    // storage blocked: fall through to the default
  }
  return DEV_API_BASE;
}
