import type { GmcpEntry } from './gmcpCapture';

/** Rows drawn at once: the newest ones. The buffer holds more; the filter narrows what is shown (E9, E16). */
export const MAX_ROWS = 200;
/** The detail pane pretty-prints at most this much; copying always gives the whole message (E23). */
export const MAX_DETAIL_CHARS = 64 * 1024;

/** The message as readable text: indented JSON when it parsed, the raw text otherwise. Cut at MAX_DETAIL_CHARS. */
export function detailText(entry: GmcpEntry): { text: string; truncated: boolean } {
  const full = entry.data !== undefined ? JSON.stringify(entry.data, null, 2) : entry.raw;
  return full.length > MAX_DETAIL_CHARS ? { text: full.slice(0, MAX_DETAIL_CHARS), truncated: true } : { text: full, truncated: false };
}
