// apps\game-client\src\features\plugins\routed-gmcp-events.ts
export const ROUTED_WINDOW_EVENTS: string[] = [
  // Raw messages from server
  'game:terminal-data',
  'text:line',
  'game:socket-open',
  'game:socket-closed',
  // Custom ShatteredArchive events
  'event:disarm',
  'event:wield:primary',
  'event:wield:secondary',
  'event:gear:wear',
  'event:gear:remove',
  'event:flee',
  'event:creature-death',
  'event:damage',
  // Raw GMCP events emitted from the game
  'game:tick',
  'game:char-data',
  'game:room-data',
  'game:affects-trueup',
  'game:affect-added',
  'game:affect-removed',
  'game:character-login',
  'game:gmcp',
];
