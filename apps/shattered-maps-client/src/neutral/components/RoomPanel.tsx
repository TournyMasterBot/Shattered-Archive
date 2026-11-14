import { useMemo } from 'react';
import { buildIndex, fixturesOf, type ContentRecord, type Link, type MapFile } from '@shatteredarchive/shattered-maps-core';
import { breadcrumb } from '../zoom';
import styles from '../../styles/RoomPanel.module.scss';

/**
 * Everything the map file says about one room: where it is, its text, its exits with how sure each is, what the room usually holds
 * (the baseline: fixtures are separate from what was seen once or twice, and from what used to be there), and where each piece of the
 * record came from. Read-only; the review panel changes things.
 */

const STATE_LABEL: Record<Link['state'], string> = {
  confirmed: 'walked both ways',
  candidate: 'seen once or imported',
  'unknown-target': 'goes somewhere unknown',
  conflict: 'sightings disagree',
};

const label = (c: { label: string; kind: string }): string => (c.kind === 'unknown' || c.kind === 'mob' || c.kind === 'item' ? c.label : `${c.label} (${c.kind})`);

function Content({ record }: { record: ContentRecord }) {
  return (
    <li>
      {label(record)}
      {record.count > 1 ? ` ×${record.count}` : ''} <span className={styles.dim}>seen on {record.seen} of {record.observed} visits</span>
    </li>
  );
}

export default function RoomPanel({
  map,
  roomId,
  selectedLink,
  onSelectLink,
  onGoTo,
}: {
  map: MapFile;
  roomId: string;
  selectedLink: string | null;
  onSelectLink: (id: string) => void;
  onGoTo: (roomId: string) => void;
}) {
  const index = useMemo(() => buildIndex(map), [map]);
  const found = index.rooms.get(roomId);
  const path = useMemo(() => breadcrumb(map, { level: 'room', id: roomId }), [map, roomId]);
  if (!found) return <p className={styles.empty}>This room is not in the map being shown.</p>;
  const { room } = found;
  const titleOf = (id: string): string | undefined => index.rooms.get(id)?.room.title;
  const links = (index.linksFrom.get(roomId) ?? []).slice().sort((a, b) => a.dir.localeCompare(b.dir));
  const baseline = room.baseline;
  const fixtures = fixturesOf(baseline).filter((c) => c.kind !== 'player');
  const transient = (baseline?.contents ?? []).filter((c) => c.status === 'transient' && c.kind !== 'player');

  return (
    <article className={styles.panel} aria-label={`Room ${room.title}`}>
      <h3 className={styles.title}>{room.title}</h3>
      <p className={styles.where}>{path.slice(0, -1).map((c) => c.name).join(' › ')}</p>
      <dl className={styles.facts}>
        {room.vnum !== undefined && (
          <>
            <dt>Room number</dt>
            <dd>{room.vnum}</dd>
          </>
        )}
        {room.sector && (
          <>
            <dt>Terrain</dt>
            <dd>{room.sector}</dd>
          </>
        )}
        {room.coords && (
          <>
            <dt>Position</dt>
            <dd>
              {room.coords.x}, {room.coords.y}, floor {room.coords.z ?? 0}
            </dd>
          </>
        )}
      </dl>
      {room.description && <p className={styles.description}>{room.description}</p>}

      <section aria-label="Exits">
        <h4>Exits</h4>
        {links.length === 0 ? (
          <p className={styles.dim}>No exit has been described.</p>
        ) : (
          <ul className={styles.exits}>
            {links.map((link) => {
              const target = link.to === null ? undefined : titleOf(link.to);
              return (
                <li key={link.id} data-state={link.state} className={link.id === selectedLink ? styles.selected : undefined}>
                  <button type="button" aria-pressed={link.id === selectedLink} onClick={() => onSelectLink(link.id)}>
                    <strong>{link.dir}</strong> {STATE_LABEL[link.state]}
                  </button>{' '}
                  {link.to === null ? (
                    <span className={styles.gap}>target unknown</span>
                  ) : target !== undefined ? (
                    <button type="button" className={styles.goto} onClick={() => onGoTo(link.to as string)}>
                      {target}
                    </button>
                  ) : (
                    <span className={styles.offpage}>a room on another page</span>
                  )}
                  <span className={styles.dim}>
                    {' '}
                    {Math.round(link.confidence * 100)}%{link.traversals > 0 ? `, walked ${link.traversals}×` : ''}
                    {link.reverse ? ', and back' : ''}
                    {link.offPage ? ', leaves this page' : ''}
                  </span>
                  {link.state === 'conflict' && link.conflictTo && link.conflictTo.length > 0 && (
                    <span className={styles.conflict}> also seen to lead to {link.conflictTo.map((id) => titleOf(id) ?? id).join(', ')}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="What this room usually holds">
        <h4>What this room usually holds</h4>
        {!baseline || baseline.visits === 0 ? (
          <p className={styles.dim}>No character has been here since this was recorded, so there is nothing to compare against.</p>
        ) : (
          <>
            <p>
              Visited {baseline.visits} time{baseline.visits === 1 ? '' : 's'} on {baseline.days.length} day{baseline.days.length === 1 ? '' : 's'}.
            </p>
            <h5>Always here</h5>
            {fixtures.length === 0 ? <p className={styles.dim}>Nothing has been seen often enough to count as part of the room.</p> : <ul data-kind="fixtures">{fixtures.map((c) => <Content key={`${c.kind}:${c.label}`} record={c} />)}</ul>}
            {transient.length > 0 && (
              <>
                <h5>Seen, not part of the room</h5>
                <ul data-kind="transient">{transient.map((c) => <Content key={`${c.kind}:${c.label}`} record={c} />)}</ul>
              </>
            )}
            {baseline.was.length > 0 && (
              <>
                <h5>Used to be here</h5>
                <ul data-kind="was">
                  {baseline.was.map((w) => (
                    <li key={`${w.kind}:${w.label}`}>
                      {w.label} <span className={styles.dim}>was on {w.seen} of {w.observed} visits, last on {w.lastSeen}, dropped on {w.demotedOn}{w.returns > 0 ? `, came back ${w.returns}×` : ''}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </section>

      <section aria-label="Where this record comes from">
        <h4>Where it comes from</h4>
        <ul className={styles.sources}>
          {room.sources.map((s, i) => (
            <li key={`${s.kind}:${s.ref ?? ''}:${i}`}>
              {s.kind}
              {s.credit ? `, by ${s.credit}` : ''}
              {s.date ? `, ${s.date}` : ''}
              {s.ref ? ` (${s.ref})` : ''}
            </li>
          ))}
        </ul>
        {room.history && room.history.length > 0 && (
          <ul className={styles.history} aria-label="History">
            {room.history.map((h, i) => (
              <li key={i}>
                {h.at}: {h.note ?? h.op}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
