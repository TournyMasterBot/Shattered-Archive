import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { createFocusStore, type FocusStore } from '../features/copilot/focus';
import CopilotFocus, { CONFIRMED_KEY } from './CopilotFocus';

class Session {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
}

function setup(session = new Session(), store: FocusStore = createFocusStore(undefined)) {
  const view = render(<CopilotFocus focus={store} storage={session} />);
  return { store, session, ...view };
}
const radio = (name: string) => screen.getByRole('radio', { name });

describe('CopilotFocus', () => {
  it('starts in Training, says what that means, and has both choices in one labelled group', () => {
    setup();
    expect(screen.getByRole('radiogroup', { name: 'Focus' })).toBeInTheDocument();
    expect(radio('Training')).toHaveAttribute('aria-checked', 'true');
    expect(radio('AI agent')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/Every suggestion waits for you/)).toBeInTheDocument();
  });

  it('asks before the AI agent, and nothing changes until the owner says yes', () => {
    const { store } = setup();
    fireEvent.click(radio('AI agent'));
    expect(screen.getByRole('alertdialog', { name: 'Let Copilot drive?' })).toBeInTheDocument();
    expect(store.get()).toBe('training');
    expect(radio('Training')).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Stay in Training' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(store.get()).toBe('training');
  });

  it('Let it drive switches to the AI agent, changes the hint, and the next switch in this session does not ask again', () => {
    const { store, session } = setup();
    fireEvent.click(radio('AI agent'));
    fireEvent.click(screen.getByRole('button', { name: 'Let it drive' }));
    expect(store.get()).toBe('agent');
    expect(session.data.get(CONFIRMED_KEY)).toBe('true');
    expect(radio('AI agent')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/Spending, speaking to players and anything irreversible always ask/)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();

    fireEvent.click(radio('Training')); // back: never asks, takes effect at once
    expect(store.get()).toBe('training');
    fireEvent.click(radio('AI agent')); // and again: already said yes this session
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(store.get()).toBe('agent');
  });

  it('a new browser session asks again, even though the focus itself is kept', () => {
    const store = createFocusStore(undefined);
    const first = setup(new Session(), store);
    fireEvent.click(radio('AI agent'));
    fireEvent.click(screen.getByRole('button', { name: 'Let it drive' }));
    first.unmount();
    store.set('training');
    setup(new Session(), store); // a fresh session storage
    fireEvent.click(radio('AI agent'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('choosing the focus it already has does nothing, and Escape answers the question only: no one else sees the key', () => {
    const outside = jest.fn();
    const store = createFocusStore(undefined);
    render(
      <div onKeyDown={(e) => e.key === 'Escape' && outside()}>
        <CopilotFocus focus={store} storage={new Session()} />
      </div>,
    );
    fireEvent.click(radio('Training'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    fireEvent.click(radio('AI agent'));
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'a' }); // any other key leaves the question open
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(outside).not.toHaveBeenCalled();
    expect(store.get()).toBe('training');
    fireEvent.keyDown(radio('Training'), { key: 'Escape' }); // no question open: the key goes on to the window
    expect(outside).toHaveBeenCalledTimes(1);
  });

  it('follows another tab, and asks again if the session storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const store = createFocusStore(undefined);
    render(<CopilotFocus focus={store} storage={blocked} />);
    fireEvent.click(radio('AI agent'));
    fireEvent.click(screen.getByRole('button', { name: 'Let it drive' }));
    expect(store.get()).toBe('agent'); // the answer counts even though it could not be remembered
    fireEvent.click(radio('Training'));
    fireEvent.click(radio('AI agent'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument(); // not remembered: asked again
  });

  it('uses the browser session storage when none is given', () => {
    sessionStorage.clear();
    const store = createFocusStore(undefined);
    const first = render(<CopilotFocus focus={store} />);
    fireEvent.click(radio('AI agent'));
    fireEvent.click(screen.getByRole('button', { name: 'Let it drive' }));
    expect(sessionStorage.getItem(CONFIRMED_KEY)).toBe('true');
    first.unmount();
    sessionStorage.clear();

  });
});
