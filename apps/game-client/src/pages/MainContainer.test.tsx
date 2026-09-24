// apps/game-client/src/pages/MainContainer.test.tsx
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

// Terminal is now hoisted into an always-rendered portal (terminalHost is
// created unconditionally, not gated on any shell actually mounting a slot —
// see MainContainer.tsx), so it renders for real here even though the mocked
// shells below never call terminalSlotRef. The real Terminal.tsx calls
// `new ResizeObserver(...)` directly (not through useTerminal, so the mock
// above doesn't cover it), which jsdom doesn't implement — mock the
// component itself rather than polyfilling a browser API this suite has no
// other reason to need.
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

// '../features/auth/siteApi' evaluates `import.meta.env.VITE_SITE_API` at module
// top level. Requiring this file for real here (it's reached from AccountModal,
// LibraryModal, ContributeIdentifyModal and ContributeCreatureLoreModal, all
// rendered unconditionally below) reproducibly fails the whole suite to even
// start running under `pnpm --filter @shatteredarchive/game-client test`, with
// ts-jest reporting a *compile-time* TS1343 ("'import.meta' meta-property is
// only allowed when --module is ...") at this file's own import.meta.env lines
// — verified directly (including after `jest --clearCache`, to rule out a stale
// cache), not a runtime TypeError. That's notable because it's NOT a genuine
// tsconfig misconfiguration: building a real ts.Program with
// tsconfig.jest.client.json's own resolved compilerOptions (module resolves to
// ESNext, one of TS1343's own permitted values) does not raise TS1343 for this
// same code — so this is specifically how ts-jest's transform step behaves for
// this file under Jest, not something a plain `tsc` build of this project would
// hit. Whatever the precise mechanism, the practical effect is the same: this
// leaf module can't be required for real in this test, so it's mocked here
// (rather than mocking every modal that happens to import it) to let those
// modals keep rendering for real.
jest.mock('../features/auth/siteApi', () => ({
  SITE_ORIGIN: 'http://localhost:5000',
  siteApiBase: () => '/api/site',
}));

// AutoLevelingModal.tsx has its own `import.meta.env` reference at line 127
// (`(import.meta as any).env?.DEV`, inside `isAutoLevelingDebugEnabled()`).
// That specific reference is unreachable at runtime — the function's first line
// is `return false`, before the import.meta check is ever reached — so it can't
// cause a *runtime* problem. It still matters here for a different reason,
// verified by removing this mock and re-running the suite: ts-jest reports the
// same compile-time TS1343 described above, at AutoLevelingModal.tsx:127,
// before any test code runs. TS1343 is a parse-time/syntactic diagnostic tied to
// the compiler's `module` setting — it fires on the mere presence of the
// `import.meta` syntax, independent of whether that code path is ever executed,
// so the dead-code argument (true at runtime) doesn't prevent ts-jest from
// raising it at compile time. Confirmed reproducible after `jest --clearCache`.
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
