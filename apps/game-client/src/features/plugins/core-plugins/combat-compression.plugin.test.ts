import { PATTERNS, createCombatCompressionPlugin } from './combat-compression.plugin';

// Real chain-lightning output with anti-magic shell up (user capture, 2026-11-17).
const CHAIN_LIGHTNING = [
  'Your lightning does HORRID things to the Palimpsest!',
  'You are struck by your own lightning!',
  'Your lightning misses you.',
  'Your lightning hits the Palimpsest.',
  'You are struck by your own lightning!',
  'Your lightning misses you.',
  'The Palimpsest has quite a few wounds. ',
];

const ECHO = PATTERNS.find((p) => p.configKey === 'squelchSelfLightningEcho')!;
const echoRe = new RegExp(ECHO.pattern, 'm');

function enable(config: Record<string, unknown>) {
  const registerOmitRules = jest.fn();
  const api: any = {
    getConfig: () => config,
    registerOmitRules,
    registerAction: jest.fn(),
    log: jest.fn(),
  };
  createCombatCompressionPlugin().onEnable!(api);
  return registerOmitRules.mock.calls[0][0] as Array<{ pattern: string; flags: string }>;
}

const survivors = (rules: Array<{ pattern: string; flags: string }>) =>
  CHAIN_LIGHTNING.filter((line) => !rules.some((r) => new RegExp(r.pattern, r.flags).test(`${line}\n`)));

describe('self lightning echo toggle', () => {
  it('matches only the two rebound lines, including with the trailing newline of a raw line', () => {
    expect(CHAIN_LIGHTNING.filter((l) => echoRe.test(`${l}\n`))).toEqual([
      'You are struck by your own lightning!',
      'Your lightning misses you.',
      'You are struck by your own lightning!',
      'Your lightning misses you.',
    ]);
  });

  it('does not match lightning aimed at someone else or a hit on you by another caster', () => {
    expect(echoRe.test('Your lightning misses Bob.\n')).toBe(false);
    expect(echoRe.test("Bob's lightning misses you.\n")).toBe(false);
    expect(echoRe.test('You are struck by Bob\'s lightning!\n')).toBe(false);
  });

  it('is visible by default (opt-in)', () => {
    expect(ECHO.defaultSquelch).toBe(false);
    expect(survivors(enable({}))).toEqual(CHAIN_LIGHTNING);
  });

  it('hides exactly the rebound lines when switched on, leaving the damage and condition lines', () => {
    expect(survivors(enable({ squelchSelfLightningEcho: true }))).toEqual([
      'Your lightning does HORRID things to the Palimpsest!',
      'Your lightning hits the Palimpsest.',
      'The Palimpsest has quite a few wounds. ',
    ]);
  });

  it('uses its own category so the arena-observer squelch filter ignores it', () => {
    expect(ECHO.categoryLabel).toBe('Self Spell Echo');
  });
});
