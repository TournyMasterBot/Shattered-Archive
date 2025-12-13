// apps/game-client/src/types/fengari.d.ts

declare module 'fengari' {
  // These are intentionally loose – we just want TS to stop erroring.
  export const lua: any;
  export const lauxlib: any;
  export const lualib: any;

  // Some builds may also rely on a default export
  const fengari: any;
  export default fengari;
}
