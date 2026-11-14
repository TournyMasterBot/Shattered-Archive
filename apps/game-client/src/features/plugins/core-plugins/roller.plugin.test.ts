// apps\game-client\src\features\plugins\core-plugins\roller.plugin.test.ts
import type { HudWidgetContent, PluginRuntimeApi } from '@shatteredarchive/types-client';
import { createRollerPlugin } from './roller.plugin';
import { RollStats, formatRollStats } from './roller-stats';

const RAW = 'shatteredarchive:raw-data';

function setup(config: Record<string, unknown> = { totalTarget: 245 }) {
  const sent: string[] = [];
  const logs: string[] = [];
  const hud: Array<{ slotId: string; content: HudWidgetContent | null }> = [];
  const api = {
    connectionId: 'c',
    pluginId: 'roller',
    sendCommand: (c: string) => sent.push(c),
    log: (...a: unknown[]) => logs.push(a.join(' ')),
    getConfig: () => config,
    setHudWidget: (slotId: string, content: HudWidgetContent | null) => hud.push({ slotId, content }),
  } as unknown as PluginRuntimeApi;
  const plugin = createRollerPlugin();
  const emit = (evt: unknown) => plugin.onEvent!(api, evt as never);
  const line = (text: string) => emit({ name: RAW, payload: { text } });
  const rollLine = (str: number, int: number, wis: number, dex: number, con: number) =>
    line(`[Str: \x1b[1;37m${str}\x1b[0m  Int: ${int}  Wis: ${wis}  Dex: ${dex}  Con: ${con}]\r\n`);
  const prompt = () => line('Keep these stats? (Y/N) \n');
  const roll = (str: number, int: number, wis: number, dex: number, con: number) => {
    rollLine(str, int, wis, dex, con);
    prompt();
  };
  const lastHud = () => hud[hud.length - 1];
  return { api, plugin, sent, logs, hud, emit, line, rollLine, prompt, roll, lastHud };
}

describe('RollStats', () => {
  it('is empty until a roll is added', () => {
    expect(new RollStats().snapshot()).toBeNull();
  });

  it('computes count, average, median, min and max for an odd count', () => {
    const s = new RollStats();
    [200, 240, 210].forEach((t) => s.add(t));
    expect(s.snapshot()).toEqual({ count: 3, average: 650 / 3, median: 210, min: 200, max: 240 });
  });

  it('averages the two middle totals for an even count and handles duplicates', () => {
    const s = new RollStats();
    [100, 100, 200, 300].forEach((t) => s.add(t));
    expect(s.snapshot()).toEqual({ count: 4, average: 175, median: 150, min: 100, max: 300 });
  });

  it('keeps the min when a higher total arrives after a lower one', () => {
    const s = new RollStats();
    [100, 300].forEach((t) => s.add(t));
    expect(s.snapshot()?.min).toBe(100);
  })

  it('keeps the max when a lower total arrives after a higher one', () => {
    const s = new RollStats();
    [300, 100].forEach((t) => s.add(t));
    expect(s.snapshot()?.max).toBe(300);
  });

  it('ignores non-finite totals and clears on reset', () => {
    const s = new RollStats();
    s.add(Number.NaN);
    expect(s.count).toBe(0);
    s.add(50);
    s.reset();
    expect(s.snapshot()).toBeNull();
  });

  it('formats one line', () => {
    expect(formatRollStats({ count: 54, average: 212.37, median: 213, min: 226, max: 241 })).toBe(
      'Rolls 54 | avg 212.4 | median 213 | min 226 | max 241',
    );
  });
});

