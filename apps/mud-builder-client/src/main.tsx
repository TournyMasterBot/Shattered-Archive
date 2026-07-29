import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.js';
import './index.css';

// This app has no router — every tab/area/map selection lives in plain in-memory
// React state, reset fresh on load. Without this, the browser's back/forward-cache
// (bfcache) can restore an OLD cached snapshot of the whole page (old React state and
// all) instead of the live app on Back/Forward, which looks like the UI randomly
// jumping to a previously-selected area/map from earlier in the session. Forcing a
// real reload on a bfcache restore keeps Back/Forward showing current, live state.
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
