import { LESSON_STATUSES, TICKET_STATUSES, type LessonStatus, type TicketStatus } from '@shatteredarchive/copilot-core';

/** Largest request body the API reads. */
export const BODY_LIMIT = '64kb';
export const DEFAULT_LIST_LIMIT = 100;
export const MAX_LIST_LIMIT = 500;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** A query parameter arrives as a string, an array (repeated key) or an object (`a[b]=c`); only a single plain string is accepted. */
function single(raw: unknown): string | undefined | null {
  if (raw === undefined) return undefined;
  return typeof raw === 'string' ? raw : null;
}

/** `?limit=`: a whole number from 1 to MAX_LIST_LIMIT; absent means the default. */
export function parseLimit(raw: unknown): Parsed<number> {
  const text = single(raw);
  if (text === undefined) return { ok: true, value: DEFAULT_LIST_LIMIT };
  if (text === null || !/^\d{1,4}$/.test(text)) return { ok: false, error: 'limit must be a whole number' };
  const value = Number(text);
  if (value < 1 || value > MAX_LIST_LIMIT) return { ok: false, error: `limit must be from 1 to ${MAX_LIST_LIMIT}` };
  return { ok: true, value };
}

/** `?status=` for lessons: one of the lesson statuses; absent means every status. */
export function parseLessonStatus(raw: unknown): Parsed<LessonStatus | undefined> {
  const text = single(raw);
  if (text === undefined) return { ok: true, value: undefined };
  if (text === null || !(LESSON_STATUSES as readonly string[]).includes(text)) {
    return { ok: false, error: `status must be one of ${LESSON_STATUSES.join(', ')}` };
  }
  return { ok: true, value: text as LessonStatus };
}

/** `?status=`: one of the ticket statuses; absent means every status. */
export function parseStatus(raw: unknown): Parsed<TicketStatus | undefined> {
  const text = single(raw);
  if (text === undefined) return { ok: true, value: undefined };
  if (text === null || !(TICKET_STATUSES as readonly string[]).includes(text)) {
    return { ok: false, error: `status must be one of ${TICKET_STATUSES.join(', ')}` };
  }
  return { ok: true, value: text as TicketStatus };
}
