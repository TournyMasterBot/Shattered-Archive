// apps/game-client/src/features/terminal/extractTerminalText.ts

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null;
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

/**
 * game:terminal-data detail can be shaped a bunch of different ways.
 * This helper extracts the printable text chunk without using `any`.
 */
export function extractTerminalText(detail: unknown): string {
  if (detail == null) return '';

  // direct string
  if (isString(detail)) return detail;

  if (isRecord(detail)) {
    // common shapes
    if (isString(detail.text)) return detail.text;
    if (isString(detail.data)) return detail.data;

    // nested payload shapes
    const payload = detail.payload;
    if (isRecord(payload)) {
      if (isString(payload.data)) return payload.data;
      if (isString(payload.text)) return payload.text;
    }

    // websocket-ish shapes: { type: 'raw', data: '...' }
    if (isString(detail.type) && isString(detail.data)) return detail.data;

    // sometimes event detail is { raw: 'json-string' }
    if (isString(detail.raw)) {
      try {
        const parsed: unknown = JSON.parse(detail.raw);
        if (isRecord(parsed)) {
          if (isString(parsed.data)) return parsed.data;
          if (isString(parsed.text)) return parsed.text;
        }
      } catch {
        // ignore
      }
    }
  }

  return '';
}
