import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GraphicsSettingsModal } from './GraphicsSettingsModal';
import { getHudLayout, setHudLayout } from '../features/hudLayout/hudLayoutStore';
import { getHudTheme } from '../features/hudLayout/hudThemeStore';

describe('GraphicsSettingsModal — Layout section', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows a Layout nav item, defaulting to classic', () => {
    render(<GraphicsSettingsModal isOpen onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('Layout'));
    expect(screen.getByLabelText('HUD layout')).toHaveValue('classic');
  });

  it('changing the layout selector persists immediately (not gated behind Save)', () => {
    render(<GraphicsSettingsModal isOpen onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('Layout'));

    fireEvent.change(screen.getByLabelText('HUD layout'), { target: { value: 'compact' } });

    expect(getHudLayout()).toBe('compact');
  });

  it('the theme selector only appears when compact layout is selected', () => {
    render(<GraphicsSettingsModal isOpen onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('Layout'));

    expect(screen.queryByLabelText('HUD theme')).toBeNull();

    fireEvent.change(screen.getByLabelText('HUD layout'), { target: { value: 'compact' } });
    expect(screen.getByLabelText('HUD theme')).toBeInTheDocument();
  });

  it('changing the theme selector persists immediately', () => {
    setHudLayout('compact');
    render(<GraphicsSettingsModal isOpen onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('Layout'));

    fireEvent.change(screen.getByLabelText('HUD theme'), { target: { value: 'slate-amber' } });
    expect(getHudTheme()).toBe('slate-amber');
  });
});
