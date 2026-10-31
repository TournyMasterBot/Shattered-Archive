// apps/game-client/src/features/connection/connectionIdMigrationBoot.ts
//
// Imported FIRST by main.tsx, before App: the localStorage half of the migration
// runs as this module evaluates, ahead of stores that read localStorage at import
// time (equipment-store). main.tsx waits on `connectionIdMigrationReady` for the
// IndexedDB half before rendering.

import { runConnectionIdMigration } from './connectionIdMigration';

export const connectionIdMigrationReady = runConnectionIdMigration();
