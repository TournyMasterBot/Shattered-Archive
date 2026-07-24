import type { Room, RoomExit } from '@shatteredarchive/merc-area';

import { ROOM_FLAGS, SECTOR_TYPES, DOOR_NAMES, LOCK_STATES } from '../../data/flags.js';

interface Props {
  room: Room;
  onChange: (room: Room) => void;
  /** When given, a link jumps to the Resets tab's Simulate pane filtered to this room (Phase 13). */
  onOpenSpawn?: (vnum: number) => void;
}

/** Form-first room editor (the PRIMARY editing surface). */
export default function RoomEditor({ room, onChange, onOpenSpawn }: Props) {
  const set = (patch: Partial<Room>) => onChange({ ...room, ...patch });

  const setExit = (idx: number, patch: Partial<RoomExit>) => {
    const exits = room.exits.map((ex, i) => (i === idx ? { ...ex, ...patch } : ex));
    set({ exits });
  };

  const addExit = () => {
    const used = new Set(room.exits.map((e) => e.door));
    const door = [0, 1, 2, 3, 4, 5].find((d) => !used.has(d));
    if (door === undefined) return;
    set({ exits: [...room.exits, { door, description: '', keyword: '', locks: 0, key: 0, toVnum: 0 }] });
  };

  const removeExit = (idx: number) => set({ exits: room.exits.filter((_, i) => i !== idx) });

  return (
    <div className="mb-room-editor">
      <h3>
        Room #{room.vnum} <span className="mb-muted">— UI editor</span>
        {onOpenSpawn && (
          <button type="button" className="mb-ref-link mb-room-spawn-link" onClick={() => onOpenSpawn(room.vnum)}>
            See what spawns here →
          </button>
        )}
      </h3>

      <label className="mb-field">
        <span>Name</span>
        <input value={room.name} onChange={(e) => set({ name: e.target.value })} aria-label="Room name" />
      </label>

      <label className="mb-field">
        <span>Description</span>
        <textarea
          rows={6}
          value={room.description}
          onChange={(e) => set({ description: e.target.value })}
          aria-label="Room description"
        />
      </label>

      <div className="mb-row">
        <label className="mb-field">
          <span>Sector</span>
          <select
            value={room.sectorType}
            onChange={(e) => set({ sectorType: Number(e.target.value) })}
            aria-label="Sector type"
          >
            {SECTOR_TYPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="mb-field">
          <span>Heal rate</span>
          <input
            type="number"
            value={room.healRate ?? 100}
            onChange={(e) => set({ healRate: Number(e.target.value) })}
            aria-label="Heal rate"
          />
        </label>
        <label className="mb-field">
          <span>Mana rate</span>
          <input
            type="number"
            value={room.manaRate ?? 100}
            onChange={(e) => set({ manaRate: Number(e.target.value) })}
            aria-label="Mana rate"
          />
        </label>
      </div>

      <fieldset className="mb-flags">
        <legend>Room flags</legend>
        {ROOM_FLAGS.map((f) => (
          <label key={f.name} className="mb-flag">
            <input
              type="checkbox"
              checked={(room.roomFlags & f.bit) !== 0}
              onChange={(e) =>
                set({ roomFlags: e.target.checked ? room.roomFlags | f.bit : room.roomFlags & ~f.bit })
              }
            />
            {f.label}
          </label>
        ))}
      </fieldset>

      <fieldset className="mb-exits">
        <legend>
          Exits{' '}
          <button type="button" onClick={addExit} disabled={room.exits.length >= 6}>
            + add exit
          </button>
        </legend>
        {room.exits.map((ex, i) => (
          <div key={i} className="mb-exit-row">
            <select
              value={ex.door}
              onChange={(e) => setExit(i, { door: Number(e.target.value) })}
              aria-label={`Exit ${i} direction`}
            >
              {DOOR_NAMES.map((d, di) => (
                <option key={di} value={di}>
                  {d}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={ex.toVnum}
              onChange={(e) => setExit(i, { toVnum: Number(e.target.value) })}
              aria-label={`Exit ${i} target vnum`}
              title="Target room vnum"
            />
            <select
              value={ex.locks}
              onChange={(e) => setExit(i, { locks: Number(e.target.value) })}
              aria-label={`Exit ${i} lock state`}
            >
              {LOCK_STATES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
            <input
              placeholder="keyword (door name)"
              value={ex.keyword}
              onChange={(e) => setExit(i, { keyword: e.target.value })}
              aria-label={`Exit ${i} keyword`}
            />
            <input
              type="number"
              value={ex.key}
              onChange={(e) => setExit(i, { key: Number(e.target.value) })}
              aria-label={`Exit ${i} key vnum`}
              title="Key object vnum (-1 = none)"
            />
            <button type="button" onClick={() => removeExit(i)} title="Remove exit">
              ✕
            </button>
          </div>
        ))}
      </fieldset>
    </div>
  );
}
