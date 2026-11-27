// Gate 1 at the entry point for the map's second world (the Simulacrum's map): with the build flag false (production) the app entry never
// touches the module that names that world, and the Copilot switch has no effect on it.
const worldRequired = jest.fn();
const copilotRequired = jest.fn();
const start = jest.fn(() => () => undefined);
jest.mock('./features/worldmap/localWorld', () => {
  worldRequired();
  return { startLocalMapWorld: (...a: unknown[]) => (start as (...b: unknown[]) => unknown)(...a) };
});
jest.mock('./features/simulacrumAdmin', () => ({ startSimulacrumAdmin: jest.fn(async () => undefined) }));
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

describe('src/main: the map\'s second world', () => {
  beforeEach(() => {
    jest.resetModules();
    worldRequired.mockClear();
    copilotRequired.mockClear();
    start.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
  });
  afterEach(() => flags(false, false));

  it('does not require the module when the Simulacrum flag is false (production)', async () => {
    flags(false, false);
    await import('./main');
    await settle();
    expect(worldRequired).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('does not start it because the Copilot flag is true', async () => {
    flags(true, false);
    await import('./main');
    await settle();
    expect(worldRequired).not.toHaveBeenCalled();
    expect(copilotRequired).toHaveBeenCalledTimes(1);
  });

  it('starts it when the Simulacrum flag is true', async () => {
    flags(false, true);
    await import('./main');
    await settle();
    expect(worldRequired).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('reports, and survives, a module that fails to start', async () => {
    flags(false, true);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.doMock('./features/worldmap/localWorld', () => ({
      startLocalMapWorld: () => {
        throw new Error('boom');
      },
    }));
    try {
      await import('./main');
      await settle();
      expect(error).toHaveBeenCalledWith('[map-world] could not start', expect.any(Error));
    } finally {
      error.mockRestore();
    }
  });
});
