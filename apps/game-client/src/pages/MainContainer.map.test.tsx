// MainContainer wires the Map menu item to a lazily rendered window (a production feature: no build flag).
import '../testing/mainContainerHarness';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MainContainer } from './MainContainer';

describe('MainContainer — the world map window', () => {
  it('keeps the window closed, and not even mounted, until the menu item is used', async () => {
    render(<MainContainer />);
    await screen.findByText('classic-shell');
    expect(screen.getByText('Map…')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'map-window-stub' })).toBeNull();
  });

  it('opens the window from the menu item, closes it from the window, and opens it again', async () => {
    render(<MainContainer />);
    await screen.findByText('classic-shell');
    fireEvent.click(screen.getByText('Map…'));
    expect(await screen.findByRole('dialog', { name: 'map-window-stub' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('close-map-stub'));
    expect(screen.queryByRole('dialog', { name: 'map-window-stub' })).toBeNull();
    fireEvent.click(screen.getByText('Map…'));
    expect(await screen.findByRole('dialog', { name: 'map-window-stub' })).toBeInTheDocument();
  });
});
