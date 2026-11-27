import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import SimulacrumAdminHost from './SimulacrumAdminWindow';
import { TABS } from '../features/simulacrumAdmin/tabs';
import { DispatchEvent, ListenEvent } from '../features/event-emitter/event-dispatcher';
import { DEFAULT_HOSTS, DEFAULT_PORTS } from '../features/simulacrumAdmin/connectionGate';
import { getSimulacrumAdminRuntime, type SimulacrumAdminRuntime } from '../features/simulacrumAdmin/loader';
import { createConnectionRuntime } from '../features/simulacrumAdmin/runtime';
import { createGmcpCapture } from '../features/simulacrumAdmin/gmcpCapture';
import { createCharacterInfo } from '../features/simulacrumAdmin/characterInfo';
import { createActivityLog } from '../features/simulacrumAdmin/activityLog';
import { createReplyCollector } from '../features/simulacrumAdmin/replyCollector';
import { createSender } from '../features/simulacrumAdmin/sender';

const SIM_HOST = DEFAULT_HOSTS[1];
const SIM_PORT = DEFAULT_PORTS[0];
const open = (host: string, port: number): void => {
  act(() => DispatchEvent('game:remote-server:open', { type: 'socket-opened', host, port, receivedTimestamp: 'x' }));
};
const close = (): void => {
  act(() => DispatchEvent('game:remote-server:close', { type: 'socket-closed', payload: {} }));
};

