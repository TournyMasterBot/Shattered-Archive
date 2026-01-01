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
