import { useMemo, useState } from 'react';
import { buildIndex, sliceMap, type Link, type Room } from '@shatteredarchive/shattered-maps-core';
import { pendingItems, statusOf, tally, type ItemKind, type LinkEdits, type RoomEdits } from '../review';
import { useNeutral } from '../state';
import { activeMap } from '../store';
import styles from '../../styles/ReviewPanel.module.scss';

/**
 * Candidate review and the audited file's edits. With a candidates file open it lists what nobody has decided on in the current view,
 * and lets the curator accept, reject, or accept with changes, each with a note; accepted items go to the audited file. With the audited
 * file shown it edits the selected room or link. All the rules live in `review.ts`; this only gathers the choice and the note.
 */

const MAX_PENDING_SHOWN = 60;
const today = (): string => new Date().toISOString().slice(0, 10);

function RoomEditor({ room, verb, onSubmit }: { room: Room; verb: string; onSubmit: (edits: RoomEdits) => void }) {
  const [title, setTitle] = useState(room.title);
  const [description, setDescription] = useState(room.description ?? '');
  const [sector, setSector] = useState(room.sector ?? '');
  return (
    <form
      className={styles.editor}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ title, description, sector });
      }}
    >
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </label>
      <label>
        Terrain
        <input value={sector} onChange={(e) => setSector(e.target.value)} maxLength={200} />
      </label>
      <label>
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={8000} />
      </label>
      <button type="submit">{verb}</button>
    </form>
  );
}

function LinkEditor({ link, rooms, verb, onSubmit }: { link: Link; rooms: Room[]; verb: string; onSubmit: (edits: LinkEdits) => void }) {
  const [to, setTo] = useState<string>(link.to ?? '');
  const [state, setState] = useState<'' | 'candidate' | 'confirmed'>('');
  return (
    <form
      className={styles.editor}
      onSubmit={(e) => {
        e.preventDefault();
        const edits: LinkEdits = {};
        if ((to === '' ? null : to) !== link.to) edits.to = to === '' ? null : to;
        if (state !== '') edits.state = state;
        onSubmit(edits);
      }}
    >
      <label>
        Goes to
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">Unknown (no target)</option>
          {link.to !== null && !rooms.some((r) => r.id === link.to) && <option value={link.to}>{link.to} (another page)</option>}
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Vouch for it as
        <select value={state} onChange={(e) => setState(e.target.value as typeof state)}>
          <option value="">Leave as it is</option>
          <option value="candidate">A candidate</option>
          <option value="confirmed">Confirmed</option>
        </select>
      </label>
      <button type="submit">{verb}</button>
    </form>
  );
}

