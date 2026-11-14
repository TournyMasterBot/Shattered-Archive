// Gate 1 at the entry point: with the build flag false, importing the app entry never touches the Copilot folder.
const copilotRequired = jest.fn();
jest.mock('./features/copilot', () => {
  copilotRequired();
  return { startCopilot: jest.fn(async () => undefined) };
});
jest.mock('./features/connection/connectionIdMigrationBoot', () => ({ connectionIdMigrationReady: new Promise(() => undefined) }));
jest.mock('./App', () => ({ App: () => null }));
jest.mock('react-dom/client', () => ({ createRoot: () => ({ render: () => undefined }), default: { createRoot: () => ({ render: () => undefined }) } }));
jest.mock('./styles/Global.module.scss', () => ({}), { virtual: true });

describe('src/main', () => {
  beforeEach(() => {
    jest.resetModules();
    copilotRequired.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
  });
  afterEach(() => {
    (globalThis as { __COPILOT_LOCAL__?: boolean }).__COPILOT_LOCAL__ = false;
  });

  it('does not require the Copilot module when the flag is false (production)', async () => {
    (globalThis as { __COPILOT_LOCAL__?: boolean }).__COPILOT_LOCAL__ = false;
    await import('./main');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(copilotRequired).not.toHaveBeenCalled();
  });

  it('starts Copilot when the flag is true (the dev build)', async () => {
    (globalThis as { __COPILOT_LOCAL__?: boolean }).__COPILOT_LOCAL__ = true;
    await import('./main');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(copilotRequired).toHaveBeenCalledTimes(1);
  });

  it('reports, and survives, a Copilot module that fails to start', async () => {
    (globalThis as { __COPILOT_LOCAL__?: boolean }).__COPILOT_LOCAL__ = true;
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.doMock('./features/copilot', () => ({
      startCopilot: async () => {
        throw new Error('boom');
      },
    }));
    try {
      await import('./main');
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(error).toHaveBeenCalledWith('[copilot] could not start', expect.any(Error));
    } finally {
      error.mockRestore();
    }
  });
});
