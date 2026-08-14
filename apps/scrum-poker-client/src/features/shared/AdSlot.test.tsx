import { render, screen } from '@testing-library/react';

import AdSlot from './AdSlot.js';

/**
 * The load-bearing assertion here is the negative one: an unconfigured production build must
 * render no container AND request no third-party script. That is the whole difference between
 * "one low-profile ad slot" and "an ad network on every page whether or not it's in use".
 */
describe('AdSlot', () => {
  afterEach(() => {
    document.getElementById('sp-ad-loader')?.remove();
  });

  it('renders nothing and loads no script when unconfigured in production', () => {
    const { container } = render(<AdSlot config={{ isDev: false }} />);

    expect(container.innerHTML).toBe('');
    expect(document.getElementById('sp-ad-loader')).toBeNull();
  });

  it('shows a labelled placeholder in dev so the slot stays visible while building', () => {
    render(<AdSlot config={{ isDev: true }} />);

    expect(screen.getByText(/Ad slot/i)).toBeDefined();
    expect(document.getElementById('sp-ad-loader')).toBeNull();
  });

  it('renders exactly one unit and injects the loader once when configured', () => {
    const { container } = render(<AdSlot config={{ client: 'ca-pub-test', slot: '123', isDev: false }} />);

    expect(container.querySelectorAll('ins.adsbygoogle')).toHaveLength(1);
    const script = document.getElementById('sp-ad-loader') as HTMLScriptElement | null;
    expect(script?.src).toContain('ca-pub-test');
  });

  it('shows only the placeholder in dev even when real credentials are configured', () => {
    // The dev/experimental compose's own comment allows setting real ad ids to test the wiring
    // locally — this is the backstop that keeps that from ever shipping a live ad request.
    const { container } = render(<AdSlot config={{ client: 'ca-pub-test', slot: '123', isDev: true }} />);

    expect(container.querySelectorAll('ins.adsbygoogle')).toHaveLength(0);
    expect(screen.getByText(/Ad slot/i)).toBeDefined();
    expect(document.getElementById('sp-ad-loader')).toBeNull();
  });
});