describe('roller plugin stats', () => {
  it('counts each answered roll and publishes the running stats to the HUD widget', () => {
    const { plugin, api, sent, hud, roll } = setup();
    plugin.onEnable!(api);
    roll(41, 54, 46, 50, 42); // 233 -> N
    expect(hud[hud.length - 1].content).toEqual({ label: 'Rolls 1', value: 'avg 233.0 · med 233 · min 233 · max 233' });
    roll(60, 60, 60, 60, 60); // 300 -> Y
    expect(hud[hud.length - 1].content).toEqual({ label: 'Rolls 2', value: 'avg 266.5 · med 266.5 · min 233 · max 300' });
    roll(50, 50, 50, 50, 50); // 250 -> Y

    expect(sent).toEqual(['N', 'Y', 'Y']);
    expect(hud[hud.length - 1]).toEqual({
      slotId: 'hud.rightColumn',
      content: { label: 'Rolls 3', value: 'avg 261.0 · med 250 · min 233 · max 300' },
    });
  });

  it('starts a fresh session on enable and clears the widget on disable', () => {
    const { plugin, api, hud, roll } = setup();
    plugin.onEnable!(api);
    roll(60, 60, 60, 60, 60);
    plugin.onEnable!(api);
    expect(hud[hud.length - 1]).toEqual({ slotId: 'hud.rightColumn', content: null });
    roll(10, 10, 10, 10, 10);
    expect(hud[hud.length - 1].content).toEqual({ label: 'Rolls 1', value: 'avg 50.0 · med 50 · min 50 · max 50' });

    plugin.onDisable!(api);
    expect(hud[hud.length - 1]).toEqual({ slotId: 'hud.rightColumn', content: null });
  });

  it('works when the host provides no HUD API', () => {
    const { plugin, api, sent, roll } = setup();
    (api as unknown as { setHudWidget?: unknown }).setHudWidget = undefined;
    plugin.onEnable!(api);
    roll(60, 60, 60, 60, 60);
    plugin.onDisable!(api);
    expect(sent).toEqual(['Y']);
  });
});

describe('roller plugin event filtering', () => {
  it('ignores missing events, other events, plugin-originated payloads and empty lines', () => {
    const { emit, rollLine, sent, hud } = setup();
    rollLine(60, 60, 60, 60, 60);
    emit(undefined);
    emit({ name: 'something:else', payload: { text: 'Keep these stats?' } });
    emit({ name: RAW, payload: { text: 'Keep these stats?', __fromPlugin: true } });
    emit({ name: RAW, payload: undefined });
    emit({ name: RAW, payload: { text: '' } });
    expect(sent).toEqual([]);
    expect(hud).toEqual([]);
  });

  it('accepts a bare string payload', () => {
    const { emit, sent } = setup();
    emit({ name: RAW, payload: '[Str: 60 Int: 60 Wis: 60 Dex: 60 Con: 60]' });
    emit({ name: RAW, payload: 'Keep these stats? (Y/N)' });
    expect(sent).toEqual(['Y']);
  });

  it.each(['Keep these stats? (Y/N)', 'Your selection?', 'do you keep these?'])(
    'treats %j as a decision prompt',
    (text) => {
      const { rollLine, line, sent } = setup();
      rollLine(60, 60, 60, 60, 60);
      line(text);
      expect(sent).toEqual(['Y']);
    },
  );

  it('does not treat unrelated text as a prompt', () => {
    const { rollLine, line, sent } = setup();
    rollLine(60, 60, 60, 60, 60);
    line('You are recreating.');
    expect(sent).toEqual([]);
  });

  it('answers only once per roll', () => {
    const { roll, prompt, sent } = setup();
    roll(60, 60, 60, 60, 60);
    prompt();
    expect(sent).toEqual(['Y']);
  });

  it('ignores a prompt with no roll before it', () => {
    const { prompt, sent, hud } = setup();
    prompt();
    expect(sent).toEqual([]);
    expect(hud).toEqual([]);
  });

  it('keeps answering the same way with debug logging on', () => {
    const { roll, sent, hud, prompt } = setup({ totalTarget: 245, debug: true });
    prompt(); // ignored: no roll
    roll(60, 60, 60, 60, 60);
    expect(sent).toEqual(['Y']);
    expect(hud).toHaveLength(1);
  });

  it('still answers and publishes stats when the debug setting is not a boolean', () => {
    const { roll, sent, lastHud } = setup({ totalTarget: 245, debug: 'yes' });
    roll(60, 60, 60, 60, 60);
    expect(sent).toEqual(['Y']);
    expect(lastHud().content).toEqual({ label: 'Rolls 1', value: 'avg 300.0 · med 300 · min 300 · max 300' });
  });
});

describe('roller plugin roll parsing', () => {
  it('ignores lines that lack Str/Int or have fewer than three stats', () => {
    const { line, prompt, sent } = setup({});
    line('Wis: 50 Dex: 50 Con: 50');
    prompt();
    line('Str: 50 Int: 50');
    prompt();
    line('The strong mint is here, strength 20 intellect 30 and more');
    prompt();
    expect(sent).toEqual([]);
  });

  it('accepts a roll with only three stats and rejects it when a required stat is missing', () => {
    const accept = setup({});
    accept.line('Str: 50 Int: 50 Wis: 50');
    accept.prompt();
    expect(accept.sent).toEqual(['Y']);

    const reject = setup({ minDex: 10 });
    reject.line('Str: 50 Int: 50 Wis: 50');
    reject.prompt();
    expect(reject.sent).toEqual(['N']);
  });

  it('reads stats written with = and without separators, case-insensitively', () => {
    const { line, prompt, sent, lastHud } = setup({ totalTarget: 150 });
    line('STR=30 INT 30 wis:30 dex = 30 CON 30');
    prompt();
    expect(sent).toEqual(['Y']);
    expect(lastHud().content?.value).toBe('avg 150.0 · med 150 · min 150 · max 150');
  });
});

