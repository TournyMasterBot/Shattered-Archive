import { DispatchEvent, ListenEvent } from '../event-emitter/event-dispatcher';
import { DEFAULT_CAP, createGmcpCapture, parseGmcpText, type GmcpCapture } from './gmcpCapture';

const gmcp = (payload: unknown, receivedTimestamp?: string): void =>
  DispatchEvent('game:remote-server:gmcp', { type: 'gmcp', ...(receivedTimestamp ? { receivedTimestamp } : {}), payload });

describe('parseGmcpText (E23)', () => {
  it('splits the package from the JSON', () => {
    expect(parseGmcpText('tick {"time":"9:00pm"}')).toEqual({ pkg: 'tick', data: { time: '9:00pm' } });
    expect(parseGmcpText('  room_data   {"room":"x","exits":[]}  ')).toMatchObject({ pkg: 'room_data' });
  });

  it('keeps a JSON value that is not an object (the parity check judges it)', () => {
    expect(parseGmcpText('tick 5')).toEqual({ pkg: 'tick', data: 5 });
    expect(parseGmcpText('tick null')).toEqual({ pkg: 'tick', data: null });
  });

  it('turns every malformed input into a fixed parse error and never throws', () => {
    expect(parseGmcpText('')).toEqual({ pkg: '', parseError: 'empty message' });
    expect(parseGmcpText('   ')).toEqual({ pkg: '', parseError: 'empty message' });
    expect(parseGmcpText('tick')).toEqual({ pkg: 'tick', parseError: 'no payload' });
    expect(parseGmcpText('tick {not json')).toEqual({ pkg: 'tick', parseError: 'invalid JSON' });
    expect(parseGmcpText('tick ')).toEqual({ pkg: 'tick', parseError: 'no payload' });
  });
});

