import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.js';
import './index.css';

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
