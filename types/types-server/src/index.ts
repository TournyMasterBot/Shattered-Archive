export interface ServerHealth {
  status: 'ok' | 'degraded' | 'down';
  uptimeSeconds: number;
}

export * from './mud-client-types/mud-client-app';
export * from './mud-client-types/telnet-client';
export * from './logger-types/index';
