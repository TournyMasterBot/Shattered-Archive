describe('startSimulacrumAdmin', () => {
  afterEach(() => {
    (globalThis as { __SIMULACRUM_ADMIN_LOCAL__?: boolean }).__SIMULACRUM_ADMIN_LOCAL__ = false;
    jest.resetModules();
  });

  it('does nothing, and never loads the loader, when the build flag is false', async () => {
    (globalThis as { __SIMULACRUM_ADMIN_LOCAL__?: boolean }).__SIMULACRUM_ADMIN_LOCAL__ = false;
    const loaderLoaded = jest.fn();
    jest.doMock('./loader', () => {
      loaderLoaded();
      return { getSimulacrumAdminRuntime: () => ({}) };
    });
    const { startSimulacrumAdmin } = await import('./index');
    expect(await startSimulacrumAdmin()).toBeUndefined();
    expect(loaderLoaded).not.toHaveBeenCalled();
  });

  it('loads the runtime when the build flag is true, and hands every caller the same one', async () => {
    (globalThis as { __SIMULACRUM_ADMIN_LOCAL__?: boolean }).__SIMULACRUM_ADMIN_LOCAL__ = true;
    jest.dontMock('./loader');
    const { startSimulacrumAdmin } = await import('./index');
    const runtime = await startSimulacrumAdmin();
    expect(runtime?.marker).toBe('sa-simulacrum-admin-local-v1');
    const { getSimulacrumAdminRuntime } = await import('./loader');
    expect(getSimulacrumAdminRuntime()).toBe(runtime);
    expect(await startSimulacrumAdmin()).toBe(runtime);
    runtime?.dispose();
  });

  it('is independent of the Copilot switch', async () => {
    (globalThis as { __COPILOT_LOCAL__?: boolean }).__COPILOT_LOCAL__ = true;
    (globalThis as { __SIMULACRUM_ADMIN_LOCAL__?: boolean }).__SIMULACRUM_ADMIN_LOCAL__ = false;
    try {
      const { startSimulacrumAdmin } = await import('./index');
      expect(await startSimulacrumAdmin()).toBeUndefined();
    } finally {
      (globalThis as { __COPILOT_LOCAL__?: boolean }).__COPILOT_LOCAL__ = false;
    }
  });
});
