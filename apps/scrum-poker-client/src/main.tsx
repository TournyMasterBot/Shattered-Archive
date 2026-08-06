import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.js';
import { initAnalytics } from './features/shared/analytics.js';
import { storage } from './storage.js';
import './index.css';

// Fired once at startup rather than from a component effect: it is not React state, and a
// StrictMode double-invoke would otherwise try to inject the loader twice. A no-op unless a
// measurement id was supplied at build time — see features/shared/analytics.ts.
initAnalytics();

// Sweeps out any participant-secret/host-token keys a pre-2026-08-05 visit left in
// localStorage, now that both live in HttpOnly cookies instead — see storage.ts.
storage.cleanupLegacyCredentialKeys();

// The app holds a live websocket and in-memory room state. A back/forward-cache restore
// would hand back an OLD snapshot of the page — including a socket that is no longer open —
// which looks like a room frozen on stale votes. Forcing a real reload reconnects instead.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) window.location.reload();
});

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
