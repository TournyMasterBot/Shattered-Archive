// apps\game-client\src\features\plugins\routed-gmcp-events.ts
export const ROUTED_WINDOW_EVENTS: string[] = [
  // Main game received data (non-gmcp)
  'shatteredarchive:raw-data',
  // Raw GMCP events emitted from the game
  'game:tick',
  'game:char-data',
  'game:room-data',
  'game:affects-trueup',
  'game:affect-added',
  'game:affect-removed',
  'game:character-login',
  'game:gmcp',
  // Custom ShatteredArchive events
  'event:disarm',
  'event:wield:primary',
  'event:wield:secondary',
  'event:gear:wear',
  'event:gear:remove',
  'event:flee:success',
  'event:flee:failed',
  'shatteredarchive:movement-succeeded',
  'event:damage',
  'event:creature-death',
  'event:level-up',
];
