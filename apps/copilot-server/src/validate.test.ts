import { BODY_LIMIT, DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, parseLessonStatus, parseLimit, parseStatus } from './validate';

describe('parseLimit', () => {
  it('defaults when absent', () => {
    expect(parseLimit(undefined)).toEqual({ ok: true, value: DEFAULT_LIST_LIMIT });
  });

  it('accepts a whole number from 1 to the maximum', () => {
    expect(parseLimit('1')).toEqual({ ok: true, value: 1 });
    expect(parseLimit('250')).toEqual({ ok: true, value: 250 });
    expect(parseLimit(String(MAX_LIST_LIMIT))).toEqual({ ok: true, value: MAX_LIST_LIMIT });
  });

  it.each(['0', '501', '-1', '1.5', '1e3', 'abc', '', ' 5', '00005', '12345'])('rejects %p', (value) => {
    expect(parseLimit(value).ok).toBe(false);
  });

  it('rejects a repeated key (an array) and a nested object, which the query parser can produce', () => {
    expect(parseLimit(['1', '2']).ok).toBe(false);
    expect(parseLimit({ a: '1' }).ok).toBe(false);
  });
});

describe('parseStatus', () => {
  it('means every status when absent', () => {
    expect(parseStatus(undefined)).toEqual({ ok: true, value: undefined });
  });

  it.each(['open', 'resolved', 'declined'])('accepts %s', (status) => {
    expect(parseStatus(status)).toEqual({ ok: true, value: status });
  });

  it.each(['OPEN', 'closed', '', 'open,resolved'])('rejects %p', (status) => {
    expect(parseStatus(status).ok).toBe(false);
  });

  it('rejects an array and an object', () => {
    expect(parseStatus(['open']).ok).toBe(false);
    expect(parseStatus({ x: 1 }).ok).toBe(false);
  });
});

describe('parseLessonStatus', () => {
  it('means every status when absent', () => {
    expect(parseLessonStatus(undefined)).toEqual({ ok: true, value: undefined });
  });

  it.each(['proposed', 'accepted', 'rejected', 'superseded'])('accepts %s', (status) => {
    expect(parseLessonStatus(status)).toEqual({ ok: true, value: status });
  });

  it.each(['open', 'PROPOSED', '', 'proposed,accepted'])('rejects %p (a ticket status is not a lesson status)', (status) => {
    expect(parseLessonStatus(status).ok).toBe(false);
  });

  it('rejects an array and an object', () => {
    expect(parseLessonStatus(['proposed']).ok).toBe(false);
    expect(parseLessonStatus({ x: 1 }).ok).toBe(false);
  });
});

describe('BODY_LIMIT', () => {
  it('is 64 kb', () => {
    expect(BODY_LIMIT).toBe('64kb');
  });
});
