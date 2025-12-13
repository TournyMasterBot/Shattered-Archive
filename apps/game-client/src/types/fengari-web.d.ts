// apps/game-client/src/types/fengari-web.d.ts

declare module 'fengari-web' {
  export const lua: any;
  export const lauxlib: any;
  export const lualib: any;
  export function to_luastring(str: string): any;
  export function to_jsstring(value: any): string;
}