describe('roller plugin thresholds', () => {
  it('accepts a total equal to the target and rejects one below it', () => {
    const { roll, sent } = setup({ totalTarget: 250 });
    roll(50, 50, 50, 50, 50);
    roll(50, 50, 50, 50, 49);
    expect(sent).toEqual(['Y', 'N']);
  });

  it.each([
    ['minStr', [49, 60, 60, 60, 60]],
    ['minInt', [60, 49, 60, 60, 60]],
    ['minWis', [60, 60, 49, 60, 60]],
    ['minDex', [60, 60, 60, 49, 60]],
    ['minCon', [60, 60, 60, 60, 49]],
  ] as const)('rejects a roll below %s and accepts it at the minimum', (key, low) => {
    const { roll, sent } = setup({ [key]: 50 });
    roll(...(low as unknown as [number, number, number, number, number]));
    const atMin = [...low].map((v) => Math.max(v, 50)) as [number, number, number, number, number];
    roll(...atMin);
    expect(sent).toEqual(['N', 'Y']);
  });

  it('accepts anything when no thresholds are configured', () => {
    const { roll, sent } = setup({});
    roll(1, 1, 1, 1, 1);
    expect(sent).toEqual(['Y']);
  });

  it('reads numeric thresholds given as strings and skips blank, non-numeric and non-finite ones', () => {
    const asString = setup({ totalTarget: ' 250 ' });
    asString.roll(50, 50, 50, 50, 49);
    asString.roll(50, 50, 50, 50, 50);
    expect(asString.sent).toEqual(['N', 'Y']);

    for (const value of ['', '   ', 'abc', Number.POSITIVE_INFINITY, null, true]) {
      const s = setup({ totalTarget: value });
      s.roll(1, 1, 1, 1, 1);
      expect(s.sent).toEqual(['Y']);
    }
  });
});

