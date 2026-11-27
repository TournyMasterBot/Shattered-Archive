import {
  DEFAULT_LAG_MS,
  MAX_LAG_ALLOWANCE_MS,
  abilityNameFromCommand,
  buildTimingIndex,
  cooldownSecFromLag,
  effectiveLagMs,
  lagAllowanceMs,
  refreshTicksFromDuration,
  serverLagMsFor,
} from './autoleveling-lag';

describe('effectiveLagMs (L40)', () => {
  it('is the largest of the configured, learned and server values', () => {
    expect(effectiveLagMs(2, 1.5, 3000)).toBe(3000);
    expect(effectiveLagMs(2, 2.5, 1000)).toBe(2500);
    expect(effectiveLagMs(4, 1, 500)).toBe(4000);
  });

  it('ignores unknown, zero, negative and non-finite values', () => {
    expect(effectiveLagMs(null, undefined, 1200)).toBe(1200);
    expect(effectiveLagMs(0, 0, null)).toBe(0);
    expect(effectiveLagMs(-3, Number.NaN, -10)).toBe(0);
    expect(effectiveLagMs(undefined, 0.5, undefined)).toBe(500);
  });
});

describe('lagAllowanceMs', () => {
  const now = 100_000;

  it('is zero with nothing sent, and for commands long past', () => {
    expect(lagAllowanceMs([], now)).toBe(0);
    expect(lagAllowanceMs([{ at: now - 40_000, lagMs: 5000 }], now)).toBe(0);
    expect(lagAllowanceMs([{ at: now - 10_000, lagMs: 2000 }], now)).toBe(0); // already finished
  });

  it('is what is left of one recent command', () => {
    expect(lagAllowanceMs([{ at: now - 500, lagMs: 1500 }], now)).toBe(1000);
    expect(lagAllowanceMs([{ at: now, lagMs: DEFAULT_LAG_MS }], now)).toBe(1000);
  });

  it('commands queue one behind the other: three casts sent together keep the game busy for the sum', () => {
    const sends = [0, 1, 2].map((i) => ({ at: now - 100 + i, lagMs: 1500 }));
    expect(lagAllowanceMs(sends, now)).toBe(4400); // 1400 left of the first, then two more of 1500
  });

  it('a gap between sends lets the queue empty: only the later burst counts', () => {
    const sends = [
      { at: now - 20_000, lagMs: 3000 },
      { at: now - 200, lagMs: 1000 },
    ];
    expect(lagAllowanceMs(sends, now)).toBe(800);
  });

  it('is capped at the maximum, and ignores a send dated in the future', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ at: now - 1000 + i, lagMs: 5000 }));
    expect(lagAllowanceMs(many, now)).toBe(MAX_LAG_ALLOWANCE_MS);
    expect(lagAllowanceMs([{ at: now + 5000, lagMs: 3000 }], now)).toBe(0);
  });

  it('does not depend on the order the sends are given in, and does not change its input', () => {
    const a = { at: now - 300, lagMs: 1000 };
    const b = { at: now - 100, lagMs: 1000 };
    const input = [b, a];
    expect(lagAllowanceMs(input, now)).toBe(lagAllowanceMs([a, b], now));
    expect(input).toEqual([b, a]);
  });
});

describe('buildTimingIndex', () => {
  const ab = (name: string, extra: { durationTicks?: number; lagMs?: number } = {}) => ({ name, ...extra });

  it('indexes by lowercase name and keeps only abilities that have a timing', () => {
    const index = buildTimingIndex([{ abilities: [ab('Frenzy', { durationTicks: 18, lagMs: 3800 }), ab('Kick'), ab(' Fly ', { lagMs: 3000 })] }]);
    expect([...index.keys()].sort()).toEqual(["fly", "frenzy"]);
    expect(index.get('frenzy')).toEqual({ durationTicks: 18, lagMs: 3800 });
    expect(index.get('fly')).toEqual({ lagMs: 3000 });
  });

  it('an ability learned by several classes is one entry; if they disagree the larger numbers win, and a 0 is kept', () => {
    const index = buildTimingIndex([
      { abilities: [ab('Armor', { durationTicks: 0, lagMs: 0 }), ab('Frenzy', { lagMs: 3000 })] },
      { abilities: [ab('Armor', { lagMs: 0 }), ab('Frenzy', { durationTicks: 18, lagMs: 3800 })] },
    ]);
    expect(index.get('armor')).toEqual({ durationTicks: 0, lagMs: 0 });
    expect(index.get('frenzy')).toEqual({ durationTicks: 18, lagMs: 3800 });
  });

  it('an empty catalog is an empty index', () => {
    expect(buildTimingIndex([]).size).toBe(0);
  });
});

describe('abilityNameFromCommand and serverLagMsFor', () => {
  it.each([
    ["cast 'frenzy'", 'frenzy'],
    ["cast 'frenzy' elf", 'frenzy'],
    ["c 'Pass Door' self", 'pass door'],
    ['cast frenzy', 'frenzy'],
    ['C sanctuary', 'sanctuary'],
    ['kick orc', 'kick'],
    ['  bash  ', 'bash'],
    ['kick', 'kick'],
  ])('%s is %s', (cmd, name) => expect(abilityNameFromCommand(cmd)).toBe(name));

  it.each([[''], ['   '], [undefined as unknown as string]])('%p names nothing', (cmd) => expect(abilityNameFromCommand(cmd)).toBeNull());

  it('finds the lag by name, and is null for a missing index, an unknown ability, an ability with only a duration and an empty command', () => {
    const index = buildTimingIndex([{ abilities: [{ name: 'Frenzy', lagMs: 3800 }, { name: 'Sanctuary', durationTicks: 12 }] }]);
    expect(serverLagMsFor(index, "cast 'frenzy' x")).toBe(3800);
    expect(serverLagMsFor(index, "cast 'sanctuary'")).toBeNull();
    expect(serverLagMsFor(index, "cast 'nothing'")).toBeNull();
    expect(serverLagMsFor(index, '')).toBeNull();
    expect(serverLagMsFor(null, "cast 'frenzy'")).toBeNull();
    expect(serverLagMsFor(undefined, "cast 'frenzy'")).toBeNull();
  });
});

describe('the defaults taken from the feed (L39)', () => {
  it('a tick-gated buff recasts one tick before its duration runs out, never less than every tick, and falls back when the duration is unknown', () => {
    expect(refreshTicksFromDuration(12, 6)).toBe(11);
    expect(refreshTicksFromDuration(2, 6)).toBe(1);
    expect(refreshTicksFromDuration(1, 6)).toBe(1);
    expect(refreshTicksFromDuration(0, 6)).toBe(1); // under a tick: every tick
    expect(refreshTicksFromDuration(undefined, 6)).toBe(6);
    expect(refreshTicksFromDuration(12.9, 6)).toBe(11);
  });

  it('a fight row starts with the measured lag in seconds to a tenth, and with 0 when unknown (0 measured is also 0)', () => {
    expect(cooldownSecFromLag(3800)).toBe(3.8);
    expect(cooldownSecFromLag(1850)).toBe(1.9);
    expect(cooldownSecFromLag(100)).toBe(0.1);
    expect(cooldownSecFromLag(0)).toBe(0);
    expect(cooldownSecFromLag(undefined)).toBe(0);
  });
});
