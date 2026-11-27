import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import HelpInfoButton from './HelpInfoButton';

describe('HelpInfoButton', () => {
  it('is a button named for its topic, showing an i, that reports whether the help is open', () => {
    const onToggle = jest.fn();
    const { rerender } = render(<HelpInfoButton topic="Copilot" open={false} onToggle={onToggle} />);
    const button = screen.getByRole('button', { name: 'Help: Copilot' });
    expect(button).toHaveTextContent('i');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveAttribute('title', 'Help: Copilot');
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(<HelpInfoButton topic="Copilot" open onToggle={onToggle} />);
    expect(screen.getByRole('button', { name: 'Help: Copilot' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Help: Copilot' })).toHaveAttribute('title', 'Close the help');
  });

  it('does not let a press on it reach the header behind it (the header is a drag handle)', () => {
    const header = jest.fn();
    render(
      <div onPointerDown={header}>
        <HelpInfoButton topic="the map" open={false} onToggle={() => undefined} />
      </div>,
    );
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Help: the map' }));
    expect(header).not.toHaveBeenCalled();
  });
});
