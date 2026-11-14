import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getCopilotRuntime } from '../features/copilot/loader';
import CopilotWindow from './CopilotWindow';

const stateBody = { connected: true, stale: false, staleAfterSeconds: 60, lastEventAgeSeconds: 1, inFight: false, room: null };
let online = true;
const original = globalThis.fetch;

beforeEach(() => {
  online = true;
  localStorage.clear();
  getCopilotRuntime().enabled.set(true); // Copilot starts off; these tests are about the window while it is on
  getCopilotRuntime().focus.set('training'); // and starts in Training; a test that needs the AI agent picks it
  getCopilotRuntime().settings.reset(); // the runtime is shared by the tests: a rule one switched on must not be toggled off by the next
  sessionStorage.clear(); // the "let Copilot drive?" answer is kept for the browser session
  globalThis.fetch = (async (url: unknown) => {
    if (!online) throw new TypeError('Failed to fetch');
    const path = new URL(String(url)).pathname;
    const body = path === '/suggestions' ? { suggestions: [] } : path === '/tickets' ? { tickets: [] } : stateBody;
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = original;
});

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));

describe('CopilotWindow', () => {
  it('renders nothing while closed', () => {
    const { container } = render(<CopilotWindow isOpen={false} onClose={() => undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is a non-modal dialog: no aria-modal, fixed in the shared window stack, and it never takes focus', async () => {
    render(<CopilotWindow isOpen onClose={() => undefined} />);
    await settle();
    const dialog = screen.getByRole('dialog', { name: 'Copilot' });
    expect(dialog).not.toHaveAttribute('aria-modal');
    expect(dialog.style.position).toBe('fixed');
    expect(dialog.style.zIndex).toBe('5000'); // the only open window: the bottom of the stack
    expect(dialog.contains(document.activeElement)).toBe(false);
    expect(document.querySelector('[class*="backdrop"], [class*="overlay"]')).toBeNull();
  });

  it('shows offline when the server cannot be reached, and says nothing is sent', async () => {
    online = false;
    render(<CopilotWindow isOpen onClose={() => undefined} />);
    await settle();
    expect(screen.getByRole('status')).toHaveTextContent('Offline');
    expect(screen.getByText(/cannot be reached/i)).toBeInTheDocument();
  });

  it('shows online when the server answers', async () => {
    render(<CopilotWindow isOpen onClose={() => undefined} />);
    await settle();
    expect(screen.getByRole('status')).toHaveTextContent('Online');
    expect(screen.getByText('No suggestions yet.')).toBeInTheDocument();
  });

  it('the page behind it stays usable: clicking an outside input focuses it, typing reaches it, and nothing is swallowed', async () => {
    const outsideClick = jest.fn();
    render(
      <div>
        <input aria-label="game command" onClick={outsideClick} />
        <CopilotWindow isOpen onClose={() => undefined} />
      </div>,
    );
    await settle();
    const input = screen.getByLabelText('game command') as HTMLInputElement;
    const down = fireEvent.mouseDown(input); // false would mean something called preventDefault on the press
    input.focus();
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: 'look' } });
    expect(down).toBe(true);
    expect(outsideClick).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('look');
  });

  it('remembers the chosen mode', async () => {
    const { unmount } = render(<CopilotWindow isOpen onClose={() => undefined} />);
    await settle();
    const select = screen.getByLabelText('Mode') as HTMLSelectElement;
    expect(select.value).toBe('exploration');
    fireEvent.change(select, { target: { value: 'battle' } });
    unmount();
    render(<CopilotWindow isOpen onClose={() => undefined} />);
    await settle();
    expect((screen.getByLabelText('Mode') as HTMLSelectElement).value).toBe('battle');
  });

  it('the close button and Escape inside the window close it', async () => {
    const onClose = jest.fn();
    render(<CopilotWindow isOpen onClose={onClose} />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Close Copilot' }));
    fireEvent.keyDown(screen.getByLabelText('Mode'), { key: 'Escape' });
    fireEvent.keyDown(screen.getByLabelText('Mode'), { key: 'a' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('closing releases its listeners and its polling', async () => {
    const calls: number[] = [];
    globalThis.fetch = (async () => {
      calls.push(1);
      return { ok: true, status: 200, json: async () => stateBody } as unknown as Response;
    }) as typeof fetch;
    const remove = jest.spyOn(window, 'removeEventListener');
    const view = render(<CopilotWindow isOpen onClose={() => undefined} />);
    await settle();
    view.rerender(<CopilotWindow isOpen={false} onClose={() => undefined} />);
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
    const before = calls.length;
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 50))));
    expect(calls.length).toBe(before);
    remove.mockRestore();
  });

  it('uses the stored API override of this browser', async () => {
    localStorage.setItem('copilot.api.base', 'http://192.168.1.81:8080');
    const urls: string[] = [];
    globalThis.fetch = (async (url: unknown) => {
      urls.push(String(url));
      return { ok: true, status: 200, json: async () => stateBody } as unknown as Response;
    }) as typeof fetch;
    render(<CopilotWindow isOpen onClose={() => undefined} />);
    await settle();
    expect(urls).toEqual(expect.arrayContaining(['http://192.168.1.81:8080/state', 'http://192.168.1.81:8080/suggestions']));
    expect(urls.every((u) => u.startsWith('http://192.168.1.81:8080/'))).toBe(true);
  });

  it('lists what the server suggests and answers through the gate it was given, posting to the same server', async () => {
    const suggestion = { id: 's1', character: 'Agate-F', createdAt: 5, mode: 'exploration', sphere: 'world', kind: 'move', command: 'north', rationale: 'The only exit.', confidence: 0.8, confidenceSource: 'model', situationKey: 'k' };
    const posts: { url: string; body: unknown }[] = [];
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === 'POST') {
        posts.push({ url: path, body: JSON.parse(String(init.body)) });
        return { ok: true, status: 201, json: async () => ({ ok: true, id: 'x', written: true }) } as unknown as Response;
      }
      const body = path === '/suggestions' ? { suggestions: [suggestion] } : path === '/tickets' ? { tickets: [] } : stateBody;
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
    }) as typeof fetch;
    const sent: string[] = [];
    const gate = { send: (c: string) => (sent.push(c), { ok: true as const }) } as unknown as import('../features/copilot/gate').CommandGate;
    render(<CopilotWindow isOpen onClose={() => undefined} gate={gate} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 20))));
    expect(sent).toEqual(['north']);
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe('/decisions');
    expect(posts[0].body).toMatchObject({ suggestionId: 's1', outcome: 'approved', command: 'north' });
  });

  it('switches between the suggestions and the settings, and the list keeps its state behind the settings', async () => {
    const suggestion = { id: 's1', character: 'Agate-F', createdAt: 5, mode: 'exploration', sphere: 'world', kind: 'move', command: 'north', rationale: 'The only exit.', confidence: 0.8, confidenceSource: 'model', situationKey: 'k' };
    globalThis.fetch = (async (url: unknown) => {
      const path = new URL(String(url)).pathname;
      const body = path === '/suggestions' ? { suggestions: [suggestion] } : path === '/tickets' ? { tickets: [] } : path === '/stats/buckets' ? { buckets: {} } : stateBody;
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
    }) as typeof fetch;
    render(<CopilotWindow isOpen onClose={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Correct' }));
    fireEvent.change(screen.getByLabelText('Command to send instead'), { target: { value: 'open door' } });
    expect(screen.getByRole('button', { name: 'Suggestions' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('region', { name: 'Copilot settings' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('region', { name: 'Copilot settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Command to send instead').closest('[hidden]')).not.toBeNull(); // still there, out of sight

    fireEvent.click(screen.getByRole('button', { name: 'Suggestions' }));
    expect(screen.queryByRole('region', { name: 'Copilot settings' })).toBeNull();
    expect(screen.getByLabelText('Command to send instead')).toHaveValue('open door'); // what the owner had typed is still there
    expect(screen.getByLabelText('Command to send instead').closest('[hidden]')).toBeNull();
    await settle();
  });

  it('in Training a rule that is on runs nothing by itself: the suggestion waits for the owner', async () => {
    const suggestion = { id: 's1', character: 'Agate-F', createdAt: 5, mode: 'exploration', sphere: 'world', kind: 'move', command: 'north', rationale: 'The only exit.', confidence: 0.99, confidenceSource: 'model', situationKey: 'exploration:hall' };
    let listed: unknown[] = [];
    globalThis.fetch = (async (url: unknown) => {
      const path = new URL(String(url)).pathname;
      const body =
        path === '/suggestions' ? { suggestions: listed } : path === '/tickets' ? { tickets: [] } : path === '/stats/buckets' ? { buckets: { 'world:move': { approved: 40, total: 40 } } } : stateBody;
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
    }) as typeof fetch;
    const sent: string[] = [];
    const gate = { send: (c: string) => (sent.push(c), { ok: true as const }) } as unknown as import('../features/copilot/gate').CommandGate;
    render(<CopilotWindow isOpen onClose={() => undefined} gate={gate} />); // the focus is Training: nothing was picked

    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(await screen.findByLabelText('Auto-approve world move'));
    fireEvent.click(screen.getByRole('button', { name: 'Suggestions' }));
    listed = [suggestion];
    expect(await screen.findByLabelText('Suggestion north', undefined, { timeout: 4000 })).toBeInTheDocument();
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 600)))); // plenty of polls
    expect(sent).toEqual([]);
    expect(screen.getByLabelText('Suggestion north')).toBeInTheDocument();
    localStorage.clear();
  }, 15000);

  it('runs a suggestion by itself once the owner switched its rule on in the settings and enough answers back it', async () => {
    getCopilotRuntime().focus.set('agent'); // the AI agent drives; in Training the same rule would run nothing
    const suggestion = { id: 's1', character: 'Agate-F', createdAt: 5, mode: 'exploration', sphere: 'world', kind: 'move', command: 'north', rationale: 'The only exit.', confidence: 0.95, confidenceSource: 'model', situationKey: 'k' };
    let listed: unknown[] = [];
    const posts: { url: string; body: Record<string, unknown> }[] = [];
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (init?.method === 'POST') {
        posts.push({ url: path, body: JSON.parse(String(init.body)) });
        listed = [];
        return { ok: true, status: 201, json: async () => ({ ok: true, id: 'x', written: true }) } as unknown as Response;
      }
      const body =
        path === '/suggestions' ? { suggestions: listed } : path === '/tickets' ? { tickets: [] } : path === '/stats/buckets' ? { buckets: { 'world:move': { approved: 40, total: 40 } } } : { ...stateBody, lastTextAgeSeconds: 2 };
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
    }) as typeof fetch;
    const sent: string[] = [];
    const gate = { send: (c: string) => (sent.push(c), { ok: true as const }) } as unknown as import('../features/copilot/gate').CommandGate;
    render(<CopilotWindow isOpen onClose={() => undefined} gate={gate} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    fireEvent.click(await screen.findByLabelText('Auto-approve world move'));
    listed = [suggestion]; // the agent proposes one while the owner is looking at the settings
    await waitFor(() => expect(sent).toEqual(['north']), { timeout: 8000, interval: 100 });
    await settle();
    expect(posts.map((p) => p.url)).toEqual(['/decisions']);
    expect(posts[0].body).toMatchObject({ outcome: 'auto', rule: 'world:move', command: 'north', sphere: 'world', kind: 'move' });
    localStorage.clear();
  }, 15000);

  it('copes with a browser that blocks localStorage', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    try {
      render(<CopilotWindow isOpen onClose={() => undefined} />);
      await settle();
      expect(screen.getByLabelText('Mode')).toHaveValue('exploration');
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });
});
