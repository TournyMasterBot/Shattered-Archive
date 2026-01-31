// apps\game-client\src\features\plugins\routed-gmcp-events.ts
export const ROUTED_WINDOW_EVENTS: string[] = [
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
  'event:flee',
  'event:damage',
  'event:creature-death',
  'event:level-up'
];
