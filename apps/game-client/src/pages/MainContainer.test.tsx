// apps/game-client/src/pages/MainContainer.test.tsx
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MainContainer } from './MainContainer';
import { setHudLayout } from '../features/hudLayout/hudLayoutStore';

// ---------------------------------------------------------------------------
// MainContainer pulls in a lot of app wiring — a WebSocket connection, plugin
// storage, equipment capture/delta parsing, auto-leveling, Lua/audio runtime
// init, and a couple of app-wide singletons. This test only exercises the
// shell-selection branch, so every hook module the component calls a hook
// from gets a minimal, non-throwing stub. Real (unmocked) child components
// (modals, MainMenuBar, FocusBarVitals, etc.) are left to render for real —
// they're all closed (`isOpen=false`) so they return null quickly.
// ---------------------------------------------------------------------------

jest.mock('../components/LayoutShell', () => ({
  __esModule: true,
  LayoutShell: () => <div>classic-shell</div>,
}));

jest.mock('../components/hud/CompactLayoutShell', () => ({
  __esModule: true,
  default: () => <div>compact-shell</div>,
}));

jest.mock('../hooks/useVisualViewportHeight', () => ({
  useVisualViewportHeight: () => {},
}));

jest.mock('../hooks/useGameConnection', () => ({
  useGameConnection: () => ({
    isConnected: false,
    currentHost: '',
    currentPort: 0,
    lastError: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
    sendRaw: jest.fn(),
  }),
}));

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

// '../features/auth/siteApi' uses `import.meta.env` (Vite-only syntax). Nothing
// in this repo previously exercised this file (or its transitive importers —
// AccountModal, LibraryModal, ContributeIdentifyModal, ContributeCreatureLoreModal
// all reach it via useAccountModal/useLibrary/direct import) under ts-jest, and
// requiring it for real here fails the whole suite to even compile with TS1343
// ("import.meta … only allowed when --module is …") — a pre-existing ts-jest/
// tsconfig gap unrelated to shell selection. Mocking this one leaf module (rather
// than each modal that happens to import it) keeps those modals rendering for
// real.
jest.mock('../features/auth/siteApi', () => ({
  SITE_ORIGIN: 'http://localhost:5000',
  siteApiBase: () => '/api/site',
}));

// AutoLevelingModal.tsx itself (not just something it imports) uses
// `import.meta.env` directly, so it hits the same TS1343 gap and must be
// mocked directly rather than via a leaf-module mock.
jest.mock('../components/AutoLevelingModal', () => ({
  __esModule: true,
  default: () => null,
}));

// LibraryModal is rendered unconditionally and calls useLibrary(connectionId)
// regardless of isOpen. useLibrary's mount effect calls into
// features/library/library-store.ts, which calls indexedDB.open() — jsdom has
// no IndexedDB implementation, so this throws synchronously outside of any
// try/catch. This is exactly the "IndexedDB" hazard called out for the hooks
// MainContainer calls directly; LibraryModal pulls in the same hazard one
// layer down, so it needs the same treatment.
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

describe('MainContainer — shell selection', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setViewportWidth(1440);
  });

  it('renders the classic shell by default', () => {
    render(<MainContainer />);
    expect(screen.getByText('classic-shell')).toBeInTheDocument();
  });

  it('renders the compact shell when the setting is on and the viewport is desktop-width', () => {
    setHudLayout('compact');
    render(<MainContainer />);
    expect(screen.getByText('compact-shell')).toBeInTheDocument();
  });

  it('falls back to the classic shell on a mobile-width viewport even if compact is selected', () => {
    setHudLayout('compact');
    setViewportWidth(600);
    render(<MainContainer />);
    expect(screen.getByText('classic-shell')).toBeInTheDocument();
  });
});