export default function ReviewPanel() {
  const { state, dispatch } = useNeutral();
  const [note, setNote] = useState('');
  const { candidates, audited, log, view, focus, selected } = state;
  const reviewing = view === 'candidates' && candidates !== null;
  const map = activeMap(state);
  const index = useMemo(() => buildIndex(map), [map]);
  const sliceRooms = useMemo(() => (focus && focus.level !== 'continent' ? (sliceMap(map, focus.level, focus.id)?.rooms ?? []) : []), [map, focus]);
  const withinIds = useMemo(() => new Set(sliceRooms.filter((r) => r.context !== true).map((r) => r.id)), [sliceRooms]);
  const pending = useMemo(() => (reviewing ? pendingItems(candidates, log, withinIds) : []), [reviewing, candidates, log, withinIds]);
  const counts = useMemo(() => (reviewing ? tally(candidates, log) : null), [reviewing, candidates, log]);
  const meta = { at: today(), note: note.trim() };

  const selectedRoom = selected?.kind === 'room' ? index.rooms.get(selected.id)?.room : undefined;
  const selectedLink = selected?.kind === 'link' ? index.links.get(selected.id) : undefined;
  const decided = selected ? statusOf(log, selected.kind, selected.id) : 'candidate';
  const inAudited = (kind: ItemKind, id: string): boolean => {
    const idx = buildIndex(audited);
    return kind === 'room' ? idx.rooms.has(id) : idx.links.has(id);
  };

  if (!reviewing) {
    const roomCount = [...buildIndex(audited).rooms.values()].filter((r) => r.room.aliasOf === undefined).length;
    return (
      <section className={styles.panel} aria-label="Audited file">
        <h3>Audited file</h3>
        <p>
          {roomCount} room{roomCount === 1 ? '' : 's'} and {audited.links.length} link{audited.links.length === 1 ? '' : 's'}, kept in this browser. Download the file to
          hand it on.
        </p>
        <label className={styles.note}>
          Note for the change
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={150} />
        </label>
        {selectedRoom && (
          <RoomEditor key={selectedRoom.id} room={selectedRoom} verb="Save changes to the room" onSubmit={(edits) => dispatch({ type: 'edit-room', id: selectedRoom.id, edits, meta })} />
        )}
        {selectedLink && (
          <LinkEditor
            key={selectedLink.id}
            link={selectedLink}
            rooms={sliceRooms}
            verb="Save changes to the link"
            onSubmit={(edits) => dispatch({ type: 'edit-link', id: selectedLink.id, edits, meta })}
          />
        )}
        {!selectedRoom && !selectedLink && <p className={styles.dim}>Select a room, or one of its exits, to change it.</p>}
      </section>
    );
  }

  const candRoom = selectedRoom;
  const candLink = selectedLink;
  const acceptedAlready = selected ? inAudited(selected.kind, selected.id) : false;
  return (
    <section className={styles.panel} aria-label="Candidate review">
      <h3>Candidate review</h3>
      {counts && (
        <p className={styles.tally} aria-live="polite">
          <span data-kind="pending">{counts.pending} to review</span>
          <span data-kind="accepted">{counts.accepted} accepted</span>
          <span data-kind="edited">{counts.edited} changed</span>
          <span data-kind="rejected">{counts.rejected} rejected</span>
        </p>
      )}
      <label className={styles.note}>
        Note for the decision
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={150} placeholder="why, or what you checked in the game" />
      </label>

      {selected && (candRoom || candLink) && (
        <div className={styles.selected} aria-label="Selected item">
          <p>
            <strong>{candRoom ? candRoom.title : `${index.rooms.get(candLink!.from)?.room.title ?? candLink!.from} ${candLink!.dir}`}</strong>{' '}
            <span data-status={decided}>{decided === 'candidate' ? 'not decided' : decided}</span>
            {acceptedAlready && decided === 'candidate' ? ' (already in the audited file)' : ''}
          </p>
          {decided === 'candidate' && (
            <>
              <div className={styles.row}>
                <button type="button" onClick={() => dispatch(selected.kind === 'room' ? { type: 'accept-room', id: selected.id, meta } : { type: 'accept-link', id: selected.id, meta })}>
                  Accept
                </button>
                <button type="button" onClick={() => dispatch({ type: 'reject', kind: selected.kind, id: selected.id, meta })}>
                  Reject
                </button>
              </div>
              {candRoom && (
                <RoomEditor key={candRoom.id} room={candRoom} verb="Accept with these changes" onSubmit={(edits) => dispatch({ type: 'accept-room', id: candRoom.id, meta, edits })} />
              )}
              {candLink && (
                <LinkEditor
                  key={candLink.id}
                  link={candLink}
                  rooms={sliceRooms}
                  verb="Accept with these changes"
                  onSubmit={(edits) => dispatch({ type: 'accept-link', id: candLink.id, meta, edits })}
                />
              )}
            </>
          )}
          {decided === 'rejected' && (
            <button type="button" onClick={() => dispatch({ type: 'reopen', kind: selected.kind, id: selected.id })}>
              Put back in the queue
            </button>
          )}
        </div>
      )}

      <h4>Waiting in this view ({pending.length})</h4>
      {!focus || focus.level === 'continent' ? (
        <p className={styles.dim}>Zoom to an area, a subzone or a room to review what is in it.</p>
      ) : pending.length === 0 ? (
        <p className={styles.dim}>Everything in this view has been decided.</p>
      ) : (
        <>
          <button type="button" className={styles.all} onClick={() => dispatch({ type: 'accept-many', items: pending, meta })}>
            Accept all {pending.length} in this view
          </button>
          <ul className={styles.queue}>
            {pending.slice(0, MAX_PENDING_SHOWN).map((item) => (
              <li key={`${item.kind}:${item.id}`}>
                <button type="button" className={styles.pick} aria-pressed={selected?.kind === item.kind && selected.id === item.id} onClick={() => dispatch({ type: 'select', selected: { kind: item.kind, id: item.id } })}>
                  <span className={styles.kind}>{item.kind}</span> {item.label}
                </button>
              </li>
            ))}
          </ul>
          {pending.length > MAX_PENDING_SHOWN && <p className={styles.dim}>Showing the first {MAX_PENDING_SHOWN}.</p>}
        </>
      )}
    </section>
  );
}
