import type { CopilotRuntime } from './loader';

/**
 * The only entry to Copilot. `__COPILOT_LOCAL__` is a build-time constant (vite `define`, from the PROCESS environment only): with it
 * false, the branch below and the dynamic import in it are removed, so the production bundle holds no Copilot code. Never import
 * anything else from this folder outside it.
 */
export async function startCopilot(): Promise<CopilotRuntime | undefined> {
  if (!__COPILOT_LOCAL__) return undefined;
  const { getCopilotRuntime } = await import('./loader');
  return getCopilotRuntime();
}
