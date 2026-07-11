import { useCallback, useMemo, useState } from 'react';
import {
  legalActions,
  type Action,
  type Side,
} from '@shatteredarchive/kingdom-tactics-engine';

import { Arena } from '../arena';
import { providers } from '../../state/providers';
import { useNav } from '../../state/nav';
import { useKtMatch } from './hooks/useKtMatch';
import type { SocketFactory } from './kt-socket';
import { DEFAULT_KT_WS, DEFAULT_KT_MATCH_ID } from './kt-config';
import './OnlineMatchScreen.css';

/** How the human's seat fared once the server decides the match. */
function outcomeText(side: Side | null, winner: Side | 'draw' | null): string {
  if (winner === 'draw' || winner === null) return 'Draw';
  if (side !== null && winner === side) return 'Victory!';
  return 'Defeat';
}

/**
 * Online multiplayer screen. Pre-connect it shows a small connect form (match id + server URL);
 * connected it drives the reused controlled {@link Arena} entirely from server snapshots — the
 * board renders the authoritative `snapshot`, the arena is interactive only on the human's turn,
 * and submitted moves go back over the socket via `submit`. All rules stay server-side; this
 * screen only configures the connection and renders frames. `socketFactory` is injectable for tests.
 */
export function OnlineMatchScreen({ socketFactory }: { readonly socketFactory?: SocketFactory } = {}) {
  const { navigate } = useNav();
  const kt = useKtMatch(socketFactory);
  const { snapshot, side, status, error, over, winner } = kt;

  const [matchId, setMatchId] = useState(DEFAULT_KT_MATCH_ID);
  const [url, setUrl] = useState(DEFAULT_KT_WS);

  const connected = status !== 'idle';

  const legalActionsFor = useCallback(
    (tokenId: string): Action[] => {
      if (!snapshot) return [];
      return legalActions(snapshot, snapshot.activeSide, providers).filter(
        (a) => a.type !== 'end-turn' && a.tokenId === tokenId,
      );
    },
    [snapshot],
  );

  const myTurn = useMemo(
    () => !!snapshot && side !== null && snapshot.activeSide === side && !over,
    [snapshot, side, over],
  );

  const leaveToMenu = useCallback(() => {
    kt.leave();
    navigate('menu');
  }, [kt, navigate]);

  return (
    <div className="kt-online">
      <header className="kt-online-head">
        <h1 className="kt-title">Kingdom Tactics — Online</h1>
        <button type="button" className="kt-btn kt-btn--ghost" onClick={leaveToMenu}>
          Back to menu
        </button>
      </header>

      {!connected ? (
        <form
          className="kt-online-connect"
          onSubmit={(e) => {
            e.preventDefault();
            kt.connect({ url, matchId });
          }}
        >
          <label className="kt-field">
            <span>Match id</span>
            <input value={matchId} onChange={(e) => setMatchId(e.target.value)} required />
          </label>
          <label className="kt-field">
            <span>Server URL</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} required />
          </label>
          <button type="submit" className="kt-btn kt-btn--primary">
            Connect
          </button>
        </form>
      ) : (
        <>
          <div className="kt-online-status" role="status">
            {error
              ? `Error: ${error}`
              : status === 'connecting'
                ? 'Connecting…'
                : !snapshot
                  ? 'Joining match…'
                  : over
                    ? 'Match complete.'
                    : myTurn
                      ? 'Your turn.'
                      : 'Waiting for opponent…'}
          </div>

          {over && (
            <div className="kt-banner" role="status">
              <h2 className="kt-banner-title">{outcomeText(side, winner)}</h2>
              <div className="kt-banner-actions">
                <button type="button" className="kt-btn kt-btn--primary" onClick={leaveToMenu}>
                  Leave
                </button>
              </div>
            </div>
          )}

          {snapshot && side !== null && (
            <Arena
              state={snapshot}
              controllableSide={side}
              legalActionsFor={legalActionsFor}
              onAct={kt.submit}
              interactive={myTurn}
            />
          )}
        </>
      )}
    </div>
  );
}
