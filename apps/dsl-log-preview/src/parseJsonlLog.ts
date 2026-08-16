// apps/dsl-log-preview/src/parseJsonlLog.ts

/**
 * Extracts the raw ANSI game-text stream from a game-server *.jsonl log.
 *
 * Each line is one JSON record. Confirmed against the real corpus
 * (C:\Projects\DSL\GameLogs\...\server.log-*.jsonl): `game:remote-server:raw`
 * carries the actual ANSI-laden game text in `payload.data`, and it is NOT
 * line-aligned — a word, or even an escape sequence, can be split across
 * consecutive raw records. So raw payloads are concatenated in file order
 * into one continuous string before any ANSI parsing happens; parsing
 * per-record would risk splitting a `\x1b[...m` sequence mid-code.
 *
 * Everything else in the file (GMCP telemetry, `game:client:input`, server
 * lifecycle lines) is dropped. `game:client:input` looked promising as an
 * inline "> command you typed" marker, but the real data is raw per-keystroke
 * fragments (`"y"`, `""`, `"m"`, `"ashass"`, ...) with no reliable
 * line-boundary in `data` itself — reconstructing an actual typed command
 * would need real protocol work, which is out of scope for what was asked
 * (just render the payload, no fancy integrations).
 */
export function parseJsonlLog(text: string): string {
  let ansiText = '';

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;

    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      continue; // malformed/truncated line (e.g. a partially-written tail) — skip
    }
    if (typeof record !== 'object' || record === null) continue;
    const { type, payload } = record as { type?: unknown; payload?: unknown };

    if (type === 'game:remote-server:raw') {
      const data = (payload as { data?: unknown } | undefined)?.data;
      if (typeof data === 'string') ansiText += data;
    }
  }

  return ansiText;
}
