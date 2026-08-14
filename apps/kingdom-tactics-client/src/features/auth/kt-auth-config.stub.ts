/**
 * Jest stub for `kt-auth-config.ts` (jest runs CJS and cannot parse `import.meta`). The client
 * jest config maps `./kt-auth-config` here; mirrors the real module's exports with static
 * defaults — same pattern as `features/net/kt-config.stub.ts`.
 */
export const SITE_ORIGIN = 'http://localhost:51000';

export function siteApiBase(): string {
  return '';
}
