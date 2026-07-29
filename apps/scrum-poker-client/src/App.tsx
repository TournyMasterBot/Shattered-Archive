import LandingPage from './features/landing/LandingPage.js';
import RoomPage from './features/room/RoomPage.js';
import AdSlot from './features/shared/AdSlot.js';
import CopyButton from './features/shared/CopyButton.js';
import ThemeToggle from './features/shared/ThemeToggle.js';
import { roomPath, useRoute } from './routing/useRoute.js';
import { useTheme } from './theme/useTheme.js';
import './App.css';

/**
 * The shell: header, the two routes, and the single ad placement.
 *
 * `RoomPage` is keyed by room id so switching rooms remounts it — the connection hook holds a
 * socket, a participant id and a name in refs, and reusing that instance across rooms would
 * carry one room's identity into the next.
 */
export default function App() {
  const { route, navigate } = useRoute();
  const { theme, toggle } = useTheme();

  return (
    <div className="sp-shell">
      <header className="sp-header">
        <button type="button" className="sp-brand" onClick={() => navigate('/')}>
          <span className="sp-brand-mark" aria-hidden="true">
            🂡
          </span>
          Scrum Poker
        </button>

        {route.name === 'room' && (
          <div className="sp-header-room">
            {/*
              A UUID is too long to read in a header, and nobody transcribes one anyway — the
              share mechanism is "Copy invite link" beside this. Show a recognizable stub so
              you can tell two rooms apart at a glance, with the full id on hover for anyone
              who does need it.
            */}
            <span className="sp-room-code" title={route.roomId}>
              Room {route.roomId.slice(0, 8)}
            </span>
          </div>
        )}

        <div className="sp-header-actions">
          {route.name === 'room' && <CopyButton value={window.location.href} label="Copy invite link" />}
          <ThemeToggle theme={theme} onToggle={toggle} />
        </div>
      </header>

      <main className="sp-main">
        {route.name === 'room' ? (
          <RoomPage key={route.roomId} roomId={route.roomId} onExit={() => navigate('/')} />
        ) : (
          <LandingPage onEnterRoom={(roomId) => navigate(roomPath(roomId))} />
        )}
      </main>

      <AdSlot />

      <footer className="sp-footer">Shattered Archive · rooms and names are transient and expire on their own</footer>
    </div>
  );
}
