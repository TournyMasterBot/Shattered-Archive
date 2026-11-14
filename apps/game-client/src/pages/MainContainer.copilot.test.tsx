// Flagged build (the dev stack): MainContainer wires the Copilot menu item to a lazily rendered window.
import '../testing/copilotFlagOn'; // first: sets the build flag before MainContainer is loaded
import '../testing/mainContainerHarness';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MainContainer } from './MainContainer';

describe('MainContainer — local-only Copilot window (flag true)', () => {
  beforeEach(() => window.localStorage.clear());
  afterAll(() => {
    (globalThis as { __COPILOT_LOCAL__?: boolean }).__COPILOT_LOCAL__ = false;
  });

  it('says (off) on the menu item while Copilot is switched off (the default), and drops it when it is switched on', async () => {
    const { getCopilotRuntime } = await import('../features/copilot/loader');
    const runtime = getCopilotRuntime();
    runtime.enabled.set(false);
    render(<MainContainer />);
    await screen.findByText('classic-shell');
    expect(await screen.findByText('(off)', { exact: false })).toBeInTheDocument();
    act(() => runtime.enabled.set(true));
    await waitFor(() => expect(screen.queryByText('(off)', { exact: false })).toBeNull());
    act(() => runtime.enabled.set(false));
    expect(await screen.findByText('(off)', { exact: false })).toBeInTheDocument();
    runtime.enabled.set(false);
  });

  it('opens the window from the menu item even while Copilot is switched off (the switch is inside the window)', async () => {
    const { getCopilotRuntime } = await import('../features/copilot/loader');
    getCopilotRuntime().enabled.set(false);
    render(<MainContainer />);
    await screen.findByText('classic-shell');
    expect(await screen.findByText('(off)', { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Copilot…'));
    expect(await screen.findByRole('dialog', { name: 'copilot-window-stub' })).toBeInTheDocument();
  });

  it('keeps the window closed until the menu item is used', async () => {
    render(<MainContainer />);
    await screen.findByText('classic-shell');
    expect(screen.getByText('Copilot…')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'copilot-window-stub' })).toBeNull();
  });

  it('opens the window from the menu item, closes it from the window, and opens it again', async () => {
    render(<MainContainer />);
    await screen.findByText('classic-shell');

    fireEvent.click(screen.getByText('Copilot…'));
    expect(await screen.findByRole('dialog', { name: 'copilot-window-stub' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('close-copilot-stub'));
    expect(screen.queryByRole('dialog', { name: 'copilot-window-stub' })).toBeNull();

    fireEvent.click(screen.getByText('Copilot…'));
    expect(await screen.findByRole('dialog', { name: 'copilot-window-stub' })).toBeInTheDocument();
  });
});
