export type ConnectionSingleton = {
  ws: WebSocket | null;
  connectionId: string;
};

const KEY = '__shatteredarchive_connection__';

export function getConnectionSingleton(): ConnectionSingleton {
  const g = globalThis as any;
  if (!g[KEY]) g[KEY] = { ws: null, connectionId: '' } satisfies ConnectionSingleton;
  return g[KEY] as ConnectionSingleton;
}
