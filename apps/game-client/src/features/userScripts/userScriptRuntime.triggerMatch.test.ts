// UserScriptRuntime.triggerPassesMatch runs for every enabled trigger on every received
// line. Match text without a `{token}` skips variable expansion entirely; text with one
// still resolves it from the connection's global variables.
import { UserScriptRuntime } from './userScriptRuntime';
import { setGlobalVar } from './globalScriptsStore';

type Matcher = { triggerPassesMatch(trig: unknown, payload: unknown): boolean };

function runtime(): Matcher {
  const r = new UserScriptRuntime({} as never);
  r.setActiveConnectionId('dsl-mud');
  return r as unknown as Matcher;
}

const trig = (matchText: string, extra: object = {}) => ({ kind: 'trigger', matchText, ...extra });

beforeEach(() => window.localStorage.clear());

describe('triggerPassesMatch — plain match text', () => {
  it('matches when the line contains the text, and not otherwise', () => {
    const r = runtime();
    expect(r.triggerPassesMatch(trig('You are hungry'), { text: 'You are hungry.' })).toBe(true);
    expect(r.triggerPassesMatch(trig('You are hungry'), { text: 'You are thirsty.' })).toBe(false);
  });

  it('trims the match text before comparing', () => {
    expect(runtime().triggerPassesMatch(trig('  hungry  '), { text: 'so hungry' })).toBe(true);
  });

  it('never matches blank match text', () => {
    expect(runtime().triggerPassesMatch(trig('   '), { text: 'anything' })).toBe(false);
    expect(runtime().triggerPassesMatch(trig(undefined as never), { text: 'anything' })).toBe(false);
  });

  it('always passes when the trigger does not require match text', () => {
    expect(runtime().triggerPassesMatch(trig('', { dontRequireMatchText: true }), { text: 'x' })).toBe(true);
  });

  it('does not match a payload with no text at all', () => {
    expect(runtime().triggerPassesMatch(trig('hungry'), {})).toBe(false);
    expect(runtime().triggerPassesMatch(trig('hungry'), null)).toBe(false);
  });

  it('reads the line from a string, rawText or line payload', () => {
    const r = runtime();
    expect(r.triggerPassesMatch(trig('rat'), 'a rat')).toBe(true);
    expect(r.triggerPassesMatch(trig('rat'), { rawText: 'a rat' })).toBe(true);
    expect(r.triggerPassesMatch(trig('rat'), { line: 'a rat' })).toBe(true);
  });
});

describe('triggerPassesMatch — {token} match text', () => {
  it('expands a global variable and matches the expanded text', () => {
    setGlobalVar('dsl-mud', 'target', 'weed');
    const r = runtime();
    expect(r.triggerPassesMatch(trig('You hit {target}'), { text: 'You hit weed hard' })).toBe(true);
    expect(r.triggerPassesMatch(trig('You hit {target}'), { text: 'You hit someone' })).toBe(false);
  });

  it('follows a changed variable on the very next line', () => {
    const r = runtime();
    setGlobalVar('dsl-mud', 'target', 'weed');
    expect(r.triggerPassesMatch(trig('hit {target}'), { text: 'hit weed' })).toBe(true);
    setGlobalVar('dsl-mud', 'target', 'orc');
    expect(r.triggerPassesMatch(trig('hit {target}'), { text: 'hit weed' })).toBe(false);
    expect(r.triggerPassesMatch(trig('hit {target}'), { text: 'hit orc' })).toBe(true);
  });

  it('does not match when a variable is unset (it must not match everything)', () => {
    expect(runtime().triggerPassesMatch(trig('hit {nothing_set}'), { text: 'hit anything' })).toBe(false);
  });

  it('resolves a variable stored under the legacy default id', () => {
    setGlobalVar('default', 'target', 'weed');
    expect(runtime().triggerPassesMatch(trig('{target}'), { text: 'weed' })).toBe(true);
  });
});
