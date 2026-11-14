import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ENABLED_KEY, createEnabledStore, type EnabledStore } from '../features/copilot/enabled';
import CopilotWindow from './CopilotWindow';

/** The Copilot window and its on/off switch: off until the owner turns it on, and while off nothing is asked of the server. */

const stateBody = { connected: true, stale: false, staleAfterSeconds: 60, lastEventAgeSeconds: 1, inFight: false, room: null };
const original = globalThis.fetch;
let requests: string[] = [];
let aborted: boolean[] = [];
let posts: { path: string; body: unknown }[] = [];
let learningInState: boolean | undefined;

beforeEach(() => {
  localStorage.clear();
  requests = [];
  aborted = [];
  posts = [];
  learningInState = undefined;
  globalThis.fetch = (async (url: unknown, init?: { signal?: AbortSignal; method?: string; body?: string }) => {
    const path = new URL(String(url)).pathname;
    requests.push(path);
    if (init?.method === 'POST') {
      posts.push({ path, body: JSON.parse(init.body ?? 'null') });
      return { ok: true, status: 200, json: async () => ({ enabled: (posts.at(-1)?.body as { enabled: boolean }).enabled }) } as unknown as Response;
    }
    const index = aborted.push(false) - 1;
    init?.signal?.addEventListener('abort', () => (aborted[index] = true));
    const body = path === '/suggestions' ? { suggestions: [] } : path === '/tickets' ? { tickets: [] } : { ...stateBody, ...(learningInState === undefined ? {} : { learning: learningInState }) };
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = original;
});

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));
const theSwitch = () => screen.getByRole('switch', { name: 'Copilot' });

function open(store: EnabledStore) {
  return render(<CopilotWindow isOpen onClose={() => undefined} enabled={store} />);
}

describe('CopilotWindow: Copilot is off until the owner turns it on', () => {
  it('opens switched off in a browser that was never asked: it says so, shows the switch, and asks the server for nothing', async () => {
    open(createEnabledStore(localStorage));
    await settle();
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 60))));

    expect(theSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(theSwitch()).toHaveTextContent('Off');
    expect(screen.getByText('Copilot is off.')).toBeInTheDocument();
    expect(screen.getByText(/nothing is sent to the game/)).toBeInTheDocument();
    // none of the working parts is on the screen: no mode, no server status, no tabs, no suggestions
    expect(screen.queryByLabelText('Mode')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Suggestions' })).toBeNull();
    expect(screen.queryByText('No suggestions yet.')).toBeNull();
    expect(requests).toEqual([]);
    expect(posts).toEqual([]);
  });

  it('is one native button, so the keyboard reaches it, and the owner can still close the window while it is off', async () => {
    const onClose = jest.fn();
    render(<CopilotWindow isOpen onClose={onClose} enabled={createEnabledStore(localStorage)} />);
    await settle();
    expect(theSwitch().tagName).toBe('BUTTON');
    expect(theSwitch()).not.toHaveAttribute('tabindex', '-1');
    fireEvent.click(screen.getByRole('button', { name: 'Close Copilot' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('switching on remembers the choice, shows the working window and starts asking the server', async () => {
    open(createEnabledStore(localStorage));
    await settle();
    fireEvent.click(theSwitch());
    await settle();

    expect(localStorage.getItem(ENABLED_KEY)).toBe('true');
    expect(theSwitch()).toHaveAttribute('aria-checked', 'true');
    expect(theSwitch()).toHaveTextContent('On');
    expect(screen.queryByText('Copilot is off.')).toBeNull();
    expect(screen.getByLabelText('Mode')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Online');
    expect(screen.getByText('No suggestions yet.')).toBeInTheDocument();
    expect(requests).toEqual(expect.arrayContaining(['/state', '/suggestions', '/tickets']));
    expect(posts).toEqual([{ path: '/control', body: { enabled: true } }]); // the server is told once, and starts reading the logs
  });

  it('switching off stops at once: the request in flight is aborted, the suggestions are gone, and nothing more is asked', async () => {
    const store = createEnabledStore({ getItem: () => 'true', setItem: () => undefined });
    open(store);
    await settle();
    expect(screen.getByText('No suggestions yet.')).toBeInTheDocument();
    fireEvent.click(theSwitch());
    await settle();
    const before = requests.length;
    expect(posts).toEqual([{ path: '/control', body: { enabled: false } }]); // the one thing sent: the server stops reading the logs
    expect(theSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Copilot is off.')).toBeInTheDocument();
    expect(screen.queryByText('No suggestions yet.')).toBeNull();
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 60))));
    expect(requests.length).toBe(before);
  });

  it('an open window with the switch on tells a server that is not learning (a restarted one) to start, and leaves one that is learning alone', async () => {
    const store = createEnabledStore({ getItem: () => 'true', setItem: () => undefined });
    learningInState = true;
    const first = open(store);
    await settle();
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 20))));
    expect(posts).toEqual([]);
    first.unmount();

    learningInState = false;
    open(store);
    await settle();
    expect(posts).toEqual([{ path: '/control', body: { enabled: true } }]);
  });

  it('does not ask a server that never reports learning (an older one) to do anything', async () => {
    open(createEnabledStore({ getItem: () => 'true', setItem: () => undefined }));
    await settle();
    expect(posts).toEqual([]);
  });

  it('follows a switch made somewhere else (the menu, another tab) while the window is open', async () => {
    const store = createEnabledStore(localStorage);
    open(store);
    await settle();
    expect(screen.getByText('Copilot is off.')).toBeInTheDocument();

    act(() => store.onStorageEvent({ key: ENABLED_KEY, newValue: 'true' }));
    await settle();
    expect(theSwitch()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Online');

    act(() => store.onStorageEvent({ key: null, newValue: null }));
    expect(theSwitch()).toHaveAttribute('aria-checked', 'false');
  });
});
