import { COPILOT_BUNDLE_MARKER, DEFAULT_SETTINGS, ruleKey } from '@shatteredarchive/copilot-core';
import { DispatchEvent, ListenEvent } from '../event-emitter/event-dispatcher';
import { DEV_API_BASE } from './config';
import { getCopilotRuntime, loadCopilot } from './loader';
import { ENABLED_KEY } from './enabled';
import { SETTINGS_KEY } from './settings';

afterEach(() => localStorage.clear());

describe('getCopilotRuntime', () => {
  it('is built once and shared, so the window and the page start-up use one command gate', () => {
    const first = getCopilotRuntime();
    expect(getCopilotRuntime()).toBe(first);
    expect(getCopilotRuntime().gate).toBe(first.gate);
    first.dispose();
  });
});

describe('loadCopilot', () => {
  it('builds the plumbing and carries the bundle marker', () => {
    const copilot = loadCopilot();
    expect(copilot.marker).toBe(COPILOT_BUNDLE_MARKER);
    expect(copilot.settings.get()).toEqual(DEFAULT_SETTINGS);
    expect(copilot.gate.refusals()).toEqual([]);
    expect(typeof copilot.api.getState).toBe('function');
    copilot.dispose();
  });

  it('the command gate follows the user and Autopilot through the event bus', () => {
    const sent: string[] = [];
    const stop = ListenEvent<{ cmd: string }>('shatteredarchive:send-command', (p) => sent.push(p.cmd), { key: 'loader-test::send' });
    const copilot = loadCopilot();
    copilot.enabled.set(true); // Copilot starts off; the gate would say so first

    DispatchEvent('shatteredarchive:autopilot-status', { status: 'running' });
    expect(copilot.gate.send('look')).toEqual({ ok: false, reason: 'autopilot-running' });
    DispatchEvent('shatteredarchive:autopilot-status', { status: 'idle' });
    DispatchEvent('shatteredarchive:user-typing', { at: Date.now() });
    expect(copilot.gate.send('look')).toEqual({ ok: false, reason: 'user-typing' });
    expect(sent).toEqual([]);

    copilot.dispose();
    stop();
  });

  it('starts switched off, and its command gate refuses until the owner switches it on', () => {
    const sent: string[] = [];
    const stop = ListenEvent<{ cmd: string }>('shatteredarchive:send-command', (p) => sent.push(p.cmd), { key: 'loader-test::off' });
    const copilot = loadCopilot();
    expect(copilot.enabled.get()).toBe(false);
    expect(copilot.gate.send('look')).toEqual({ ok: false, reason: 'copilot-off' });
    expect(sent).toEqual([]);
    copilot.enabled.set(true);
    expect(localStorage.getItem(ENABLED_KEY)).toBe('true');
    expect(loadCopilot().enabled.get()).toBe(true); // a reload keeps it
    expect(copilot.gate.send('look')).toEqual({ ok: true });
    expect(sent).toEqual(['look']);
    copilot.dispose();
    stop();
  });

  it('tells the server at load only when the switch is on: off asks nothing', async () => {
    const calls: { url: string; body: string }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: unknown, init?: { body?: string }) => {
      calls.push({ url: String(url), body: String(init?.body) });
      return { ok: true, status: 200, json: async () => ({ enabled: true }) } as unknown as Response;
    }) as typeof fetch;
    try {
      loadCopilot().dispose();
      await Promise.resolve();
      expect(calls).toEqual([]);

      localStorage.setItem(ENABLED_KEY, 'true');
      loadCopilot().dispose();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(calls).toEqual([{ url: `${DEV_API_BASE}/control`, body: JSON.stringify({ enabled: true }) }]);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('follows the switch of another tab, and dispose stops it', () => {
    const copilot = loadCopilot();
    window.dispatchEvent(new StorageEvent('storage', { key: ENABLED_KEY, newValue: 'true' }));
    expect(copilot.enabled.get()).toBe(true);
    window.dispatchEvent(new StorageEvent('storage', { key: null, newValue: null }));
    expect(copilot.enabled.get()).toBe(false);
    copilot.dispose();
    window.dispatchEvent(new StorageEvent('storage', { key: ENABLED_KEY, newValue: 'true' }));
    expect(copilot.enabled.get()).toBe(false);
  });

  it('applies the settings of another tab (a storage event) and ignores other keys; dispose stops it', () => {
    const copilot = loadCopilot();
    const key = ruleKey('world', 'info');
    const written = JSON.stringify({ schemaVersion: 1, rules: { [key]: { enabled: true, threshold: 0.95 } } });

    window.dispatchEvent(new StorageEvent('storage', { key: SETTINGS_KEY, newValue: written }));
    expect(copilot.settings.get().rules[key]).toEqual({ enabled: true, threshold: 0.95 });

    window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: '{}' }));
    expect(copilot.settings.get().rules[key]).toBeDefined();

    window.dispatchEvent(new StorageEvent('storage', { key: null, newValue: null })); // storage.clear() in another tab
    expect(copilot.settings.get()).toEqual(DEFAULT_SETTINGS);

    copilot.dispose();
    window.dispatchEvent(new StorageEvent('storage', { key: SETTINGS_KEY, newValue: written }));
    expect(copilot.settings.get()).toEqual(DEFAULT_SETTINGS);
  });

  it('talks to the dev vhost, or to an allowed override stored in this browser', async () => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: unknown) => {
      calls.push(String(url));
      return { ok: true, status: 200, json: async () => ({ suggestions: [] }) } as unknown as Response;
    }) as typeof fetch;
    try {
      const first = loadCopilot();
      await first.api.getSuggestions(new AbortController().signal);
      first.dispose();

      localStorage.setItem('copilot.api.base', 'http://192.168.1.81:8080');
      const second = loadCopilot();
      await second.api.getSuggestions(new AbortController().signal);
      second.dispose();
    } finally {
      globalThis.fetch = original;
    }
    expect(calls).toEqual([`${DEV_API_BASE}/suggestions`, 'http://192.168.1.81:8080/suggestions']);
  });

  it('copes with a browser that blocks localStorage: defaults, memory only', () => {
    const blocked = {
      get localStorage(): Storage {
        throw new DOMException('blocked', 'SecurityError');
      },
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    } as unknown as Window;
    const copilot = loadCopilot(blocked);
    expect(copilot.settings.get()).toEqual(DEFAULT_SETTINGS);
    copilot.settings.set({ ...DEFAULT_SETTINGS, staleAfterSeconds: 120 });
    expect(copilot.settings.get().staleAfterSeconds).toBe(120);
    copilot.dispose();
    expect(blocked.removeEventListener).toHaveBeenCalledWith('storage', expect.any(Function));
  });
});

describe('loadCopilot and the map window history', () => {
  it('offers the server rooms to the add-room flow while loaded, asking nothing while the switch is off, and withdraws them on dispose', async () => {
    const { findHistory, __resetHistorySourcesForTests } = await import('../worldmap/mine/history');
    __resetHistorySourcesForTests();
    const copilot = loadCopilot();
    const calls: string[] = [];
    copilot.api.nearRooms = async (world) => (calls.push(world), { ok: true, value: [{ title: 'Hall', visits: 1, sameExits: true, exits: [] }] });
    const signal = new AbortController().signal;
    copilot.enabled.set(false);
    expect(await findHistory('dsl', { title: 'Hall', exits: [] }, signal)).toBeNull();
    expect(calls).toEqual([]);
    copilot.enabled.set(true);
    expect((await findHistory('dsl', { title: 'Hall', exits: [] }, signal))?.label).toBe('your Copilot history');
    expect(calls).toEqual(['dsl']);
    copilot.dispose();
    expect(await findHistory('dsl', { title: 'Hall', exits: [] }, signal)).toBeNull();
  });
});
