// apps/game-client/src/features/autoleveling/autoleveling-index.ts

export { AUTOLEVELING_CONFIG_VERSION, createDefaultAutoLevelConfig } from './autoleveling-defaults';

// Storage exports (real names)
export { loadAutoLevelConfig, saveAutoLevelConfig } from './autoleveling-storage';

// Engine export (real name)
export { AutoLevelingEngine } from './autoleveling-engine';

/* ---------- Back-compat aliases (optional) ---------- */

// If any older code used these spellings, keep them working:
export { loadAutoLevelConfig as loadAutoLevelingConfig } from './autoleveling-storage';
export { saveAutoLevelConfig as saveAutoLevelingConfig } from './autoleveling-storage';
export { createDefaultAutoLevelConfig as createDefaultAutoLevelingConfig } from './autoleveling-defaults';
