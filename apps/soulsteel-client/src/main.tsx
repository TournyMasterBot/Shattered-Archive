import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.js';
import { initAnalytics } from './features/shared/analytics.js';
import './index.css';

// Fired once at startup rather than from a component effect: it is not React state, and a
// StrictMode double-invoke would otherwise try to inject the loader twice. A no-op unless a
// measurement id was supplied at build time — see features/shared/analytics.ts.
initAnalytics();

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
