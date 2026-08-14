import { useEffect, useState } from 'react';

import { extractRoomId } from '../../routing/room-id.js';
import { listRoomSummaries, type RoomSummary } from '../../storage/soulsteelDb.js';

interface LandingPageProps {
  onEnterRoom: (roomId: string) => void;
}

export default function LandingPage({ onEnterRoom }: LandingPageProps) {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [pasted, setPasted] = useState('');

  useEffect(() => {
    let alive = true;
    listRoomSummaries()
      .then((summaries) => {
        if (alive) setRooms(summaries);
      })
      .catch(() => {
        if (alive) setRooms([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const openPasted = () => {
    const id = extractRoomId(pasted);
    if (id) onEnterRoom(id);
  };

  return (
    <div className="ss-landing">
      <p className="ss-tagline">
        Track players, roles, nightly actions, and eliminations for The Umbral Cloak and the Soulsteel Dagger.
      </p>

      <button type="button" className="ss-new-game" onClick={() => onEnterRoom(crypto.randomUUID())}>
        Start a new game
      </button>

      <div className="ss-resume-paste">
        <label htmlFor="ss-resume-input">Reopen a saved link</label>
        <div className="ss-resume-paste-row">
          <input
            id="ss-resume-input"
            type="text"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="Paste a room link or id"
          />
          <button type="button" onClick={openPasted} disabled={!pasted.trim()}>
            Open
          </button>
        </div>
      </div>

      <section className="ss-resume-list" aria-label="Resume a game on this device">
        <h2>Resume a game on this device</h2>
        {loading ? (
          <p>Loading…</p>
        ) : rooms.length === 0 ? (
          <p>No games saved on this browser yet.</p>
        ) : (
          <ul>
            {rooms.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onEnterRoom(r.id)}>
                  Day {r.dayNumber} · {r.playerCount} player{r.playerCount === 1 ? '' : 's'} · updated{' '}
                  {new Date(r.updatedAt).toLocaleString()}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
