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

      <footer className="ss-footer">Every game lives only in this browser — no accounts, no server round-trip.</footer>
    </div>
  );
}
