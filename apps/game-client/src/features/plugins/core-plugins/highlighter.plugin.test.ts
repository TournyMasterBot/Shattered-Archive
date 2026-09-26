import type { PluginRuntimeApi } from '@shatteredarchive/types-client';
import { DispatchEvent, ListenEvent } from '../../event-emitter/event-dispatcher';
import { createHighlighterPlugin } from './highlighter.plugin';
import { setPerson } from './peopleDb';

const CHAT_LINE = 'shatteredarchive:chat-line';
const RAW = 'shatteredarchive:raw-data';
const chatLine = (rawText: string) => DispatchEvent(CHAT_LINE, { rawText });
const raw = (rawText: string) => DispatchEvent(RAW, { rawText });

function setup(config: Record<string, unknown> = {}) {
  const active = new Map<string, () => void>();
  const cfg: Record<string, unknown> = { debug: false, ...config };
  const writeTerminal = jest.fn();
  const log = jest.fn();
  const registerOmitRules = jest.fn();

  const api = {
    connectionId: 'test',
    pluginId: 'highlighter',
    log,
    error: jest.fn(),
    writeTerminal,
    registerOmitRules,
    registerAction: jest.fn(),
    getConfig: () => ({ ...cfg }),
    onEvent: (name: string, handler: (payload: unknown) => void) => {
      active.get(name)?.();
      const dispose = ListenEvent<any>(name, handler, { key: `highlighter.test::${name}` });
      active.set(name, dispose);
      return () => {
        dispose();
        if (active.get(name) === dispose) active.delete(name);
      };
    },
  } as unknown as PluginRuntimeApi;

  const plugin = createHighlighterPlugin();
  const cleanup = plugin.onEnable!(api) as () => void;

  return { plugin, writeTerminal, log, registerOmitRules, listenerCount: () => active.size, dispose: () => cleanup() };
}

describe('highlighter plugin — gossip via shatteredarchive:chat-line', () => {
  let current: ReturnType<typeof setup> | null = null;

  beforeEach(() => {
    setPerson('Vyraek', { level: 49, race: 'Yinn', class: 'Cru', org: 'Bloodlust', orgType: 'clan' });
    setPerson('Vyar', { level: 25, race: 'Yinn', class: 'Shu', org: 'AR', orgType: 'kingdom' });
  });

  afterEach(() => {
    current?.dispose();
    current = null;
  });

  const start = (config?: Record<string, unknown>) => (current = setup(config));

  it('colorizes and writes a clan-gossip line (cgossip)', () => {
    const t = start();
    chatLine("Vyraek clan gossips 'anyone need a hand?'");

    expect(t.writeTerminal).toHaveBeenCalledTimes(1);
    const written = t.writeTerminal.mock.calls[0][0] as string;
    expect(written).toContain('Vyraek');
    expect(written).toContain('{r'); // Bloodlust's clan color
  });

  it('colorizes and writes a plain gossip line — the old regex never covered this', () => {
    const t = start();
    chatLine("Vyar gossips 'hello world'");

    expect(t.writeTerminal).toHaveBeenCalledTimes(1);
    expect(t.writeTerminal.mock.calls[0][0]).toContain('Vyar');
  });

  it('writes the original text unchanged (with a trailing reset) when no known name is in the line', () => {
    const t = start();
    chatLine("SomeStranger gossips 'hi'");

    expect(t.writeTerminal).toHaveBeenCalledWith("SomeStranger gossips 'hi'\n");
  });

  it('ignores non-gossip chat subtypes (say, tell, yell, ooc, …)', () => {
    const t = start();
    chatLine("Vyraek says 'hello'");
    chatLine('Vyraek tells you \'psst\'');
    chatLine("Vyraek yells 'help!'");

    expect(t.writeTerminal).not.toHaveBeenCalled();
  });

  it('ignores non-chat-shaped text on shatteredarchive:chat-line', () => {
    const t = start();
    chatLine('You swing your sword at the orc.');

    expect(t.writeTerminal).not.toHaveBeenCalled();
  });

  it('does not react to gossip-shaped text on the raw-data event — only chat-line', () => {
    const t = start();
    raw("Vyraek clan gossips 'anyone need a hand?'\n");

    expect(t.writeTerminal).not.toHaveBeenCalled();
  });

  it('registers a gossip omit pattern on enable, independent of user rules', () => {
    const t = start();
    const lastCall = t.registerOmitRules.mock.calls.at(-1)![0] as Array<{ pattern?: string }>;

    const gossipPattern = lastCall.find((r) => r.pattern?.includes('gossip'));
    expect(gossipPattern).toBeDefined();

    // Sanity: the registered pattern actually matches the real shapes it's for.
    const re = new RegExp(gossipPattern!.pattern!, 'i');
    expect(re.test("Vyraek clan gossips 'hi'")).toBe(true);
    expect(re.test("Vyar gossips 'hi'")).toBe(true);
    expect(re.test("You gossip 'hi'")).toBe(true);
    expect(re.test("You clan gossip 'hi'")).toBe(true);
    expect(re.test('You swing your sword at the orc.')).toBe(false);
  });

  it('cleanup removes both listeners', () => {
    const t = start();
    expect(t.listenerCount()).toBe(2); // raw-data + chat-line

    t.dispose();
    current = null;

    chatLine("Vyraek clan gossips 'anyone need a hand?'");
    expect(t.writeTerminal).not.toHaveBeenCalled();
  });
});

describe('highlighter plugin — existing who-list/next-mode behavior (regression)', () => {
  let current: ReturnType<typeof setup> | null = null;

  beforeEach(() => {
    setPerson('Vyraek', { level: 49, race: 'Yinn', class: 'Cru', org: 'Bloodlust', orgType: 'clan' });
  });

  afterEach(() => {
    current?.dispose();
    current = null;
  });

  const start = (config?: Record<string, unknown>) => (current = setup(config));

  it('colorizes who-list entries after the default "Players near you:" trigger', () => {
    const t = start();
    raw('Players near you:\n[49  Yinn  Cru] [ Bloodlust ] Vyraek Atazra\n');

    const colorized = t.writeTerminal.mock.calls.find((c) => String(c[0]).includes('Vyraek'));
    expect(colorized).toBeDefined();
  });

  it('next-mode ends on a blank line', () => {
    const t = start();
    raw('Players near you:\n\n[49  Yinn  Cru] [ Bloodlust ] Vyraek Atazra\n');

    // The who-list line arrived AFTER the blank line ended next-mode, so it's
    // never colorized (and, being un-omitted for this case, never written by
    // the plugin at all — it just passes through untouched).
    const colorized = t.writeTerminal.mock.calls.find((c) => String(c[0]).includes('Vyraek'));
    expect(colorized).toBeUndefined();
  });
});
