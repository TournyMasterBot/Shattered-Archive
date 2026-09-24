import type { PluginEvent, PluginRuntimeApi } from '@shatteredarchive/types-client';
import { createWorldTimeAndIdentityPlugin, timeStringToPeriod } from './world-time-and-identity.plugin';

// This plugin is a single onEvent (see the comment in the source on why —
// game:tick is ALSO in ROUTED_WINDOW_EVENTS, so an onEnable-registered
// api.onEvent('game:tick', ...) would collide with the host's own generic
// wiring for it under the same dedup key and never fire). No onEnable, no
// cleanup, no api.onEvent mock needed — call plugin.onEvent(api, evt) the
// same way pluginHost actually does.
const api = { connectionId: 'test', pluginId: 'world-time-and-identity' } as unknown as PluginRuntimeApi;

const tick = (time: string): PluginEvent => ({ name: 'game:tick', payload: { time } });
const rawData = (rawText: string): PluginEvent => ({ name: 'shatteredarchive:raw-data', payload: { rawText } });

// Exact two-line layout produced by this game's `score`/`sc` command (real
// corpus, carried over from userScriptRuntime.scoreIdentity.test.ts).
const SCORE_SHEET_BLOCK = [
  'Score for Talarien, the multifaceted gemstone',
  'Created: Fri Jun 12 22:33:32 2026',
  "You are a Great Wyrm, and if you get any older, you'll die.",
  '----------------------------------------------------------------------------',
  'LEVEL: 42          Race : Topaz dragon      Played: 3887 hours',
  'YEARS: 211         Class: Dragon            Log In: Tue Sep 15 14:37:22 2026',
  "SEX  : Female   Reclass@: Not Reclassed    ",
].join('\n');

describe('world-time-and-identity plugin — score-sheet identity scan', () => {
  beforeEach(() => {
    delete (window as any).__SA_IDENTITY__;
  });

  it('extracts race and class from a full score sheet block', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    plugin.onEvent!(api, rawData(SCORE_SHEET_BLOCK));

    const snapshot = (window as any).__SA_IDENTITY__;
    expect(snapshot.raceName).toBe('Topaz dragon');
    expect(snapshot.className).toBe('Dragon');
  });

  it('extracts race alone when only that line has arrived yet', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    plugin.onEvent!(api, rawData('LEVEL: 42          Race : Topaz dragon      Played: 3887 hours'));

    const snapshot = (window as any).__SA_IDENTITY__;
    expect(snapshot.raceName).toBe('Topaz dragon');
    expect(snapshot.className).toBeUndefined();
  });

  it('preserves a previously captured field when a later event updates the other one', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    plugin.onEvent!(api, rawData('LEVEL: 42          Race : Topaz dragon      Played: 3887 hours'));
    plugin.onEvent!(api, rawData('YEARS: 211         Class: Dragon            Log In: Tue Sep 15 14:37:22 2026'));

    const snapshot = (window as any).__SA_IDENTITY__;
    expect(snapshot.raceName).toBe('Topaz dragon');
    expect(snapshot.className).toBe('Dragon');
  });

  it('does nothing for ordinary game output', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    plugin.onEvent!(api, rawData('You swing your sword at the orc.\n'));

    expect((window as any).__SA_IDENTITY__?.raceName).toBeUndefined();
    expect((window as any).__SA_IDENTITY__?.className).toBeUndefined();
  });

  it('the fast gate rejects ordinary text without the regex ever running', () => {
    const matchSpy = jest.spyOn(String.prototype, 'match');
    const plugin = createWorldTimeAndIdentityPlugin();

    plugin.onEvent!(api, rawData('You swing your sword at the orc.\n'));

    expect(matchSpy).not.toHaveBeenCalled();
    matchSpy.mockRestore();
  });

  it('ignores events other than shatteredarchive:raw-data', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    plugin.onEvent!(api, { name: 'game:room-data', payload: { rawText: SCORE_SHEET_BLOCK } });

    expect((window as any).__SA_IDENTITY__).toBeUndefined();
  });
});

describe('world-time-and-identity plugin — game:tick world-time period', () => {
  beforeEach(() => {
    delete (window as any).__SA_WORLD_TIME__;
  });

  it('sets the period from a real tick payload', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    plugin.onEvent!(api, tick('8:30am'));

    expect((window as any).__SA_WORLD_TIME__.period).toBe('Day Time');
  });

  it('updates on a later tick with a different period', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    plugin.onEvent!(api, tick('8:30am'));
    plugin.onEvent!(api, tick('9:00pm'));

    expect((window as any).__SA_WORLD_TIME__.period).toBe('Night Time');
  });

  it('ignores a tick payload with no time field', () => {
    const plugin = createWorldTimeAndIdentityPlugin();
    plugin.onEvent!(api, { name: 'game:tick', payload: {} });

    expect((window as any).__SA_WORLD_TIME__).toBeUndefined();
  });
});

describe('timeStringToPeriod', () => {
  // Every boundary edge, not just the happy path — sunrise 7:00am / sunset
  // 7:00pm confirmed against the real game-log corpus; Dawn/Dusk are each
  // exactly one hour before their anchor.
  it.each<[string, string]>([
    ['5:59am', 'Night Time'],
    ['6:00am', 'Dawn'],
    ['6:59am', 'Dawn'],
    ['7:00am', 'Day Time'],
    ['5:59pm', 'Day Time'],
    ['6:00pm', 'Dusk'],
    ['6:59pm', 'Dusk'],
    ['7:00pm', 'Night Time'],
    ['11:59pm', 'Night Time'],
    ['12:00am', 'Night Time'],
    ['12:00pm', 'Day Time'],
  ])('%s -> %s', (time, expected) => {
    expect(timeStringToPeriod(time)).toBe(expected);
  });

  it('returns null for an unparseable time string', () => {
    expect(timeStringToPeriod('not-a-time')).toBeNull();
    expect(timeStringToPeriod('')).toBeNull();
  });
});
