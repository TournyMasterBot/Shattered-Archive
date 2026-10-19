import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GraphicsSettingsModal } from './GraphicsSettingsModal';
import { getHudThemeId, setHudThemeId } from '../features/hudLayout/hudThemeStore';

describe('GraphicsSettingsModal — Layout section', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows a Layout nav item, defaulting to the default theme', () => {
    render(<GraphicsSettingsModal isOpen onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('Layout'));
    expect(screen.getByLabelText('Theme')).toHaveValue('default');
  });

  it('changing the theme selector persists immediately (not gated behind Save)', () => {
    render(<GraphicsSettingsModal isOpen onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('Layout'));

    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'slate-amber' } });

    expect(getHudThemeId()).toBe('slate-amber');
  });

  it('reflects a previously-saved theme when reopened', () => {
    setHudThemeId('slate-amber');
    render(<GraphicsSettingsModal isOpen onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('Layout'));

    expect(screen.getByLabelText('Theme')).toHaveValue('slate-amber');
  });
});
