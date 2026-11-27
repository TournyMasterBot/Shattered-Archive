import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { getCopilotRuntime } from '../features/copilot/loader';
import CopilotHelp from './CopilotHelp';
import CopilotWindow from './CopilotWindow';

const stateBody = { connected: true, stale: false, staleAfterSeconds: 60, lastEventAgeSeconds: 1, inFight: false, room: null };
const original = globalThis.fetch;

beforeEach(() => {
  localStorage.clear();
  getCopilotRuntime().enabled.set(true);
  globalThis.fetch = (async (url: unknown) => {
    const path = new URL(String(url)).pathname;
    const body = path === '/training' ? { enabled: false, canEnable: false } : path === '/suggestions' ? { suggestions: [] } : path === '/tickets' ? { tickets: [] } : path === '/stats/buckets' ? { buckets: {} } : stateBody;
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = original;
});

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));

describe('CopilotWindow: the help (the blue i)', () => {
  it('has a blue (i) next to the title, and the help is not shown until it is pressed', async () => {
    render(<CopilotWindow isOpen onClose={() => undefined} />);
    await settle();
    expect(screen.getByRole('button', { name: 'Help: Copilot' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('article', { name: 'Copilot help' })).toBeNull();
  });

  it('shows the help in place of the window body, and Back (or the i again) returns to it', async () => {
    render(<CopilotWindow isOpen onClose={() => undefined} />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Help: Copilot' }));
    const help = screen.getByRole('article', { name: 'Copilot help' });
    expect(help).toHaveTextContent('Getting started');
    expect(help).toHaveTextContent('What Copilot never does by itself');
    expect(screen.getByRole('button', { name: 'Suggestions', hidden: true })).not.toBeVisible(); // the tabs are behind it
    fireEvent.click(screen.getByRole('button', { name: '← Back to Copilot' }));
    expect(screen.queryByRole('article', { name: 'Copilot help' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Suggestions' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Help: Copilot' }));
    expect(screen.getByRole('article', { name: 'Copilot help' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Help: Copilot' }));
    expect(screen.queryByRole('article', { name: 'Copilot help' })).toBeNull();
  });

  it('keeps the suggestion list mounted behind the help, so auto-approval goes on working', async () => {
    render(<CopilotWindow isOpen onClose={() => undefined} />);
    await settle();
    expect(screen.getByText('No suggestions yet.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Help: Copilot' }));
    expect(screen.getByText('No suggestions yet.')).toBeInTheDocument(); // still in the document, only hidden
    expect(screen.getByText('No suggestions yet.')).not.toBeVisible();
  });

  it('Escape closes the help first, and the window the second time', async () => {
    const onClose = jest.fn();
    render(<CopilotWindow isOpen onClose={onClose} />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Help: Copilot' }));
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Copilot' }), { key: 'Escape' });
    expect(screen.queryByRole('article', { name: 'Copilot help' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Copilot' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is there while Copilot is off, and the off message points to it', async () => {
    getCopilotRuntime().enabled.set(false);
    render(<CopilotWindow isOpen onClose={() => undefined} />);
    await settle();
    expect(screen.getByText(/The blue \(i\) next to the title explains what Copilot does/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Help: Copilot' }));
    expect(screen.getByRole('article', { name: 'Copilot help' })).toHaveTextContent('Turn the switch in the title bar on');
  });
});

describe('CopilotHelp', () => {
  it('covers what Copilot is, getting started, what to do when nothing happens, answering, settings, the hard floor, fights, training and data', () => {
    render(<CopilotHelp onBack={() => undefined} />);
    for (const heading of [
      'About Copilot',
      'Getting started',
      'If nothing happens',
      'Answering a suggestion',
      'Settings and automatic approval',
      'What Copilot never does by itself',
      'Fights',
      'Claude training (the Simulacrum only)',
      'Where your data is',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    expect(screen.getByText(/It only suggests\./)).toBeInTheDocument();
    expect(screen.getByText(/at least 20 suggestions of that kind/)).toBeInTheDocument();
  });

  it('calls onBack from its Back button', () => {
    const onBack = jest.fn();
    render(<CopilotHelp onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: '← Back to Copilot' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
