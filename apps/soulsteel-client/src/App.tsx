import LandingPage from './features/landing/LandingPage.js';
import RoomPage from './features/room/RoomPage.js';
import ParticleField from './features/shared/ParticleField.js';
import { roomPath, useRoute } from './routing/useRoute.js';
import './App.css';

/**
 * The shell: header + the two routes. `RoomPage` is keyed by room id so switching rooms remounts
 * it, matching scrum-poker-client's `App.tsx` (avoids carrying one room's loaded state into the
 * next).
 */
export default function App() {
  const { route, navigate } = useRoute();

  return (
    <div className="ss-shell">
      <ParticleField />

      <header className="ss-header">
        <button type="button" className="ss-brand" onClick={() => navigate('/')}>
          <span className="ss-brand-mark" aria-hidden="true">
            🗡
          </span>
          Soulsteel
        </button>
      </header>

      <main className="ss-main">
        {route.name === 'room' ? (
          <RoomPage key={route.roomId} roomId={route.roomId} onExit={() => navigate('/')} />
        ) : (
          <LandingPage onEnterRoom={(roomId) => navigate(roomPath(roomId))} />
        )}
      </main>

      {/*
        The privacy link is not decoration: this page carries a GA4 tag (see
        src/features/shared/analytics.ts), and a reachable notice disclosing it is what makes
        the cookie table discoverable. It points at the .dev landing host because that is where
        the notice for this constellation lives (deploy/privacy.html) — this app serves no
        static pages of its own. Mirrors scrum-poker-client's App.tsx footer.
      */}
      <footer className="ss-footer">
        Every game lives only in this browser — no accounts, no server round-trip ·{' '}
        <a href="https://shatteredarchive.dev/privacy" target="_blank" rel="noopener noreferrer">
          Privacy
        </a>
      </footer>
    </div>
  );
}
