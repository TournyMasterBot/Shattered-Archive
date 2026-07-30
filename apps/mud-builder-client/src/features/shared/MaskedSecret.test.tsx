import { render, screen, fireEvent, act } from '@testing-library/react';

import { MaskedSecret } from './MaskedSecret.js';

const SECRET = 'super-secret-token-value';

function writeTextMock() {
  const writeText = jest.fn(async () => undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

describe('MaskedSecret', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const input = () => screen.getByLabelText('Issued token') as HTMLInputElement;

  it('is masked on first render — revealing is always a deliberate act', () => {
    render(<MaskedSecret value={SECRET} label="Issued token" />);
    expect(input().value).not.toContain(SECRET);
    expect(input().type).toBe('password');
  });

  /** Fixed-width mask: the rendered width must not hint at the secret's length. */
  it('masks with a fixed width regardless of the secret length', () => {
    const { unmount } = render(<MaskedSecret value="short" label="Issued token" />);
    const shortMask = input().value;
    unmount();
    render(<MaskedSecret value={'x'.repeat(200)} label="Issued token" />);
    expect(input().value).toBe(shortMask);
  });

  it('reveals on demand and hides again on a second click', () => {
    render(<MaskedSecret value={SECRET} label="Issued token" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    expect(input().value).toBe(SECRET);
    expect(input().type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(input().value).not.toContain(SECRET);
  });

  /** The realistic failure is forgetting it is visible, not being unable to read it in time. */
  it('re-hides itself after the reveal timeout', () => {
    render(<MaskedSecret value={SECRET} label="Issued token" revealMs={5000} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    expect(input().value).toBe(SECRET);

    act(() => {
      jest.advanceTimersByTime(5001);
    });
    expect(input().value).not.toContain(SECRET);
  });

  /**
   * The case that actually bites on a shared screen: reveal, then alt-tab to paste it, leaving
   * the value on a view you are no longer watching.
   */
  it('hides immediately when the tab is hidden', () => {
    render(<MaskedSecret value={SECRET} label="Issued token" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    expect(input().value).toBe(SECRET);

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(input().value).not.toContain(SECRET);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('hides immediately when the window loses focus', () => {
    render(<MaskedSecret value={SECRET} label="Issued token" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(input().value).not.toContain(SECRET);
  });

  /** The whole point: the common path never puts the value on screen at all. */
  it('copies the real value WITHOUT revealing it', async () => {
    const writeText = writeTextMock();
    render(<MaskedSecret value={SECRET} label="Issued token" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(writeText).toHaveBeenCalledWith(SECRET);
    expect(input().value).not.toContain(SECRET);
  });

  /** If the clipboard is denied, revealing is the only way left to transcribe it. */
  it('falls back to revealing when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: jest.fn(async () => {
          throw new Error('denied');
        }),
      },
      configurable: true,
    });
    render(<MaskedSecret value={SECRET} label="Issued token" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });

    expect(input().value).toBe(SECRET);
  });
});
