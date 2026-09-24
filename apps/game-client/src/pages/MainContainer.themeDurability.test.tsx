// apps/game-client/src/pages/MainContainer.themeDurability.test.tsx
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MainContainer } from './MainContainer';
import { setHudThemeId } from '../features/hudLayout/hudThemeStore';
import { pluginHost } from '../features/plugins/pluginHost';

// ---------------------------------------------------------------------------
// Step 7's engine-durability claim: MainContainer owns the connection/plugin
// host/event-bus ABOVE the per-theme shell, so a live theme switch (setting
// hudThemeId) re-renders the SAME MainContainer instance and only swaps the
// lazy ActiveShell child — it never unmounts/remounts MainContainer itself.
// This mirrors MainContainer.test.tsx's mock set (same hooks, same jsdom
// hazards — see that file's comments), with one addition: useGameConnection's
// mock tracks its own effect mount/cleanup, since an unwanted MainContainer
// remount would show up as a second mount-effect run / an unexpected cleanup.
// pluginHost is left REAL (not mocked), spied on instead, so its actual
// enable() idempotency guard is what's under test, not a stand-in for it.
// ---------------------------------------------------------------------------

const connectionMountSpy = jest.fn();
const connectionCleanupSpy = jest.fn();

jest.mock('../components/hud/DefaultThemeShell', () => ({
  __esModule: true,
  default: () => <div>classic-shell</div>,
}));

jest.mock('../components/hud/CompactLayoutShell', () => ({
  __esModule: true,
  default: () => <div>compact-shell</div>,
}));

jest.mock('../components/hud/CompactLayoutShellNarrow', () => ({
  __esModule: true,
  default: () => <div>compact-shell-narrow</div>,
}));

jest.mock('../hooks/useVisualViewportHeight', () => ({
  useVisualViewportHeight: () => {},
}));

jest.mock('../hooks/useGameConnection', () => {
  const { useEffect } = require('react');
  return {
    useGameConnection: () => {
      useEffect(() => {
        connectionMountSpy();
        return () => connectionCleanupSpy();
      }, []);
      return {
        isConnected: false,
        currentHost: '',
        currentPort: 0,
        lastError: null,
        connect: jest.fn(),
        disconnect: jest.fn(),
        sendRaw: jest.fn(),
      };
    },
  };
});

jest.mock('../hooks/usePlugins', () => ({
  usePlugins: () => ({
    plugins: [],
    installed: [],
    getPlugin: jest.fn(),
    getInstallRecord: jest.fn(),
    isInstalled: jest.fn(() => false),
    isEnabled: jest.fn(() => false),
    installCorePlugin: jest.fn(),
    uninstallPlugin: jest.fn(),
    removePlugin: jest.fn(),
    enablePlugin: jest.fn(),
    disablePlugin: jest.fn(),
    setPluginEnabled: jest.fn(),
    updatePluginConfig: jest.fn(),
  }),
}));

jest.mock('../hooks/useEquipmentCapture', () => ({
  useEquipmentCapture: () => {},
}));

jest.mock('../hooks/useEquipmentDeltas', () => ({
  useEquipmentDeltas: () => {},
}));

jest.mock('../hooks/useAutoLeveling', () => ({
  useAutoLeveling: () => ({
    config: { mode: 'disabled' },
    setConfig: jest.fn(),
    runState: { status: 'idle' },
    socketReady: false,
    start: jest.fn(),
    stop: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    resetToDefaults: jest.fn(),
    moveNext: jest.fn(),
    movePrev: jest.fn(),
    rescanRoom: jest.fn(),
  }),
}));

jest.mock('../hooks/useMainContainer', () => ({
  useLayoutSizing: () => ({
    layoutVars: {},
    handleVerticalResizeMouseDown: jest.fn(),
    handleHorizontalResizeMouseDown: jest.fn(),
  }),
  useUserCssOverrides: () => ({
    userCssApplied: '',
    userCssDraft: '',
    setUserCssDraft: jest.fn(),
    isStyleModalOpen: false,
    openStyleModal: jest.fn(),
    closeStyleModal: jest.fn(),
    saveUserCss: jest.fn(),
    previewDraft: jest.fn(),
    discardDraft: jest.fn(),
  }),
  useMainContainer: () => ({
    isConnectModalOpen: false,
    openConnectModal: jest.fn(),
    closeConnectModal: jest.fn(),
    isLibraryModalOpen: false,
    openLibraryModal: jest.fn(),
    closeLibraryModal: jest.fn(),
    isEquipmentModalOpen: false,
    openEquipmentModal: jest.fn(),
    closeEquipmentModal: jest.fn(),
    isAccountModalOpen: false,
    openAccountModal: jest.fn(),
    closeAccountModal: jest.fn(),
  }),
}));

