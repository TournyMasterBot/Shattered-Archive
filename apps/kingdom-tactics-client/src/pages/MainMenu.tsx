import { useNav } from '../state/nav';
import { loadLastMatch } from '../state/last-match';
import { QUICK_MATCH_SETUP } from '../features/match';

/**
 * The client's landing screen. "Quick Match" seeds a default local match vs the Greedy AI;
 * "Hot-seat Match" runs the same setup with two human seats; "Play last" replays the most
 * recent setup (persisted across reloads); Army Builder, Scenario, Simulator, and Online Match
 * route to their screens.
 */

export function MainMenu() {
  const { navigate, startMatch } = useNav();
  const lastMatch = loadLastMatch();
  return (
    <div className="kt-menu">
      <header className="kt-menu-head">
        <p className="kt-eyebrow">Shattered Archive</p>
        <h1 className="kt-title">Kingdom&nbsp;Tactics</h1>
        <p className="kt-subtitle">A deterministic, grid-based tactics arena.</p>
      </header>

      <nav className="kt-menu-actions" aria-label="Main menu">
        <button type="button" className="kt-btn kt-btn--primary" onClick={() => startMatch(QUICK_MATCH_SETUP)}>
          Quick Match
        </button>
        <button
          type="button"
          className="kt-btn"
          onClick={() => startMatch({ ...QUICK_MATCH_SETUP, hotSeat: true })}
        >
          Hot-seat Match
        </button>
        {lastMatch && (
          <button type="button" className="kt-btn" onClick={() => startMatch(lastMatch)}>
            Play last
          </button>
        )}
        <button type="button" className="kt-btn" onClick={() => navigate('army-builder')}>
          Army Builder
        </button>
        <button type="button" className="kt-btn" onClick={() => navigate('scenario')}>
          Scenario
        </button>
        <button type="button" className="kt-btn" onClick={() => navigate('simulator')}>
          Simulator
        </button>
        <button type="button" className="kt-btn" onClick={() => navigate('online')}>
          Online Match
        </button>
        <button type="button" className="kt-btn" onClick={() => navigate('account')}>
          Account
        </button>
      </nav>
    </div>
  );
}
