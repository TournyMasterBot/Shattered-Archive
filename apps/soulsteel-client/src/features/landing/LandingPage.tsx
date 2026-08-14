import { useEffect, useState } from 'react';

import { extractRoomId } from '../../routing/room-id.js';
import { deleteRoom, listRoomSummaries, type RoomSummary } from '../../storage/soulsteelDb.js';
import RulesModal from '../shared/RulesModal.js';

interface LandingPageProps {
  onEnterRoom: (roomId: string) => void;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export default function LandingPage({ onEnterRoom }: LandingPageProps) {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [pasted, setPasted] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [bulkDeleteDays, setBulkDeleteDays] = useState(30);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const refresh = () => {
    listRoomSummaries()
      .then((summaries) => setRooms(summaries))
      .catch(() => setRooms([]))
      .finally(() => setLoading(false));
  };

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

  const confirmedDelete = async (id: string) => {
    await deleteRoom(id);
    setConfirmDeleteId(null);
    refresh();
  };

  const cutoff = Date.now() - Math.max(1, bulkDeleteDays) * MS_PER_DAY;
  const oldRooms = rooms.filter((r) => new Date(r.updatedAt).getTime() < cutoff);

  const confirmedBulkDelete = async () => {
    await Promise.all(oldRooms.map((r) => deleteRoom(r.id)));
    setConfirmBulkDelete(false);
    refresh();
  };

  return (
    <div className="ss-landing">
      <p className="ss-tagline">
        Track players, roles, nightly actions, and eliminations for The Umbral Cloak and the Soulsteel Dagger.
      </p>

      <button type="button" className="ss-new-game" onClick={() => onEnterRoom(crypto.randomUUID())}>
        Start a new game
      </button>

      <button type="button" className="ss-rules-link" onClick={() => setRulesOpen(true)}>
        📜 Read the rules
      </button>

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}

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
          <>
            <ul>
              {rooms.map((r) => (
                <li key={r.id}>
                  {confirmDeleteId === r.id ? (
                    <div className="ss-resume-item-confirm">
                      <span>
                        Delete this Day {r.dayNumber} game ({r.playerCount} player{r.playerCount === 1 ? '' : 's'})?
                      </span>
                      <button type="button" onClick={() => void confirmedDelete(r.id)}>
                        Delete
                      </button>
                      <button type="button" onClick={() => setConfirmDeleteId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <button type="button" onClick={() => onEnterRoom(r.id)}>
                        Day {r.dayNumber} · {r.playerCount} player{r.playerCount === 1 ? '' : 's'} · updated{' '}
                        {new Date(r.updatedAt).toLocaleString()}
                      </button>
                      <button
                        type="button"
                        className="ss-resume-item-delete"
                        aria-label="Delete this game"
                        onClick={() => setConfirmDeleteId(r.id)}
                      >
                        ✕
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>

            <div className="ss-bulk-delete">
              {confirmBulkDelete ? (
                <div className="ss-resume-item-confirm">
                  <span>
                    Delete {oldRooms.length} game{oldRooms.length === 1 ? '' : 's'} older than {bulkDeleteDays} day
                    {bulkDeleteDays === 1 ? '' : 's'}?
                  </span>
                  <button type="button" onClick={() => void confirmedBulkDelete()} disabled={oldRooms.length === 0}>
                    Delete
                  </button>
                  <button type="button" onClick={() => setConfirmBulkDelete(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="ss-bulk-delete-row">
                  <label htmlFor="ss-bulk-delete-days">Delete games older than</label>
                  <input
                    id="ss-bulk-delete-days"
                    type="number"
                    min={1}
                    value={bulkDeleteDays}
                    onChange={(e) => setBulkDeleteDays(Math.max(1, Number(e.target.value) || 1))}
                  />
                  <span>days</span>
                  <button type="button" onClick={() => setConfirmBulkDelete(true)} disabled={oldRooms.length === 0}>
                    Delete old games
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
