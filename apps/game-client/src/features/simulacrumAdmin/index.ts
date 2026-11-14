import type { SimulacrumAdminRuntime } from './loader';

/**
 * The only entry to Simulacrum Admin. `__SIMULACRUM_ADMIN_LOCAL__` is a build-time constant (vite `define`, from the PROCESS environment
 * only): with it false, the branch below and the dynamic import in it are removed, so the production bundle holds no Simulacrum Admin code.
 * Never import anything else from this folder outside it, and never from a module that is not itself behind the constant.
 */
export async function startSimulacrumAdmin(): Promise<SimulacrumAdminRuntime | undefined> {
  if (!__SIMULACRUM_ADMIN_LOCAL__) return undefined;
  const { getSimulacrumAdminRuntime } = await import('./loader');
  return getSimulacrumAdminRuntime();
}
