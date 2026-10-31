// Must stay the first import: it migrates legacy `default` storage keys before
// any store module reads localStorage at import time.
import { connectionIdMigrationReady } from './features/connection/connectionIdMigrationBoot';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/Global.module.scss';

const root = document.getElementById('root') as HTMLElement;

// The migration promise never rejects; render regardless of its outcome.
void connectionIdMigrationReady.then(() => {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
