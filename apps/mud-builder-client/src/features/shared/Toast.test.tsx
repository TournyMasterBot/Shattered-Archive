import { render, screen, fireEvent } from '@testing-library/react';

import { Toast } from './Toast.js';

describe('Toast', () => {
  it('renders nothing when there is no toast', () => {
    const { container } = render(<Toast toast={null} onDismiss={jest.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it.each(['ok', 'err', 'warn', 'info'] as const)('renders the %s kind with its class and text', (kind) => {
    render(<Toast toast={{ kind, text: `a ${kind} message` }} onDismiss={jest.fn()} />);
    const el = screen.getByRole('status');
    expect(el.className).toBe(`mb-toast mb-toast--${kind}`);
    expect(el.textContent).toBe(`a ${kind} message`);
  });

  it('calls onDismiss when clicked', () => {
    const onDismiss = jest.fn();
    render(<Toast toast={{ kind: 'ok', text: 'hi' }} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('status'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
