import { render, screen } from '@testing-library/react';

import App from './App.js';
import { a11yProblems } from './axe-helper.js';

function mockMe(summary: Record<string, unknown>): void {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/auth/me')) {
      return { ok: true, status: 200, statusText: 'OK', json: async () => summary } as unknown as Response;
    }
    // Pages mounted by the default tab may fetch; give them harmless empties.
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({ keys: [] }) } as unknown as Response;
  }) as unknown as typeof fetch;
}

const baseSummary = {
  id: 'a1',
  username: 'melchaleve',
  mustChangePassword: false,
  emailOnFile: false,
  emailVerified: false,
};

function mockLoggedOut(): void {
  globalThis.fetch = jest.fn(async () => {
    return { ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({ error: 'unauthorized' }) } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe('App /signup landing (Phase B)', () => {
  afterEach(() => {
    window.history.pushState(null, '', '/');
  });

  it('lands on the signup form when the pathname is /signup', async () => {
    window.history.pushState(null, '', '/signup');
    mockLoggedOut();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Create an account' })).toBeTruthy();
  });

  it('still defaults to login at any other pathname', async () => {
    window.history.pushState(null, '', '/');
    mockLoggedOut();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
  });
});

describe('App accessibility (axe)', () => {
  afterEach(() => {
    window.history.pushState(null, '', '/');
  });

  it('login view has no axe violations', async () => {
    window.history.pushState(null, '', '/');
    mockLoggedOut();
    const { container } = render(<App />);
    await screen.findByRole('heading', { name: 'Log in' });
    expect(await a11yProblems(container)).toEqual([]);
  });

  it('signup view has no axe violations', async () => {
    window.history.pushState(null, '', '/signup');
    mockLoggedOut();
    const { container } = render(<App />);
    await screen.findByRole('heading', { name: 'Create an account' });
    expect(await a11yProblems(container)).toEqual([]);
  });

  it('signed-in account view has no axe violations', async () => {
    mockMe({ ...baseSummary, globalRole: 'moderator' });
    const { container } = render(<App />);
    await screen.findByRole('button', { name: 'Admin' });
    expect(await a11yProblems(container)).toEqual([]);
  });

  // Proves the audit can fail: jsdom reports this bug as `incomplete`, which a plain jest-axe check lets through.
  it('reports a focusable link inside aria-hidden', async () => {
    const { container } = render(
      <div aria-hidden="true">
        <a href="https://example.test/">Privacy</a>
      </div>,
    );
    const problems = await a11yProblems(container);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('aria-hidden-focus');
  });

  it('does not flag a decorative aria-hidden element with nothing focusable inside', async () => {
    const { container } = render(
      <p>
        <span aria-hidden="true">=====</span> Loading
      </p>,
    );
    expect(await a11yProblems(container)).toEqual([]);
  });
});

describe('App admin tab visibility (A2)', () => {
  it('hides the Admin tab for a plain user', async () => {
    mockMe({ ...baseSummary, globalRole: 'user' });
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Account' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Admin' })).toBeNull();
  });

  it('shows the Admin tab for an elevated tier', async () => {
    mockMe({ ...baseSummary, globalRole: 'moderator' });
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Admin' })).toBeTruthy();
  });
});