describe('createGmcpCapture', () => {
  const captures: GmcpCapture[] = [];
  let active = true;
  const make = (cap?: number): GmcpCapture => {
    const capture = createGmcpCapture({ isActive: () => active, cap, now: () => 'NOW' });
    captures.push(capture);
    return capture;
  };
  beforeEach(() => {
    active = true;
  });
  afterEach(() => captures.splice(0).forEach((c) => c.dispose()));

  it('stores a message with its package, size, raw text, parsed data and time', () => {
    const capture = make();
    gmcp('tick {"time":"9:00pm"}', '2026-11-07T10:00:00.000Z');
    expect(capture.getEntries()).toEqual([
      {
        id: 1,
        receivedAt: '2026-11-07T10:00:00.000Z',
        pkg: 'tick',
        size: 'tick {"time":"9:00pm"}'.length,
        raw: 'tick {"time":"9:00pm"}',
        data: { time: '9:00pm' },
      },
    ]);
  });

  it('keeps a message it cannot parse, with a fixed parse error and the raw text for the detail view', () => {
    const capture = make();
    gmcp('tick {oops');
    expect(capture.getEntries()[0]).toMatchObject({ pkg: 'tick', parseError: 'invalid JSON', raw: 'tick {oops', receivedAt: 'NOW' });
    expect(capture.getEntries()[0]).not.toHaveProperty('data');
  });

  it('treats a payload that is not a string as an empty message', () => {
    const capture = make();
    gmcp(undefined);
    gmcp(42);
    expect(capture.getEntries().map((e) => e.parseError)).toEqual(['empty message', 'empty message']);
  });

  it('numbers entries in order and keeps the newest last', () => {
    const capture = make();
    gmcp('a {}');
    gmcp('b {}');
    expect(capture.getEntries().map((e) => [e.id, e.pkg])).toEqual([[1, 'a'], [2, 'b']]);
  });

  it('keeps only the newest `cap` entries (E16)', () => {
    const capture = make(5);
    for (let i = 1; i <= 8; i++) gmcp(`m${i} {}`);
    expect(capture.getEntries().map((e) => e.pkg)).toEqual(['m4', 'm5', 'm6', 'm7', 'm8']);
    expect(capture.getEntries()).toHaveLength(5);
  });

  it('defaults to 1000 entries: 1001 messages leave 1000 with the oldest gone', () => {
    const capture = make();
    for (let i = 1; i <= DEFAULT_CAP + 1; i++) gmcp(`m${i} {}`);
    expect(capture.getEntries()).toHaveLength(DEFAULT_CAP);
    expect(capture.getEntries()[0].pkg).toBe('m2');
    expect(capture.getEntries()[DEFAULT_CAP - 1].pkg).toBe(`m${DEFAULT_CAP + 1}`);
  });

  it('stores a payload of 100 KB complete in raw', () => {
    const capture = make();
    const big = `affect_data {"affects":[],"pad":"${'x'.repeat(100_000)}"}`;
    gmcp(big);
    expect(capture.getEntries()[0].raw).toBe(big);
    expect(capture.getEntries()[0].size).toBe(big.length);
  });

  it('stores nothing while the connection is not the simulacrum (E3)', () => {
    const capture = make();
    const heard = jest.fn();
    capture.onMessage(heard);
    active = false;
    gmcp('char_data {"hp":1}');
    expect(capture.getEntries()).toEqual([]);
    expect(heard).not.toHaveBeenCalled();
  });

  it('pause stops storing, resume continues, and onMessage still hears every message while paused', () => {
    const capture = make();
    const heard = jest.fn();
    capture.onMessage(heard);
    gmcp('a {}');
    capture.pause();
    expect(capture.isPaused()).toBe(true);
    gmcp('b {}');
    expect(capture.getEntries().map((e) => e.pkg)).toEqual(['a']);
    expect(heard).toHaveBeenCalledTimes(2);
    capture.resume();
    expect(capture.isPaused()).toBe(false);
    gmcp('c {}');
    expect(capture.getEntries().map((e) => e.pkg)).toEqual(['a', 'c']);
  });

  it('clear empties it, notifies once, and does nothing when it is already empty', () => {
    const capture = make();
    const changed = jest.fn();
    capture.subscribe(changed);
    capture.clear();
    expect(changed).not.toHaveBeenCalled();
    gmcp('a {}');
    changed.mockClear();
    capture.clear();
    expect(capture.getEntries()).toEqual([]);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('hands out the same array until something changes, and a new one after', () => {
    const capture = make();
    const before = capture.getEntries();
    expect(capture.getEntries()).toBe(before);
    gmcp('a {}');
    expect(capture.getEntries()).not.toBe(before);
    expect(before).toEqual([]);
  });

  it('notifies subscribers on every stored message, and not after they unsubscribe', () => {
    const capture = make();
    const changed = jest.fn();
    const stop = capture.subscribe(changed);
    gmcp('a {}');
    gmcp('b {}');
    expect(changed).toHaveBeenCalledTimes(2);
    stop();
    gmcp('c {}');
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('after dispose nothing more is stored or announced, and no listener remains (E16)', () => {
    const capture = make();
    const changed = jest.fn();
    const heard = jest.fn();
    capture.subscribe(changed);
    capture.onMessage(heard);
    gmcp('a {}');
    changed.mockClear();
    heard.mockClear();
    capture.dispose();
    gmcp('b {}');
    expect(capture.getEntries().map((e) => e.pkg)).toEqual(['a']);
    expect(changed).not.toHaveBeenCalled();
    expect(heard).not.toHaveBeenCalled();
  });

  it('does not replace a listener the app registered for the same event, in either order (E26)', () => {
    const appBefore = jest.fn();
    const stopBefore = ListenEvent('game:remote-server:gmcp', appBefore);
    const capture = make();
    const appAfter = jest.fn();
    const stopAfter = ListenEvent('game:remote-server:gmcp', appAfter, { key: 'test::after' });
    try {
      gmcp('a {}');
      expect(capture.getEntries()).toHaveLength(1);
      expect(appBefore).toHaveBeenCalledTimes(1);
      expect(appAfter).toHaveBeenCalledTimes(1);
      capture.dispose();
      gmcp('b {}');
      expect(appBefore).toHaveBeenCalledTimes(2); // disposing ours leaves the app's listener working
    } finally {
      stopBefore();
      stopAfter();
    }
  });
});
