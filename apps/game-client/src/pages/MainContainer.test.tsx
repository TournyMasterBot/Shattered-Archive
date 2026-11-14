// apps/game-client/src/pages/MainContainer.test.tsx
// The harness registers the stubs below and must come before MainContainer is loaded.
import { mockConn, mockPluginConnectionIds } from '../testing/mainContainerHarness';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MainContainer } from './MainContainer';
import { setHudThemeId } from '../features/hudLayout/hudThemeStore';

// ---------------------------------------------------------------------------
// MainContainer pulls in a lot of app wiring — a WebSocket connection, plugin
// storage, equipment capture/delta parsing, auto-leveling, Lua/audio runtime
// init, and a couple of app-wide singletons. This test only exercises the
// shell-selection branch, so every hook module the component calls a hook
// from gets a minimal, non-throwing stub. Real (unmocked) child components
// (modals, MainMenuBar, FocusBarVitals, etc.) are left to render for real —
// they're all closed (`isOpen=false`) so they return null quickly.
// ---------------------------------------------------------------------------

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

describe('MainContainer — shell selection', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setViewportWidth(1440);
    mockConn.host = '';
    mockConn.port = 0;
    mockPluginConnectionIds.length = 0;
  });

  describe('connection id handed to the per-connection stores', () => {
    const lastId = () => mockPluginConnectionIds[mockPluginConnectionIds.length - 1];

    it('is dsl-mud while disconnected', async () => {
      render(<MainContainer />);
      await screen.findByText('classic-shell');
      expect(lastId()).toBe('dsl-mud');
    });

    it('stays dsl-mud once connected to the DSL game, so nothing is re-keyed on connect', async () => {
      mockConn.host = 'dsl-mud.org';
      mockConn.port = 4000;
      render(<MainContainer />);
      await screen.findByText('classic-shell');
      expect(lastId()).toBe('dsl-mud');
      expect(mockPluginConnectionIds).not.toContain('default');
    });

    it('keeps host:port for a custom server', async () => {
      mockConn.host = 'mud.example.com';
      mockConn.port = 4000;
      render(<MainContainer />);
      await screen.findByText('classic-shell');
      expect(lastId()).toBe('mud.example.com:4000');
    });
  });

  it('renders the classic shell by default', async () => {
    render(<MainContainer />);
    expect(await screen.findByText('classic-shell')).toBeInTheDocument();
  });

  it('renders the slate-amber shell when the theme is selected and the viewport is desktop-width', async () => {
    setHudThemeId('slate-amber');
    render(<MainContainer />);
    expect(await screen.findByText('compact-shell')).toBeInTheDocument();
  });

  it('renders slate-amber\'s OWN narrow shell on a mobile-width viewport, not a fallback to classic', async () => {
    setHudThemeId('slate-amber');
    setViewportWidth(600);
    render(<MainContainer />);
    expect(await screen.findByText('compact-shell-narrow')).toBeInTheDocument();
  });

  it('falls back to the classic shell on a mobile-width viewport for the default theme', async () => {
    setViewportWidth(600);
    render(<MainContainer />);
    expect(await screen.findByText('classic-shell')).toBeInTheDocument();
  });
});

describe('MainContainer — Copilot window in a production build', () => {
  it('has no Copilot menu item and no window when the build flag is false', async () => {
    render(<MainContainer />);
    await screen.findByText('classic-shell');
    expect(screen.queryByText('Copilot…')).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'copilot-window-stub' })).toBeNull();
  });

  it('still opens the Autopilot wizard entry as before: the Copilot wiring changed no other menu handler', async () => {
    render(<MainContainer />);
    await screen.findByText('classic-shell');
    expect(screen.getByText('Autopilot…')).toBeInTheDocument();
    expect(screen.getByText('Equipment…')).toBeInTheDocument();
  });
});