let runtime: SimulacrumAdminRuntime;
const realFetch = global.fetch;
beforeEach(() => {
  // opening the World tab reads the world; by default that read never answers, so no state changes after a test ends
  global.fetch = jest.fn(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;
  window.localStorage.clear();
  const connection = createConnectionRuntime({ additions: () => ({ hosts: [], ports: [] }) });
  const gmcp = createGmcpCapture({ isActive: () => connection.getState().active });
  const character = createCharacterInfo(gmcp);
  const replies = createReplyCollector();
  const activity = createActivityLog();
  const sender = createSender({ isActive: () => connection.getState().active, collector: replies, activity });
  runtime = {
    marker: 'test',
    connection,
    gmcp,
    character,
    activity,
    sender,
    dispose: () => {
      replies.dispose();
      character.dispose();
      gmcp.dispose();
      connection.dispose();
    },
  };
});
afterEach(() => {
  runtime.dispose();
  global.fetch = realFetch;
});

function renderHost(isOpen = true) {
  const onClose = jest.fn();
  const onAvailableChange = jest.fn();
  const view = render(<SimulacrumAdminHost isOpen={isOpen} onClose={onClose} onAvailableChange={onAvailableChange} runtime={runtime} />);
  const rerender = (next: boolean) =>
    view.rerender(<SimulacrumAdminHost isOpen={next} onClose={onClose} onAvailableChange={onAvailableChange} runtime={runtime} />);
  return { ...view, onClose, onAvailableChange, rerender };
}

describe('SimulacrumAdminHost: when the window shows', () => {
  it('shows nothing and reports "not available" before a connection exists', () => {
    const { onAvailableChange } = renderHost(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onAvailableChange).toHaveBeenLastCalledWith(false);
  });

  it('shows nothing on the live DSL game even when asked to open (E3)', () => {
    const { onAvailableChange } = renderHost(true);
    open('dsl-mud.org', 4000);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onAvailableChange).not.toHaveBeenCalledWith(true);
  });

  it('reports "available" on the simulacrum but stays closed until it is opened', () => {
    const { onAvailableChange, rerender } = renderHost(false);
    open(SIM_HOST, SIM_PORT);
    expect(onAvailableChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole('dialog')).toBeNull();

    rerender(true);
    expect(screen.getByRole('dialog', { name: 'Simulacrum Admin' })).toBeInTheDocument();
  });

  it('shows the connection it is on', () => {
    renderHost(true);
    open(SIM_HOST, SIM_PORT);
    expect(screen.getByRole('status')).toHaveTextContent(`Connected to ${SIM_HOST}:${SIM_PORT}`);
  });

  it('disappears when the connection closes, and when it moves to another host (E2)', () => {
    const { onAvailableChange } = renderHost(true);
    open(SIM_HOST, SIM_PORT);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    close();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onAvailableChange).toHaveBeenLastCalledWith(false);

    open(SIM_HOST, SIM_PORT);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    open('dsl-mud.org', 4000);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('tells the page it is gone when it unmounts, so the menu entry does not outlive it', () => {
    const { onAvailableChange, unmount } = renderHost(false);
    open(SIM_HOST, SIM_PORT);
    expect(onAvailableChange).toHaveBeenLastCalledWith(true);
    unmount();
    expect(onAvailableChange).toHaveBeenLastCalledWith(false);
  });
});

describe('SimulacrumAdminHost: the page runtime', () => {
  it('uses the page shared runtime when none is given', () => {
    const shared = getSimulacrumAdminRuntime();
    try {
      const onAvailableChange = jest.fn();
      render(<SimulacrumAdminHost isOpen onClose={jest.fn()} onAvailableChange={onAvailableChange} />);
      open(SIM_HOST, SIM_PORT);
      expect(onAvailableChange).toHaveBeenLastCalledWith(true);
      expect(screen.getByRole('dialog', { name: 'Simulacrum Admin' })).toBeInTheDocument();
    } finally {
      shared.dispose();
    }
  });
});

describe('SimulacrumAdminWindow: shell', () => {
  function openWindow() {
    const view = renderHost(true);
    open(SIM_HOST, SIM_PORT);
    return view;
  }

  it('is a dialog without modal semantics, so the page behind stays usable', () => {
    openWindow();
    const dialog = screen.getByRole('dialog', { name: 'Simulacrum Admin' });
    expect(dialog).not.toHaveAttribute('aria-modal');
    expect(dialog).toHaveStyle({ position: 'fixed', zIndex: '5000' }); // the only open window: the bottom of the shared stack
  });

  it('starts at the left so it does not sit on top of the Copilot window', () => {
    openWindow();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveStyle({ left: '24px', top: '96px', width: '560px', height: '440px' });
  });

  it('has the six tabs, Players selected first, and one panel per tab that all stay in the page', () => {
    openWindow();
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Players', 'World', 'Server', 'Commands', 'GMCP', 'Activity']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false']);

    const panels = screen.getAllByRole('tabpanel', { hidden: true });
    expect(panels).toHaveLength(TABS.length);
    expect(panels.map((p) => p.hasAttribute('hidden'))).toEqual([false, true, true, true, true, true]);
  });

  it('switches freely between any tabs, hiding only the others, with no order imposed', () => {
    openWindow();
    for (const label of ['GMCP', 'World', 'Activity', 'Players', 'Commands', 'Server']) {
      fireEvent.click(screen.getByRole('tab', { name: label }));
      expect(screen.getByRole('tab', { name: label })).toHaveAttribute('aria-selected', 'true');
      const visible = screen.getAllByRole('tabpanel');
      expect(visible).toHaveLength(1);
      expect(visible[0]).toHaveAttribute('aria-labelledby', screen.getByRole('tab', { name: label }).id);
    }
  });

  it('has real Commands and Activity panels, and a command run from the window shows up in Activity', async () => {
    jest.useFakeTimers();
    try {
      const sentLines: string[] = [];
      const stopListening = ListenEvent<{ cmd: string }>('shatteredarchive:send-command', (p) => sentLines.push(p.cmd), { key: 'window-test' });
      openWindow();
      fireEvent.click(screen.getByRole('tab', { name: 'Commands' }));
      expect(screen.getByRole('listbox', { name: 'Commands' })).toBeInTheDocument();
      fireEvent.click(within(screen.getByRole('listbox', { name: 'Commands' })).getByRole('option', { name: /^stat\b/ }));
      fireEvent.change(screen.getByLabelText('Character'), { target: { value: 'Testchar' } });
      fireEvent.click(screen.getByRole('button', { name: 'Run' }));
      await act(async () => {
        for (let i = 0; i < 10; i++) await Promise.resolve();
        DispatchEvent('game:remote-server:raw', { type: 'raw', receivedTimestamp: 'x', payload: 'Name: Testchar\n\r' });
        jest.advanceTimersByTime(600);
      });
      expect(sentLines).toEqual(['stat Testchar']);

      fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
      const list = screen.getByRole('list', { name: 'Sent commands' });
      expect(within(list).getAllByRole('listitem')).toHaveLength(1);
      expect(list).toHaveTextContent('stat Testchar');

      stopListening();
    } finally {
      jest.useRealTimers();
    }
  });

  it('reads the world only when the World tab (or a room picker) is first opened, and shares the target between Players and World', async () => {
    const original = global.fetch;
    const urls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      urls.push(url);
      const body = url.endsWith('/api/map')
        ? { areas: [{ file: 'alpha.are', name: 'Alpha Keep', minVnum: 3000, maxVnum: 3099, rooms: 1 }] }
        : { rooms: [{ vnum: 3001, name: 'The Great Hall' }] };
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
    }) as unknown as typeof fetch;
    try {
      openWindow();
      fireEvent.change(screen.getByLabelText('Target'), { target: { value: 'Testchar' } });
      await act(async () => undefined);
      expect(urls).toEqual([]); // nothing read for a window that has not opened the World tab

      fireEvent.click(screen.getByRole('tab', { name: 'World' }));
      const area = await screen.findByRole('button', { name: /Alpha Keep/ });
      expect(urls).toEqual(['https://simulacrum-admin.shatteredarchive.dev/api/map']);
      fireEvent.click(area);
      fireEvent.click(await screen.findByRole('button', { name: 'Pick room 3001 The Great Hall' }));
      // the target typed on the Players tab is the one the World tab brings
      expect(screen.getByRole('button', { name: 'Bring Testchar here (transfer Testchar 3001)' })).toBeEnabled();
      expect(urls).toEqual([
        'https://simulacrum-admin.shatteredarchive.dev/api/map',
        'https://simulacrum-admin.shatteredarchive.dev/api/map/alpha.are',
      ]);
    } finally {
      global.fetch = original;
    }
  });

  it('reads the world when the Players tab opens a room picker, and uses the stored address override', async () => {
    window.localStorage.setItem('simulacrumAdmin.world.base', 'http://localhost:30080');
    const original = global.fetch;
    const urls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => ({ areas: [] }) } as unknown as Response;
    }) as unknown as typeof fetch;
    try {
      openWindow();
      fireEvent.change(screen.getByLabelText('Target'), { target: { value: 'Testchar' } });
      fireEvent.click(within(screen.getByRole('listbox', { name: 'Player commands' })).getByRole('option', { name: /^transfer/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Pick from the world…' }));
      await screen.findByText('No area matches.');
      expect(urls).toEqual(['http://localhost:30080/api/map']);
    } finally {
      global.fetch = original;
      window.localStorage.removeItem('simulacrumAdmin.world.base');
    }
  });

  it('the Server tab offers to load the area list for areload, and then lists the files', async () => {
    const original = global.fetch;
    const urls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => ({ areas: [{ file: 'alpha.are', name: 'Alpha Keep', rooms: 1 }] }) } as unknown as Response;
    }) as unknown as typeof fetch;
    try {
      openWindow();
      fireEvent.click(screen.getByRole('tab', { name: 'Server' }));
      expect(urls).toEqual([]);
      const card = screen.getByRole('region', { name: 'areload' });
      fireEvent.click(within(card).getByRole('button', { name: /^areload/ }));
      fireEvent.click(within(card).getByRole('button', { name: 'Load the area list' }));
      const select = await within(card).findByRole('combobox', { name: 'Area file' });
      await within(select).findByRole('option', { name: 'alpha.are' });
      expect(urls).toEqual(['https://simulacrum-admin.shatteredarchive.dev/api/map']);
    } finally {
      global.fetch = original;
    }
  });

  it('closes from the close button and from Escape', () => {
    const { onClose } = openWindow();
    fireEvent.click(screen.getByRole('button', { name: 'Close Simulacrum Admin' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'a' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('leaves the page behind usable: clicking and typing in the game input works while it is open (E17)', () => {
    render(<input aria-label="game-command" />);
    openWindow();
    const gameInput = screen.getByLabelText('game-command') as HTMLInputElement;
    fireEvent.click(gameInput);
    gameInput.focus();
    expect(gameInput).toHaveFocus();
    fireEvent.change(gameInput, { target: { value: 'look' } });
    expect(gameInput.value).toBe('look');

    // pressing a key on a tab does not touch the game input
    fireEvent.keyDown(screen.getByRole('tab', { name: 'GMCP' }), { key: 'x' });
    expect(gameInput.value).toBe('look');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows no level until login_data arrives, then the level but never the character name', () => {
    openWindow();
    expect(screen.queryByText(/^Level \d+$/)).toBeNull();
    act(() => {
      DispatchEvent('game:remote-server:gmcp', {
        type: 'gmcp',
        payload: 'login_data {"name":"secret-name","is_clan":false,"is_kingdom":false,"level":60,"time":"3:30pm"}',
      });
    });
    // its own element, so a long host name cannot cut it off
    expect(screen.getByText('Level 60')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(`Connected to ${SIM_HOST}:${SIM_PORT}`);
    expect(screen.getByRole('status')).not.toHaveTextContent('Level');
    expect(document.body.textContent).not.toContain('secret-name');
  });

  it('shows the GMCP received on the GMCP tab, which keeps its history across a tab switch', () => {
    openWindow();
    act(() => {
      DispatchEvent('game:remote-server:gmcp', { type: 'gmcp', payload: 'tick {"time":"9:00pm"}' });
    });
    fireEvent.click(screen.getByRole('tab', { name: 'GMCP' }));
    expect(screen.getByRole('list', { name: 'GMCP messages' })).toHaveTextContent('tick');
    fireEvent.click(screen.getByRole('tab', { name: 'World' }));
    expect(screen.queryByRole('list', { name: 'GMCP messages' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'GMCP' }));
    expect(screen.getByRole('list', { name: 'GMCP messages' })).toHaveTextContent('tick');
  });

  it('has a resize handle that is hidden from assistive technology', () => {
    openWindow();
    const handle = screen.getByTitle('Drag to resize');
    expect(handle).toHaveAttribute('aria-hidden', 'true');
  });
});
