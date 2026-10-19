import type { PluginRuntimeApi } from '@shatteredarchive/types-client';
import { createTickWarningPlugin } from './tick-warning.plugin';

type Handler = (payload: unknown) => void;

/**
 * Minimal fake host: `api.onEvent` is backed by a real handler map so the plugin
 * is driven through the same subscribe/dispose contract the host gives it, and
 * `getConfig` reads a mutable object so tests can edit config between ticks.
 */
function setup(config: Record<string, unknown> = {}) {
  const handlers = new Map<string, Set<Handler>>();
  const cfg: Record<string, unknown> = { ...config };
  const writeTerminal = jest.fn();

  const api = {
    connectionId: 'test',
    pluginId: 'tick-warning',
    getConfig: () => ({ ...cfg }),
    writeTerminal,
    onEvent: (name: string, handler: Handler) => {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name)!.add(handler);
      return () => handlers.get(name)!.delete(handler);
    },
  } as unknown as PluginRuntimeApi;

  const emit = (name: string, payload: unknown = {}) => {
    handlers.get(name)?.forEach((h) => h(payload));
  };

  const plugin = createTickWarningPlugin();
  const cleanup = plugin.onEnable!(api) as (() => void) | undefined;

  return { plugin, api, cfg, writeTerminal, emit, cleanup, handlers };
}

describe('tick-warning plugin', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('warns once, in light red, when the HUD countdown reaches 5 seconds (defaults)', () => {
    const { emit, writeTerminal } = setup();
    emit('game:tick', { time: '6:00pm' });

    // 41s tick, HUD badge rounds to "5" from 35.5s elapsed.
    jest.advanceTimersByTime(35_400);
    expect(writeTerminal).not.toHaveBeenCalled();

    jest.advanceTimersByTime(200);
    expect(writeTerminal).toHaveBeenCalledTimes(1);
    expect(writeTerminal).toHaveBeenCalledWith('{RTick in 5 seconds!{x');
  });

  it('does not warn again for the rest of the same tick cycle', () => {
    const { emit, writeTerminal } = setup();
    emit('game:tick');

    jest.advanceTimersByTime(40_000);
    expect(writeTerminal).toHaveBeenCalledTimes(1);
  });

  it('a fresh tick resets the cycle: no early warning, then one warning per cycle', () => {
    const { emit, writeTerminal } = setup();
    emit('game:tick');
    jest.advanceTimersByTime(30_000);

    // Next tick lands before the first cycle's warning — the pending one must be dropped.
    emit('game:tick');
    jest.advanceTimersByTime(30_000);
    expect(writeTerminal).not.toHaveBeenCalled();

    jest.advanceTimersByTime(6_000);
    expect(writeTerminal).toHaveBeenCalledTimes(1);

    emit('game:tick');
    jest.advanceTimersByTime(36_000);
    expect(writeTerminal).toHaveBeenCalledTimes(2);
  });

  it('honours a custom threshold and substitutes {seconds} in the message', () => {
    const { emit, writeTerminal } = setup({ warningThresholdSec: 10 });
    emit('game:tick');

    jest.advanceTimersByTime(30_400);
    expect(writeTerminal).not.toHaveBeenCalled();
    jest.advanceTimersByTime(200);
    expect(writeTerminal).toHaveBeenCalledWith('{RTick in 10 seconds!{x');
  });

  it('honours a custom message and color', () => {
    const { emit, writeTerminal } = setup({ warningMessage: 'Heads up: {seconds}s left', warningColor: '{G' });
    emit('game:tick');

    jest.advanceTimersByTime(36_000);
    expect(writeTerminal).toHaveBeenCalledWith('{GHeads up: 5s left{x');
  });

  it('falls back to the defaults for junk config instead of warning at a nonsense time', () => {
    for (const junk of [NaN, 0, -3, 'abc', undefined, null]) {
      const { emit, writeTerminal, cleanup } = setup({ warningThresholdSec: junk });
      emit('game:tick');
      jest.advanceTimersByTime(36_000);
      expect(writeTerminal).toHaveBeenCalledWith('{RTick in 5 seconds!{x');
      cleanup?.();
    }
  });

  it('clamps a threshold longer than the tick to the last valid second', () => {
    const { emit, writeTerminal } = setup({ warningThresholdSec: 999 });
    emit('game:tick');

    jest.advanceTimersByTime(1_000);
    expect(writeTerminal).toHaveBeenCalledWith('{RTick in 40 seconds!{x');
  });

  it('falls back to the default message and color when they are blank or unknown', () => {
    const { emit, writeTerminal } = setup({ warningMessage: '   ', warningColor: '{Q' });
    emit('game:tick');

    jest.advanceTimersByTime(36_000);
    expect(writeTerminal).toHaveBeenCalledWith('{RTick in 5 seconds!{x');
  });

  it('reads config fresh each cycle, so edits apply from the next tick', () => {
    const { emit, cfg, writeTerminal } = setup();
    emit('game:tick');
    jest.advanceTimersByTime(36_000);
    expect(writeTerminal).toHaveBeenLastCalledWith('{RTick in 5 seconds!{x');

    cfg.warningThresholdSec = 8;
    cfg.warningColor = '{Y';
    emit('game:tick');
    jest.advanceTimersByTime(33_000);
    expect(writeTerminal).toHaveBeenLastCalledWith('{YTick in 8 seconds!{x');
    expect(writeTerminal).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending warning when the connection closes', () => {
    const { emit, writeTerminal } = setup();
    emit('game:tick');
    jest.advanceTimersByTime(20_000);

    emit('game:remote-server:close');
    jest.advanceTimersByTime(60_000);
    expect(writeTerminal).not.toHaveBeenCalled();
  });

  it('cleanup cancels the pending warning and unsubscribes from events', () => {
    const { emit, writeTerminal, cleanup, handlers } = setup();
    emit('game:tick');
    jest.advanceTimersByTime(20_000);

    cleanup!();
    jest.advanceTimersByTime(60_000);
    expect(writeTerminal).not.toHaveBeenCalled();

    // A tick after disable must not re-arm anything.
    expect([...handlers.values()].every((set) => set.size === 0)).toBe(true);
  });

  it('defaults in the manifest schema match the runtime fallbacks', () => {
    const { plugin } = setup();
    expect(plugin.configSchema!.defaults).toEqual({
      warningThresholdSec: 5,
      warningMessage: 'Tick in {seconds} seconds!',
      warningColor: '{R',
    });
    const keys = plugin.configSchema!.fields.map((f) => f.key);
    expect(keys).toEqual(['warningThresholdSec', 'warningMessage', 'warningColor']);
  });
});
