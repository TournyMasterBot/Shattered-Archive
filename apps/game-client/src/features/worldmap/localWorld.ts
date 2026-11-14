// apps/game-client/src/features/worldmap/localWorld.ts
//
// LOCAL ONLY. The Simulacrum's map: a second world, served by the owner's local site under /api/world-map/sandbox. This module is imported
// only inside `if (__SIMULACRUM_ADMIN_LOCAL__)` (main.tsx), so a production bundle has neither it nor the route string
// (scripts/check-local-only.mjs looks for "api/world-map/sandbox" in a production dist).
//
// The map follows the connection, not the player: the window shows the Simulacrum's map exactly while the client is connected to the
// Simulacrum (the same gate Simulacrum Admin uses), and the DSL's map otherwise.

import { ListenEvent } from '../event-emitter/event-dispatcher';
import { isSimulacrumConnection, readAdditions } from '../simulacrumAdmin/connectionGate';
import { registerMapWorld, setActiveMapWorld } from './world';

export const SANDBOX_WORLD_ID = 'sandbox';
/** One listener per key in the shared dispatcher: these are this module's own (see simulacrumAdmin/runtime.ts). */
export const KEY_OPEN = 'mapWorld::connection-open';
export const KEY_CLOSE = 'mapWorld::connection-close';

interface SocketPayload {
  host?: unknown;
  port?: unknown;
}

/** Registers the Simulacrum's world and starts following the connection. Returns the function that stops following. */
export function startLocalMapWorld(): () => void {
  registerMapWorld({ id: SANDBOX_WORLD_ID, label: 'Simulacrum', mapPrefix: '/api/world-map/sandbox' });
  const stopOpen = ListenEvent<SocketPayload>(
    'game:remote-server:open',
    (payload) => {
      const host = typeof payload?.host === 'string' ? payload.host : undefined;
      const port = typeof payload?.port === 'number' ? payload.port : undefined;
      // the owner's own additions (a LAN address of the Simulacrum) are in browser storage, read on every open like Simulacrum Admin does
      setActiveMapWorld(isSimulacrumConnection(host, port, readAdditions(window.localStorage)) ? SANDBOX_WORLD_ID : 'dsl');
    },
    { key: KEY_OPEN },
  );
  const stopClose = ListenEvent<SocketPayload>('game:remote-server:close', () => setActiveMapWorld('dsl'), { key: KEY_CLOSE });
  return () => {
    stopOpen();
    stopClose();
    setActiveMapWorld('dsl');
  };
}