jest.mock('../hooks/useAuthCallback', () => ({
  useAuthCallback: () => {},
}));

jest.mock('../hooks/useBeforeUnloadGuard', () => ({
  useBeforeUnloadGuard: () => {},
}));

jest.mock('../hooks/useTerminal', () => ({
  useTerminal: () => ({
    containerRef: { current: null },
    showJump: false,
    handleJumpToLive: jest.fn(),
  }),
}));

// See MainContainer.test.tsx for why this is needed: terminalHost (the
// portal target) is created unconditionally now, so the real Terminal.tsx
// mounts here too and hits `new ResizeObserver(...)`, which jsdom lacks.
jest.mock('../components/Terminal', () => ({
  __esModule: true,
  default: () => <div>terminal-stub</div>,
}));

jest.mock('../features/userScripts/runtimeSingleton', () => ({
  RuntimeSingleton: {
    Instance: {
      GetUserScriptRuntime: {},
    },
  },
}));

jest.mock('../features/terminal/shatteredArchiveTerminal', () => ({
  ShatteredArchiveTerminal: {
    Instance: {},
  },
}));

// See MainContainer.test.tsx for why siteApi and AutoLevelingModal need
// dedicated mocks (both raise a compile-time TS1343 under ts-jest otherwise).
jest.mock('../features/auth/siteApi', () => ({
  SITE_ORIGIN: 'http://localhost:5000',
  siteApiBase: () => '/api/site',
}));

jest.mock('../components/AutoLevelingModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../hooks/useLibrary', () => {
  const stub = () => ({
    notes: [],
    books: [],
    notesById: new Map(),
    booksById: new Map(),
    userNotes: [],
    userNotesById: new Map(),
    refresh: jest.fn(),
    createNote: jest.fn(),
    createBook: jest.fn(),
    saveNote: jest.fn(),
    saveBook: jest.fn(),
    deleteNote: jest.fn(),
    deleteBook: jest.fn(),
    setBookPageBody: jest.fn(),
    tearOutBookPage: jest.fn(),
    addBookPage: jest.fn(),
    createUserNote: jest.fn(),
    saveUserNote: jest.fn(),
    deleteUserNote: jest.fn(),
  });
  return { __esModule: true, useLibrary: stub, default: stub };
});

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
}

describe('MainContainer — engine durability across a live theme switch', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setViewportWidth(1440);
    connectionMountSpy.mockClear();
    connectionCleanupSpy.mockClear();
  });

  afterEach(() => {
    pluginHost.shutdown();
    jest.restoreAllMocks();
  });

  it('keeps the connection mounted and does not double-subscribe a theme-activated plugin across default -> slate-amber -> default -> slate-amber', async () => {
    const enableSpy = jest.spyOn(pluginHost, 'enable');
    const disableSpy = jest.spyOn(pluginHost, 'disable');

    render(<MainContainer />);
    expect(await screen.findByText('classic-shell')).toBeInTheDocument();
    expect(connectionMountSpy).toHaveBeenCalledTimes(1);

    act(() => {
      setHudThemeId('slate-amber');
    });
    expect(await screen.findByText('compact-shell')).toBeInTheDocument();

    act(() => {
      setHudThemeId('default');
    });
    expect(await screen.findByText('classic-shell')).toBeInTheDocument();

    act(() => {
      setHudThemeId('slate-amber');
    });
    expect(await screen.findByText('compact-shell')).toBeInTheDocument();

    // The engine never tore down across any of the three flips above:
    // useGameConnection's mount effect ran exactly once for this
    // MainContainer instance, and its cleanup never ran — proving those were
    // re-renders of the SAME instance, not an unmount/remount.
    expect(connectionMountSpy).toHaveBeenCalledTimes(1);
    expect(connectionCleanupSpy).not.toHaveBeenCalled();

    // slate-amber's onActivate (pluginHost.enable('world-time-and-identity'))
    // re-fires on every entry into slate-amber — it did so twice above — but
    // pluginHost.enable() itself is guarded (`if (s.enabled.has(id)) return`),
    // so only the FIRST call actually created anything. That guard is what
    // stands in for the plugin's timers/aliases/listeners never being
    // duplicated: they're only ever created inside that one call.
    const worldTimeEnableCalls = enableSpy.mock.calls.filter(([id]) => id === 'world-time-and-identity');
    expect(worldTimeEnableCalls.length).toBe(2);
    expect(pluginHost.isEnabled('world-time-and-identity')).toBe(true);

    // Never auto-disabled by switching away — matches themeRegistry.ts's
    // documented contract ("Never auto-DISABLES anything").
    expect(disableSpy).not.toHaveBeenCalled();
  });
});
