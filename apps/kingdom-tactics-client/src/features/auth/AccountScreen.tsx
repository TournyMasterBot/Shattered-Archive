import { Arena } from '../arena';
import { useNav } from '../../state/nav';
import { useAccountScreen } from './useAccountScreen';
import './AccountScreen.css';

/**
 * Phase F: optional cloud account — login (kt-server's own SSO hand-off), match history with a
 * server-replayed viewer (reuses `Arena` in read-only mode, no re-implementation of rendering),
 * and army-layout cloud save/load. Logged out is the default and fully-supported state; nothing
 * else in this app requires an account.
 */
export function AccountScreen() {
  const { navigate } = useNav();
  const account = useAccountScreen();

  if (account.replaySnapshots) {
    const snapshot = account.replaySnapshots[account.replayStep];
    return (
      <div className="kt-account">
        <header className="kt-account-head">
          <h1 className="kt-title">Replay</h1>
          <button type="button" className="kt-btn kt-btn--ghost" onClick={account.closeReplay}>
            Back to Account
          </button>
        </header>

        <div className="kt-hud" aria-label="Replay status">
          <span>
            Step {account.replayStep + 1} / {account.replaySnapshots.length}
          </span>
          <span>·</span>
          <span>Turn {snapshot.turn}</span>
          {snapshot.status === 'decided' && (
            <>
              <span>·</span>
              <span>{snapshot.winner === undefined || snapshot.winner === 'draw' ? 'Draw' : `Side ${snapshot.winner} wins`}</span>
            </>
          )}
        </div>

        <div className="kt-replay-controls">
          <button type="button" className="kt-btn" onClick={() => account.stepReplay(-1)} disabled={account.replayStep === 0}>
            ◀ Prev
          </button>
          <button
            type="button"
            className="kt-btn"
            onClick={() => account.stepReplay(1)}
            disabled={account.replayStep >= account.replaySnapshots.length - 1}
          >
            Next ▶
          </button>
        </div>

        <Arena state={snapshot} controllableSide={-1} legalActionsFor={() => []} onAct={() => {}} interactive={false} />
      </div>
    );
  }

  return (
    <div className="kt-account">
      <header className="kt-account-head">
        <h1 className="kt-title">Account</h1>
        <button type="button" className="kt-btn kt-btn--ghost" onClick={() => navigate('menu')}>
          Back to menu
        </button>
      </header>

      {!account.isLoggedIn && (
        <div className="kt-account-body">
          <p className="kt-subtitle">
            Log in with your Shattered Archive account to save match history and army layouts to
            the cloud. This is optional — everything keeps working locally without it.
          </p>
          <button type="button" className="kt-btn kt-btn--primary" onClick={account.handleLogin} disabled={account.busy}>
            Log in with Shattered Archive account
          </button>
        </div>
      )}

      {account.isLoggedIn && (
        <div className="kt-account-body">
          <section className="kt-card">
            <div className="kt-card-head">
              <h2 className="kt-card-title">Army layouts</h2>
            </div>
            <p className="kt-card-blurb">Save your locally-saved army layouts to the cloud, or load whatever was last saved there.</p>
            <div className="kt-account-actions">
              <button type="button" className="kt-btn" onClick={account.handleSaveArmiesToCloud} disabled={account.busy}>
                Save to cloud
              </button>
              <button type="button" className="kt-btn" onClick={account.handleLoadArmiesFromCloud} disabled={account.busy}>
                Load from cloud
              </button>
            </div>
          </section>

          <section className="kt-card">
            <div className="kt-card-head">
              <h2 className="kt-card-title">Match history</h2>
            </div>
            {account.history.length === 0 ? (
              <p className="kt-card-blurb">No matches recorded yet — play an online match while logged in to see it here.</p>
            ) : (
              <ul className="kt-history-list">
                {account.history.map((entry) => (
                  <li key={entry.id} className="kt-history-item">
                    <span>{new Date(entry.playedAt).toLocaleString()}</span>
                    <span>·</span>
                    <span>{entry.winner === 'draw' ? 'Draw' : `Side ${entry.winner} won`}</span>
                    <button type="button" className="kt-btn kt-btn--sm" onClick={() => account.handleViewReplay(entry.id)} disabled={account.busy}>
                      Replay
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <button type="button" className="kt-btn" onClick={account.handleLogout} disabled={account.busy}>
            Log out
          </button>
        </div>
      )}

      {account.status?.kind === 'ok' && <p className="kt-status-ok">{account.status.text}</p>}
      {account.status?.kind === 'err' && <p className="kt-status-err">{account.status.text}</p>}
    </div>
  );
}
