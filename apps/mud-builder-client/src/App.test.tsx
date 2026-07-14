import { render, screen, fireEvent } from '@testing-library/react';

import App from './App.js';

describe('App shell', () => {
  it('renders the builder frame with all section tabs', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'MUD Builder' })).toBeTruthy();
    for (const label of ['Areas', 'Rooms', 'Mobs', 'Objects', 'Scripts']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    // Areas is the default section.
    expect(screen.getByRole('button', { name: 'Areas' }).getAttribute('aria-current')).toBe('page');
  });

  it('switches sections on nav click', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Mobs' }));
    expect(screen.getByRole('button', { name: 'Mobs' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Areas' }).getAttribute('aria-current')).toBeNull();
  });
});
