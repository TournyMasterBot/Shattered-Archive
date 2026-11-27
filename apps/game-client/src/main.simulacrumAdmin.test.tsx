// Gate 1 at the entry point: with the build flag false, importing the app entry never touches the Simulacrum Admin folder, and the
// Copilot switch has no effect on it (LOCAL-04).
const adminRequired = jest.fn();
const copilotRequired = jest.fn();
jest.mock('./features/simulacrumAdmin', () => {
  adminRequired();
  return { startSimulacrumAdmin: jest.fn(async () => undefined) };
});
jest.mock('./features/copilot', () => {
  copilotRequired();
  return { startCopilot: jest.fn(async () => undefined) };
});
jest.mock('./features/connection/connectionIdMigrationBoot', () => ({ connectionIdMigrationReady: new Promise(() => undefined) }));
jest.mock('./App', () => ({ App: () => null }));
jest.mock('react-dom/client', () => ({ createRoot: () => ({ render: () => undefined }), default: { createRoot: () => ({ render: () => undefined }) } }));
jest.mock('./styles/Global.module.scss', () => ({}), { virtual: true });

type Flags = { __COPILOT_LOCAL__?: boolean; __SIMULACRUM_ADMIN_LOCAL__?: boolean };
const flags = (copilot: boolean, admin: boolean): void => {
  (globalThis as Flags).__COPILOT_LOCAL__ = copilot;
  (globalThis as Flags).__SIMULACRUM_ADMIN_LOCAL__ = admin;
};
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe('src/main: Simulacrum Admin', () => {
  beforeEach(() => {
    jest.resetModules();
    adminRequired.mockClear();
    copilotRequired.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
  });
  afterEach(() => flags(false, false));

  it('does not require the module when its flag is false (production)', async () => {
    flags(false, false);
    await import('./main');
    await settle();
    expect(adminRequired).not.toHaveBeenCalled();
  });

  it('starts it when its flag is true, and leaves Copilot alone when that flag is false', async () => {
    flags(false, true);
    await import('./main');
    await settle();
    expect(adminRequired).toHaveBeenCalledTimes(1);
    expect(copilotRequired).not.toHaveBeenCalled();
  });

  it('does not start it because the Copilot flag is true', async () => {
    flags(true, false);
    await import('./main');
    await settle();
    expect(adminRequired).not.toHaveBeenCalled();
    expect(copilotRequired).toHaveBeenCalledTimes(1);
  });

  it('reports, and survives, a module that fails to start', async () => {
    flags(false, true);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.doMock('./features/simulacrumAdmin', () => ({
      startSimulacrumAdmin: async () => {
        throw new Error('boom');
      },
    }));
    try {
      await import('./main');
      await settle();
      expect(error).toHaveBeenCalledWith('[simulacrum-admin] could not start', expect.any(Error));
    } finally {
      error.mockRestore();
    }
  });
});