describe('roller plugin timing', () => {
  let now = 0;
  let spy: jest.SpyInstance;

  beforeEach(() => {
    now = 1_000_000;
    spy = jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => spy.mockRestore());

  it('answers a prompt that arrives within five seconds of the roll', () => {
    const { rollLine, prompt, sent } = setup({});
    rollLine(60, 60, 60, 60, 60);
    now += 5000;
    prompt();
    expect(sent).toEqual(['Y']);
  });

  it('ignores a prompt that arrives more than five seconds after the roll', () => {
    const { rollLine, prompt, sent, hud } = setup({}) as ReturnType<typeof setup>;
    rollLine(60, 60, 60, 60, 60);
    now += 5001;
    prompt();
    expect(sent).toEqual([]);
    expect(hud).toEqual([]);
  });

  it('ignores a prompt stamped before the roll (clock stepped back)', () => {
    const { rollLine, prompt, sent } = setup({});
    rollLine(60, 60, 60, 60, 60);
    now -= 100;
    prompt();
    expect(sent).toEqual([]);
  });

  it('ignores a prompt when the roll was stamped at time zero', () => {
    now = 0;
    const { rollLine, prompt, sent } = setup({});
    rollLine(60, 60, 60, 60, 60);
    prompt();
    expect(sent).toEqual([]);
  });
});

describe('roller plugin metadata', () => {
  it('exports itself as a shattered-archive plugin', () => {
    const plugin = createRollerPlugin();
    expect(plugin.manifest.id).toBe('roller');
    expect(plugin.exportPlugin!()).toEqual({
      format: 'shattered-archive-plugin-v1',
      pluginId: 'roller',
      name: 'Roller',
      version: '0.0.1',
      description: 'Auto-accept/reject stat rolls based on thresholds.',
      payload: {},
    });
  });
});

describe('roller plugin decisions on every threshold', () => {
  const all = { totalTarget: 240, minStr: 40, minInt: 35, minWis: 35, minDex: 35, minCon: 35 };

  it('accepts a roll that meets every threshold', () => {
    const { sent, roll } = setup(all);
    roll(50, 50, 50, 50, 50); // 250
    expect(sent).toEqual(['Y']);
  });

  it.each([
    ['STR', [39, 60, 60, 60, 60]],
    ['INT', [60, 34, 60, 60, 60]],
    ['WIS', [60, 60, 34, 60, 60]],
    ['DEX', [60, 60, 60, 34, 60]],
    ['CON', [60, 60, 60, 60, 34]],
  ] as const)('rejects a roll whose %s alone is under its minimum, even with a high total', (_stat, stats) => {
    const { sent, roll } = setup(all);
    roll(...(stats as unknown as [number, number, number, number, number])); // totals of 273 to 299 are over the target
    expect(sent).toEqual(['N']);
  });

  it('rejects a roll under the total target even when every single stat is fine', () => {
    const { sent, roll } = setup(all);
    roll(45, 40, 40, 40, 40); // 205
    expect(sent).toEqual(['N']);
  });

  it('answers with no thresholds set: nothing to fail, so it accepts', () => {
    const { sent, roll } = setup({});
    roll(10, 10, 10, 10, 10);
    expect(sent).toEqual(['Y']);
  });
});

describe('roller plugin when the clock runs backwards', () => {
  it('does not answer a prompt that arrives with an earlier time than the roll it follows, and answers the next roll normally', () => {
    const now = jest.spyOn(Date, 'now');
    try {
      const { sent, hud, rollLine, prompt, roll } = setup({ totalTarget: 245 });
      now.mockReturnValue(20_000);
      rollLine(60, 60, 60, 60, 60);
      now.mockReturnValue(19_000); // the system clock stepped back before the prompt arrived
      prompt();
      expect(sent).toEqual([]);
      expect(hud).toEqual([]);

      now.mockReturnValue(30_000);
      roll(60, 60, 60, 60, 60);
      expect(sent).toEqual(['Y']);
    } finally {
      now.mockRestore();
    }
  });
});

describe('roller plugin with a partial roll and with the debug setting on', () => {
  it('treats a stat the roll line leaves out as zero against its minimum, so a three-stat line cannot pass a DEX or CON minimum', () => {
    const { sent, line, prompt } = setup({ totalTarget: 100, minDex: 30, minCon: 30 });
    line('[Str: 60  Int: 60  Wis: 60]\r\n');
    prompt();
    expect(sent).toEqual(['N']);
  });

  it('a three-stat line with no minimum on the missing stats is answered by the total alone', () => {
    const { sent, line, prompt } = setup({ totalTarget: 150 });
    line('[Str: 60  Int: 60  Wis: 60]\r\n');
    prompt();
    expect(sent).toEqual(['Y']);
  });

  it('with debug on, a prompt that comes before any roll and one that comes with an earlier clock are both ignored (nothing sent)', () => {
    const now = jest.spyOn(Date, 'now');
    try {
      const { sent, rollLine, prompt } = setup({ totalTarget: 245, debug: true });
      now.mockReturnValue(1_000);
      prompt(); // no roll yet
      expect(sent).toEqual([]);
      now.mockReturnValue(20_000);
      rollLine(60, 60, 60, 60, 60);
      now.mockReturnValue(19_000);
      prompt(); // the clock stepped back
      expect(sent).toEqual([]);
    } finally {
      now.mockRestore();
    }
  });

  it('a prompt more than five seconds after the roll is ignored', () => {
    const now = jest.spyOn(Date, 'now');
    try {
      const { sent, rollLine, prompt } = setup({ totalTarget: 245 });
      now.mockReturnValue(10_000);
      rollLine(60, 60, 60, 60, 60);
      now.mockReturnValue(15_001);
      prompt();
      expect(sent).toEqual([]);
    } finally {
      now.mockRestore();
    }
  });
});

describe('roller plugin when one stat is unreadable in the roll line', () => {
  it.each([
    ['STR', '[Str: x  Int: 60  Wis: 60  Dex: 60  Con: 60]', { minStr: 30 }],
    ['INT', '[Str: 60  Int: x  Wis: 60  Dex: 60  Con: 60]', { minInt: 30 }],
    ['WIS', '[Str: 60  Int: 60  Wis: x  Dex: 60  Con: 60]', { minWis: 30 }],
    ['DEX', '[Str: 60  Int: 60  Wis: 60  Dex: x  Con: 60]', { minDex: 30 }],
    ['CON', '[Str: 60  Int: 60  Wis: 60  Dex: 60  Con: x]', { minCon: 30 }],
  ] as const)('counts an unreadable %s as zero against its minimum: the roll is rejected', (_stat, text, minimum) => {
    const { sent, line, prompt } = setup({ totalTarget: 100, ...minimum });
    line(`${text}\r\n`);
    prompt();
    expect(sent).toEqual(['N']);
  });
});
