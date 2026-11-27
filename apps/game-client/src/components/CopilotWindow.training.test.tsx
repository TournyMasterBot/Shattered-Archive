import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getCopilotRuntime } from '../features/copilot/loader';
import CopilotWindow from './CopilotWindow';

const stateBody = { connected: true, stale: false, staleAfterSeconds: 60, lastEventAgeSeconds: 1, inFight: false, room: null };
const original = globalThis.fetch;
let training: { enabled: boolean; world?: 'dsl' | 'sandbox'; canEnable: boolean; refusal?: string };
const posts: unknown[] = [];

beforeEach(() => {
  localStorage.clear();
  posts.length = 0;
  training = { enabled: false, world: 'sandbox', canEnable: true };
  getCopilotRuntime().enabled.set(true);
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    if (path === '/training' && init?.method === 'POST') {
      posts.push(JSON.parse(String(init.body)));
      if (!training.canEnable && JSON.parse(String(init.body)).enabled) return { ok: false, status: 409, json: async () => ({ reason: training.refusal }) } as unknown as Response;
      training = { ...training, enabled: JSON.parse(String(init.body)).enabled };
      return { ok: true, status: 200, json: async () => training } as unknown as Response;
    }
    const body = path === '/training' ? training : path === '/suggestions' ? { suggestions: [] } : path === '/tickets' ? { tickets: [] } : path === '/stats/buckets' ? { buckets: {} } : stateBody;
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = original;
});

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));

describe('CopilotWindow: Claude training', () => {
  it('shows no banner while training is off, and the switch is in the settings tab for the Simulacrum', async () => {
    render(<CopilotWindow isOpen onClose={() => undefined} />);
    await settle();
    expect(screen.queryByLabelText('Claude training is on')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await settle(); // the settings tab starts its own poll when it mounts
    expect(screen.getByLabelText('Claude training')).not.toBeChecked();
  });

  it('turns training on from the settings, and the banner stays visible in the window from then on', async () => {
    render(<CopilotWindow isOpen onClose={() => undefined} />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByLabelText('Claude training'));
    await waitFor(() => expect(screen.getByLabelText('Claude training is on')).toHaveTextContent('Claude is training Copilot'));
    expect(posts).toEqual([{ enabled: true }]);
    fireEvent.click(screen.getByRole('button', { name: 'Suggestions' })); // the banner is not part of one tab
    expect(screen.getByLabelText('Claude training is on')).toBeInTheDocument();
  });

  it('shows the banner when the server already has training on (Claude turned it on), and clears it when the server says it is off', async () => {
    training = { enabled: true, world: 'sandbox', canEnable: true };
    render(<CopilotWindow isOpen onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByLabelText('Claude training is on')).toBeInTheDocument());
    training = { enabled: false, world: 'dsl', canEnable: false, refusal: 'not-simulacrum' }; // the connection moved to the production game
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 3100))));
    expect(screen.queryByLabelText('Claude training is on')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await settle();
    expect(screen.queryByLabelText('Claude training')).toBeNull(); // no switch against the production game
  }, 10_000);

  it('shows nothing about training while Copilot is off', async () => {
    getCopilotRuntime().enabled.set(false);
    training = { enabled: true, world: 'sandbox', canEnable: true };
    render(<CopilotWindow isOpen onClose={() => undefined} />);
    await settle();
    expect(screen.queryByLabelText('Claude training is on')).toBeNull();
  });
});
