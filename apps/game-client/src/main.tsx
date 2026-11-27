// Must stay the first import: it migrates legacy `default` storage keys before
// any store module reads localStorage at import time.
import { connectionIdMigrationReady } from './features/connection/connectionIdMigrationBoot';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/Global.module.scss';

const root = document.getElementById('root') as HTMLElement;

// Local-only Copilot (docs/copilot/README.md). `__COPILOT_LOCAL__` is replaced by a literal at build time, so in a production build
// this whole branch, including the dynamic import, is removed and the bundle holds no Copilot code.
if (__COPILOT_LOCAL__) {
  import('./features/copilot')
    .then((copilot) => copilot.startCopilot())
    .catch((error: unknown) => console.error('[copilot] could not start', error));
}

// Local-only Simulacrum Admin (docs/game/simulacrum-admin.md): a second, independent switch. Replaced by a literal at build time, so a
// production build removes this branch and its import.
if (__SIMULACRUM_ADMIN_LOCAL__) {
  import('./features/simulacrumAdmin')
    .then((simulacrumAdmin) => simulacrumAdmin.startSimulacrumAdmin())
    .catch((error: unknown) => console.error('[simulacrum-admin] could not start', error));
}

// Local-only second world for the map window (the Simulacrum's map, shown while the client is connected to the Simulacrum). Under the
// Simulacrum Admin switch because that is the flag for "the Simulacrum exists on this machine"; its own branch and import, so a production
// build removes both and has neither the module nor its route (scripts/check-local-only.mjs).
if (__SIMULACRUM_ADMIN_LOCAL__) {
  import('./features/worldmap/localWorld')
    .then((world) => world.startLocalMapWorld())
    .catch((error: unknown) => console.error('[map-world] could not start', error));
}

// The migration promise never rejects; render regardless of its outcome.
void connectionIdMigrationReady.then(() => {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
