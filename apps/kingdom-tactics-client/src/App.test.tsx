import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { App } from './App';

afterEach(cleanup);
beforeEach(() => globalThis.localStorage.clear());

describe('App', () => {
  it('boots to the main menu with the core actions', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Quick Match' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Army Builder' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Scenario' })).toBeTruthy();
  });

  it('persists the last match and offers "Play last" back at the menu', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Quick Match' })); // persists on mount
    fireEvent.click(screen.getByRole('button', { name: 'Back to menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play last' }));
    expect(screen.getByRole('button', { name: 'End turn' })).toBeTruthy();
  });

  it('Quick Match navigates into a playable match (HUD + arena)', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Quick Match' }));
    // The real match screen: HUD shows turn 1 and per-side counts, and the arena is playable.
    expect(screen.getByText(/Turn 1/)).toBeTruthy();
    expect(screen.getByText('You: 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'End turn' })).toBeTruthy();
  });

  it('a stub screen can return to the menu', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Army Builder' }));
    expect(screen.getByRole('heading', { name: 'Army Builder' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to menu' }));
    expect(screen.getByRole('button', { name: 'Quick Match' })).toBeTruthy();
  });

  it('opens the Simulator dashboard and returns to the menu', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Simulator' }));
    expect(screen.getByRole('heading', { name: 'Simulator Dashboard' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Run' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to menu' }));
    expect(screen.getByRole('button', { name: 'Quick Match' })).toBeTruthy();
  });

  it('opens the Online Match screen and returns to the menu', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Online Match' }));
    expect(screen.getByRole('heading', { name: /Online/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to menu' }));
    expect(screen.getByRole('button', { name: 'Quick Match' })).toBeTruthy();
  });
});
