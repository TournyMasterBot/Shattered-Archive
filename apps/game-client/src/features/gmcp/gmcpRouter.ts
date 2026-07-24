// apps/game-client/src/features/gmcp/gmcpRouter.ts
import { DispatchEvent, ListenEvent } from '../event-emitter/event-dispatcher';
import { GameRemoteServerGmcp } from '../../types/event-types/game-remote-server-gmcp';

/**
 * Raw GMCP wire format (confirmed against merc-mud's gmcp_send(), 2026-07-23):
 * "<package> <json>", e.g. `char_data {"hp":100,...}`. Same convention
 * DslScripts/src/dsl/processors/gmcp-processor.ts already parses against
 * real gameplay -- this module is the game-client equivalent, redispatching
 * to the typed `game:*` events the existing hooks (useCharData, useRoomHeader,
 * useAffectsBlock, tickStore) already consume but nothing was ever producing.
 */
const PACKAGE_EVENT: Record<string, string> = {
  char_data: 'game:char-data',
  room_data: 'game:room-data',
  tick: 'game:tick',
  affect_data: 'game:affects-trueup',
  add_affect: 'game:affect-added',
  remove_affect: 'game:affect-removed',
};

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function parseGmcpMessage(raw: string): { pkg: string; data: Record<string, unknown> } | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;

  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) return null;

  const pkg = trimmed.slice(0, spaceIdx);
  if (!(pkg in PACKAGE_EVENT)) return null;

  const jsonText = trimmed.slice(spaceIdx + 1).trim();

  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch (err) {
    console.error('[gmcpRouter] failed to parse GMCP JSON', { pkg, jsonText, err });
    return null;
  }

  if (!isPlainObject(data)) {
    console.error('[gmcpRouter] GMCP payload was not a JSON object', { pkg, jsonText });
    return null;
  }

  return { pkg, data };
}

export function routeGmcpMessage(raw: string): void {
  const parsed = parseGmcpMessage(raw);
  if (!parsed) return;

  const eventName = PACKAGE_EVENT[parsed.pkg];

  // add_affect's consumer (useAffectsBlock) accepts either a bare affect
  // object or `{affect: {...}}` -- wrap it for clarity/symmetry with how
  // the composer names its own package.
  const payload = parsed.pkg === 'add_affect' ? { affect: parsed.data } : parsed.data;

  DispatchEvent(eventName, payload);
}

export function attachGmcpRouter(): () => void {
  return ListenEvent<GameRemoteServerGmcp>(
    'game:remote-server:gmcp',
    (detail) => {
      routeGmcpMessage(detail?.payload ?? '');
    },
    { key: 'gmcpRouter::game:remote-server:gmcp' },
  );
}
