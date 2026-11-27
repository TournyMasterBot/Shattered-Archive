// Standup and Color Kit parse their config text on every received line, memoized on the
// last text. Editing the config must take effect on the very next line.
import { createStandupPlugin } from './standup.plugin';
import { createColorKitPlugin } from './colorkit.plugin';

const RAW = 'shatteredarchive:raw-data';

describe('standup plugin', () => {
  function setup(cfg: Record<string, unknown>) {
    const sent: string[] = [];
    let current = cfg;
    const api = {
      getConfig: () => current,
      sendCommand: (c: string) => sent.push(c),
      log: jest.fn(),
    } as never;
    const plugin = createStandupPlugin();
    return { sent, api, plugin, setCfg: (next: Record<string, unknown>) => (current = next) };
  }

  it('stands up on a configured phrase, ignoring comments and blank lines', () => {
    const { sent, api, plugin } = setup({ patterns: '# note\n\n  you fall  \n', standCommand: 'stand' });
    plugin.onEvent!(api, { name: RAW, payload: 'You fall down' } as never);
    expect(sent).toEqual(['stand']);
  });

  it('picks up an edit to the patterns on the next line', () => {
    const { sent, api, plugin, setCfg } = setup({ patterns: 'old phrase', standCommand: 'stand' });

    plugin.onEvent!(api, { name: RAW, payload: 'the old phrase' } as never);
    expect(sent).toEqual(['stand']);

    setCfg({ patterns: 'new phrase', standCommand: 'stand' });
    plugin.onEvent!(api, { name: RAW, payload: 'the old phrase' } as never);
    expect(sent).toEqual(['stand']);
    plugin.onEvent!(api, { name: RAW, payload: 'a new phrase' } as never);
    expect(sent).toEqual(['stand', 'stand']);
  });

  it('does nothing without patterns, for other events, or for a plugin-written line', () => {
    const none = setup({ patterns: 123 });
    none.plugin.onEvent!(none.api, { name: RAW, payload: 'anything' } as never);
    expect(none.sent).toEqual([]);

    const s = setup({ patterns: 'fall' });
    s.plugin.onEvent!(s.api, { name: 'event:damage', payload: 'you fall' } as never);
    s.plugin.onEvent!(s.api, { name: RAW, payload: { text: 'you fall', __fromPlugin: true } } as never);
    expect(s.sent).toEqual([]);
  });

  it('falls back to the default stand command when none is configured', () => {
    const { sent, api, plugin } = setup({ patterns: 'fall', standCommand: '   ' });
    plugin.onEvent!(api, { name: RAW, payload: 'you fall' } as never);
    expect(sent).toEqual(['~st']);
  });
});

describe('color kit plugin', () => {
  function setup(rules: string) {
    const written: string[] = [];
    let cfg: Record<string, unknown> = { rules, debug: false };
    const api = {
      getConfig: () => cfg,
      writeTerminal: (d: string) => written.push(d),
      log: jest.fn(),
    } as never;
    return { written, api, plugin: createColorKitPlugin(), setRules: (r: string) => (cfg = { ...cfg, rules: r }) };
  }

  it('colors a matched line', () => {
    const { written, api, plugin } = setup('alpha | r');
    plugin.onEvent!(api, { name: RAW, payload: { rawText: 'alpha here\n' } } as never);
    expect(written).toEqual(['{ralpha here{x\n']);
  });

  it('picks up an edit to the rules on the next line', () => {
    const { written, api, plugin, setRules } = setup('alpha | r');
    plugin.onEvent!(api, { name: RAW, payload: { rawText: 'alpha here\n' } } as never);
    expect(written).toHaveLength(1);

    setRules('beta | g');
    plugin.onEvent!(api, { name: RAW, payload: { rawText: 'alpha here\n' } } as never);
    expect(written).toHaveLength(1);
    plugin.onEvent!(api, { name: RAW, payload: { rawText: 'beta here\n' } } as never);
    expect(written[1]).toBe('{gbeta here{x\n');
  });

  it('ignores comments, rules with an unknown color, and rules for other events', () => {
    const { written, api, plugin } = setup('# alpha | r\nbeta | zzz\ngamma | b | event:damage');
    plugin.onEvent!(api, { name: RAW, payload: { rawText: 'alpha beta gamma\n' } } as never);
    expect(written).toEqual([]);
  });
});
