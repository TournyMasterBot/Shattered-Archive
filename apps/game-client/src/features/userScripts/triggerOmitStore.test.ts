import { setOmitRules, setPluginOmitRules, shouldOmitLine } from './triggerOmitStore';

const RAW = 'shatteredarchive:raw-data';

beforeEach(() => {
  setOmitRules([], 'dsl-mud');
  setPluginOmitRules('p1', []);
  setPluginOmitRules('p2', []);
});

describe('shouldOmitLine — user rules', () => {
  it('omits nothing when no rules are set', () => {
    expect(shouldOmitLine(RAW, 'anything')).toBe(false);
  });

  it('matches a case-sensitive needle exactly', () => {
    setOmitRules([{ id: 'r1', eventName: RAW, matchText: 'You are hungry', caseInsensitive: false }], 'dsl-mud');
    expect(shouldOmitLine(RAW, 'You are hungry.')).toBe(true);
    expect(shouldOmitLine(RAW, 'you are hungry.')).toBe(false);
  });

  it('matches a case-insensitive needle whatever the line casing', () => {
    setOmitRules([{ id: 'r1', eventName: RAW, matchText: 'You Are HUNGRY', caseInsensitive: true }], 'dsl-mud');
    expect(shouldOmitLine(RAW, 'xx you are hungry xx')).toBe(true);
    expect(shouldOmitLine(RAW, 'YOU ARE HUNGRY')).toBe(true);
    expect(shouldOmitLine(RAW, 'You are thirsty')).toBe(false);
  });

  it('checks the lowercased line correctly when consecutive lines differ', () => {
    setOmitRules([{ id: 'r1', eventName: RAW, matchText: 'ORC', caseInsensitive: true }], 'dsl-mud');
    expect(shouldOmitLine(RAW, 'An Orc attacks')).toBe(true);
    expect(shouldOmitLine(RAW, 'A goblin attacks')).toBe(false);
    expect(shouldOmitLine(RAW, 'An Orc attacks')).toBe(true);
  });

  it('only applies a rule to its own event name', () => {
    setOmitRules([{ id: 'r1', eventName: 'event:damage', matchText: 'hits', caseInsensitive: true }], 'dsl-mud');
    expect(shouldOmitLine(RAW, 'the orc hits you')).toBe(false);
    expect(shouldOmitLine('event:damage', 'the orc hits you')).toBe(true);
  });

  it('omitAll drops every line of that event, with or without match text', () => {
    setOmitRules([{ id: 'r1', eventName: RAW, omitAll: true }], 'dsl-mud');
    expect(shouldOmitLine(RAW, 'literally anything')).toBe(true);
    expect(shouldOmitLine('event:damage', 'literally anything')).toBe(false);
  });

  it('ignores a rule with no usable match text rather than omitting every line', () => {
    setOmitRules(
      [
        { id: 'blank', eventName: RAW, matchText: '   ', caseInsensitive: true },
        { id: 'none', eventName: RAW },
        { id: 'noevent', eventName: '  ', matchText: 'x' },
      ],
      'dsl-mud',
    );
    expect(shouldOmitLine(RAW, 'hello')).toBe(false);
  });

  it('returns false for a blank event name', () => {
    setOmitRules([{ id: 'r1', eventName: RAW, omitAll: true }], 'dsl-mud');
    expect(shouldOmitLine('  ', 'hello')).toBe(false);
  });
});

describe('shouldOmitLine — plugin rules', () => {
  it('matches a plugin text rule case-insensitively by default', () => {
    setPluginOmitRules('p1', [{ matchText: 'Frost Aura' }]);
    expect(shouldOmitLine(RAW, 'a FROST AURA flickers')).toBe(true);
    expect(shouldOmitLine(RAW, 'nothing here')).toBe(false);
  });

  it('honours caseInsensitive: false on a plugin text rule', () => {
    setPluginOmitRules('p1', [{ matchText: 'Frost', caseInsensitive: false }]);
    expect(shouldOmitLine(RAW, 'Frost shard')).toBe(true);
    expect(shouldOmitLine(RAW, 'frost shard')).toBe(false);
  });

  it('matches a plugin regex rule and defaults it to case-insensitive', () => {
    setPluginOmitRules('p1', [{ pattern: '^you (hit|miss)' }]);
    expect(shouldOmitLine(RAW, 'YOU MISS the rat')).toBe(true);
    expect(shouldOmitLine(RAW, 'the rat bites you')).toBe(false);
  });

  it('keeps matching on every call for a global-flag regex (lastIndex is reset)', () => {
    setPluginOmitRules('p1', [{ pattern: 'rat', flags: 'gi' }]);
    for (let i = 0; i < 4; i++) expect(shouldOmitLine(RAW, 'a rat')).toBe(true);
  });

  it('skips an invalid regex, and rules with no event name or no text', () => {
    setPluginOmitRules('p1', [{ pattern: '(unbalanced' }, { matchText: '   ' }, { matchText: 'x', eventName: '  ' }]);
    expect(shouldOmitLine(RAW, 'x (unbalanced')).toBe(false);
  });

  it('removes a plugin\'s rules when it registers none', () => {
    setPluginOmitRules('p1', [{ matchText: 'orc' }]);
    expect(shouldOmitLine(RAW, 'orc')).toBe(true);
    setPluginOmitRules('p1', []);
    expect(shouldOmitLine(RAW, 'orc')).toBe(false);
  });

  it('removes a plugin\'s rules when none of its rules are usable', () => {
    setPluginOmitRules('p1', [{ matchText: 'orc' }]);
    setPluginOmitRules('p1', [{ matchText: '  ' }]);
    expect(shouldOmitLine(RAW, 'orc')).toBe(false);
  });

  it('applies rules from several plugins independently', () => {
    setPluginOmitRules('p1', [{ matchText: 'alpha' }]);
    setPluginOmitRules('p2', [{ matchText: 'beta' }]);
    expect(shouldOmitLine(RAW, 'ALPHA')).toBe(true);
    expect(shouldOmitLine(RAW, 'Beta')).toBe(true);
    expect(shouldOmitLine(RAW, 'gamma')).toBe(false);
  });
});

describe('shouldOmitLine — global variables in match text', () => {
  it('expands {vars} from the connection\'s globals before matching', () => {
    jest.resetModules();
    window.localStorage.clear();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const globals = require('./globalScriptsStore') as typeof import('./globalScriptsStore');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const omit = require('./triggerOmitStore') as typeof import('./triggerOmitStore');

    globals.setGlobalVar('dsl-mud', 'target', 'Weed');
    omit.setOmitRules([{ id: 'r1', eventName: RAW, matchText: 'You hit {target}', caseInsensitive: true }], 'dsl-mud');

    expect(omit.shouldOmitLine(RAW, 'you HIT weed hard')).toBe(true);
    expect(omit.shouldOmitLine(RAW, 'you hit someone else')).toBe(false);
  });

  it('drops a rule whose variable is unset instead of matching everything', () => {
    jest.resetModules();
    window.localStorage.clear();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const omit = require('./triggerOmitStore') as typeof import('./triggerOmitStore');

    omit.setOmitRules([{ id: 'r1', eventName: RAW, matchText: '{nothing_set}', caseInsensitive: true }], 'dsl-mud');

    expect(omit.shouldOmitLine(RAW, 'anything at all')).toBe(false);
  });
});
