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

      {/*
        Landing-only (2026-08-06): a room page is where people are mid-task with a shared,
        low-distraction surface — the ad belongs on the entry page, not the working one. This
        also means the ad crawler no longer needs access to /room/* to serve a contextual
        creative there; see the robots-scrum-poker.conf comment this changed.
      */}
      {route.name === 'landing' && <AdSlot />}

      {/*
        The privacy link is not decoration: this page carries a Google ad unit and a GA4 tag,
        and a reachable notice disclosing them is both an AdSense requirement and the thing
        that makes the cookie/local-storage table discoverable. It points at the .dev landing
        host because that is where the notice for this constellation lives (deploy/privacy.html)
        — this app serves no static pages of its own.
      */}
      <footer className="sp-footer">
        Shattered Archive · rooms and names are transient and expire on their own ·{' '}
        <a href="https://shatteredarchive.dev/privacy" target="_blank" rel="noopener noreferrer">
          Privacy
        </a>
      </footer>
    </div>
  );
}
