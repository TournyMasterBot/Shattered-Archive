import { DispatchEvent } from '../event-emitter/event-dispatcher';
import { DEFAULT_HOSTS, DEFAULT_PORTS } from './connectionGate';
import { loadSimulacrumAdmin } from './loader';

const openSim = (): void =>
  DispatchEvent('game:remote-server:open', { type: 'socket-opened', host: DEFAULT_HOSTS[0], port: DEFAULT_PORTS[0], receivedTimestamp: 'x' });

describe('loadSimulacrumAdmin', () => {
  it('builds a runtime that follows the connection and carries the bundle marker', () => {
    const runtime = loadSimulacrumAdmin();
    try {
      expect(runtime.marker).toBe('sa-simulacrum-admin-local-v1');
      openSim();
      expect(runtime.connection.getState().active).toBe(true);
    } finally {
      runtime.dispose();
    }
  });

  it('takes the stored host additions from the window localStorage', () => {
    window.localStorage.setItem('simulacrumAdmin.hosts', JSON.stringify({ hosts: ['localhost'], ports: [] }));
    const runtime = loadSimulacrumAdmin();
    try {
      DispatchEvent('game:remote-server:open', { type: 'socket-opened', host: 'localhost', port: DEFAULT_PORTS[0], receivedTimestamp: 'x' });
      expect(runtime.connection.getState().active).toBe(true);
    } finally {
      runtime.dispose();
      window.localStorage.removeItem('simulacrumAdmin.hosts');
    }
  });

  it('works with a blocked localStorage: only the default hosts are accepted', () => {
    const blocked = {
      get localStorage(): Storage {
        throw new Error('blocked');
      },
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    } as unknown as Window;
    const runtime = loadSimulacrumAdmin(blocked);
    try {
      DispatchEvent('game:remote-server:open', { type: 'socket-opened', host: 'localhost', port: DEFAULT_PORTS[0], receivedTimestamp: 'x' });
      expect(runtime.connection.getState().active).toBe(false);
      openSim();
      expect(runtime.connection.getState().active).toBe(true);
    } finally {
      runtime.dispose();
    }
  });

  describe('what is captured does not outlive the connection (E2, S8)', () => {
    const gmcp = (payload: string): void => DispatchEvent('game:remote-server:gmcp', { type: 'gmcp', payload });
    const closeSocket = (): void => DispatchEvent('game:remote-server:close', { type: 'socket-closed', payload: {} });

    it('keeps the GMCP and the level while on the simulacrum, and clears both when the socket closes', () => {
      const runtime = loadSimulacrumAdmin();
      try {
        openSim();
        gmcp('tick {"time":"9:00pm"}');
        gmcp('login_data {"name":"x","is_clan":false,"is_kingdom":false,"level":60,"time":"3:30pm"}');
        expect(runtime.gmcp.getEntries().map((e) => e.pkg)).toEqual(['tick', 'login_data']);
        expect(runtime.character.getState().level).toBe(60);

        closeSocket();
        expect(runtime.gmcp.getEntries()).toEqual([]);
        expect(runtime.character.getState().level).toBeUndefined();
      } finally {
        runtime.dispose();
      }
    });

    it('clears the activity log and the wizhelp list, and ends a running reply, when the socket closes', async () => {
      jest.useFakeTimers();
      const runtime = loadSimulacrumAdmin();
      try {
        openSim();
        const raw = (payload: string): void => DispatchEvent('game:remote-server:raw', { type: 'raw', payload });
        const first = runtime.sender.refreshAvailable();
        await Promise.resolve();
        raw('stat        goto        \n\r');
        jest.advanceTimersByTime(600);
        await first;
        expect(runtime.activity.getEntries().map((e) => e.line)).toEqual(['wizhelp']);
        expect(runtime.sender.getAvailable()).toEqual(new Set(['stat', 'goto']));

        // a send is waiting for its reply when the socket closes: it ends at once, it does not hang for 4 s
        const waiting = runtime.sender.run('stat', 'char', { target: 'Testchar' });
        await Promise.resolve();
        await Promise.resolve();
        closeSocket();
        // nothing of a reply that ended with the connection is kept
        await expect(waiting).resolves.toEqual({ status: 'inactive' });
        expect(runtime.activity.getEntries()).toEqual([]);
        expect(runtime.sender.getAvailable()).toBeUndefined();
        // not connected any more: a send goes nowhere
        await expect(runtime.sender.run('stat', 'char', { target: 'Testchar' })).resolves.toEqual({ status: 'inactive' });
      } finally {
        runtime.dispose();
        jest.useRealTimers();
      }
    });

    it('clears both when the connection moves to another host', () => {
      const runtime = loadSimulacrumAdmin();
      try {
        openSim();
        gmcp('login_data {"level":60}');
        DispatchEvent('game:remote-server:open', { type: 'socket-opened', host: 'dsl-mud.org', port: 4000, receivedTimestamp: 'x' });
        expect(runtime.gmcp.getEntries()).toEqual([]);
        expect(runtime.character.getState().level).toBeUndefined();
      } finally {
        runtime.dispose();
      }
    });

    it('stores nothing from the live DSL game, not even its login (E3)', () => {
      const runtime = loadSimulacrumAdmin();
      try {
        DispatchEvent('game:remote-server:open', { type: 'socket-opened', host: 'dsl-mud.org', port: 4000, receivedTimestamp: 'x' });
        gmcp('login_data {"level":60}');
        gmcp('char_data {"hp":1}');
        expect(runtime.gmcp.getEntries()).toEqual([]);
        expect(runtime.character.getState().level).toBeUndefined();
      } finally {
        runtime.dispose();
      }
    });

    it('dispose stops capturing', () => {
      const runtime = loadSimulacrumAdmin();
      openSim();
      runtime.dispose();
      gmcp('tick {"time":"9:00pm"}');
      expect(runtime.gmcp.getEntries()).toEqual([]);
    });
  });

  it('dispose removes its listeners and the pagehide hook; pagehide disposes it', () => {
    const win = { localStorage: window.localStorage, addEventListener: jest.fn(), removeEventListener: jest.fn() } as unknown as Window;
    const runtime = loadSimulacrumAdmin(win);
    const hook = (win.addEventListener as jest.Mock).mock.calls.find(([name]) => name === 'pagehide')?.[1] as () => void;
    expect(typeof hook).toBe('function');

    hook(); // the page is going away
    expect(win.removeEventListener).toHaveBeenCalledWith('pagehide', hook);
    const before = runtime.connection.getState();
    openSim();
    expect(runtime.connection.getState()).toBe(before); // nothing listens any more
  });
});
