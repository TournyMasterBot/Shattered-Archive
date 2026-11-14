describe('startCopilot', () => {
  afterEach(() => {
    (globalThis as { __COPILOT_LOCAL__?: boolean }).__COPILOT_LOCAL__ = false;
    jest.resetModules();
  });

  it('does nothing, and never loads the loader, when the build flag is false', async () => {
    (globalThis as { __COPILOT_LOCAL__?: boolean }).__COPILOT_LOCAL__ = false;
    const loaderLoaded = jest.fn();
    jest.doMock('./loader', () => {
      loaderLoaded();
      return { getCopilotRuntime: () => ({}) };
    });
    const { startCopilot } = await import('./index');
    expect(await startCopilot()).toBeUndefined();
    expect(loaderLoaded).not.toHaveBeenCalled();
  });

  it('loads the plumbing when the build flag is true', async () => {
    (globalThis as { __COPILOT_LOCAL__?: boolean }).__COPILOT_LOCAL__ = true;
    jest.dontMock('./loader');
    const { startCopilot } = await import('./index');
    const copilot = await startCopilot();
    expect(copilot?.marker).toBe('sa-copilot-local-v1');
    // the page's one runtime: the window later takes its command gate from the same object
    const { getCopilotRuntime } = await import('./loader');
    expect(getCopilotRuntime()).toBe(copilot);
    expect(await startCopilot()).toBe(copilot);
    copilot?.dispose();
  });
});
