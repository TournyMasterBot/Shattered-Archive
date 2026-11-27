import { useEffect, useMemo, useRef, type MouseEvent } from 'react';
import { renderSvg, sliceMap, type MapFile } from '@shatteredarchive/shattered-maps-core';
import type { ItemStatus } from '../review';
import { busiestFloor, children, floorsOf, type Focus } from '../zoom';
import styles from '../../styles/SliceView.module.scss';

/**
 * One level of the map. The picture is the core's own `renderSvg` (every text in it escaped; no script, style sheet or external
 * reference), so what the exporter writes and what the viewer shows are the same drawing: confirmed links solid, candidates dashed,
 * conflicts red, an exit whose target is unknown a stub ending in `?`, a link that leaves the page a stub ending in an arrow.
 * The drawing cannot be tabbed through, so the same rooms are also listed as buttons beside it.
 */

/** More rooms than this are listed as buttons; the rest are in the picture. */
export const MAX_LISTED_ROOMS = 300;

export interface SliceViewProps {
  map: MapFile;
  focus: Focus;
  floor: number | null;
  onFloor: (floor: number | null) => void;
  onFocus: (focus: Focus) => void;
  onSelectRoom: (id: string) => void;
  selectedRoom: string | null;
  /** Review status of a room, to mark the picture (candidates view); `undefined` marks nothing. */
  statusOf?: (roomId: string) => ItemStatus;
}

export default function SliceView({ map, focus, floor, onFloor, onFocus, onSelectRoom, selectedRoom, statusOf }: SliceViewProps) {
  const slice = useMemo(() => sliceMap(map, focus.level, focus.id), [map, focus]);
  const kids = useMemo(() => children(map, focus), [map, focus]);
  const picture = useRef<HTMLDivElement>(null);

  const chooser = focus.level === 'area' && kids.length > 1;
  // a continent whose areas have no placement has nothing to draw: the picture would be an empty sheet with a list of names
  const unplacedContinent = focus.level === 'continent' && slice !== null && !slice.areas.some((a) => a.placement !== null);
  const rooms = useMemo(() => slice?.rooms ?? [], [slice]);
  const floors = useMemo(() => floorsOf(rooms), [rooms]);
  const z = floor ?? busiestFloor(rooms);
  const svg = useMemo(
    () => (slice === null || chooser || unplacedContinent ? '' : renderSvg(slice, { layout: 'grid', z: focus.level === 'room' ? undefined : z })),
    [slice, chooser, unplacedContinent, focus.level, z],
  );

  // mark the rooms the curator has already decided on, and the selected one, on the drawn tiles
  useEffect(() => {
    const root = picture.current;
    if (!root) return;
    root.querySelectorAll('[data-room]').forEach((el) => {
      const id = el.getAttribute('data-room') ?? '';
      const status = statusOf?.(id);
      if (status && status !== 'candidate') el.setAttribute('data-review', status);
      else el.removeAttribute('data-review');
      if (id === selectedRoom) el.setAttribute('data-selected', 'true');
      else el.removeAttribute('data-selected');
    });
  }, [svg, statusOf, selectedRoom]);

  if (slice === null) return <p className={styles.empty}>Nothing to show here.</p>;

  const click = (event: MouseEvent<HTMLDivElement>): void => {
    const target = event.target as Element;
    const room = target.closest('[data-room]')?.getAttribute('data-room');
    if (room) {
      onSelectRoom(room);
      return;
    }
    const area = target.closest('[data-area]')?.getAttribute('data-area');
    if (area) onFocus({ level: 'area', id: area });
  };
  const open = (event: MouseEvent<HTMLDivElement>): void => {
    const room = (event.target as Element).closest('[data-room]')?.getAttribute('data-room');
    if (room) onFocus({ level: 'room', id: room });
  };

  const unknown = slice.links.filter((l) => l.state === 'unknown-target');
  const conflicts = slice.links.filter((l) => l.state === 'conflict');
  const leaving = slice.links.filter((l) => l.offPage && l.to !== null);
  const titleOf = new Map(rooms.map((r) => [r.id, r.title]));
  const onThisFloor = focus.level === 'room' ? rooms : rooms.filter((r) => r.coords !== undefined && (r.coords.z ?? 0) === z);
  const listed = onThisFloor.slice(0, MAX_LISTED_ROOMS);

  return (
    <section className={styles.view} aria-label={`Map of ${slice.title}`}>
      <h2 className={styles.title}>{slice.title}</h2>

      {chooser ? (
        <div className={styles.chooser}>
          <p>
            This area has {kids.length} subzones, each laid out on its own grid. Choose one to see it.
          </p>
          <ul className={styles.kids}>
            {kids.map((kid) => (
              <li key={kid.id}>
                <button type="button" onClick={() => onFocus({ level: kid.level, id: kid.id })}>
                  {kid.name} <span className={styles.count}>{kid.rooms} rooms</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          {focus.level !== 'continent' && focus.level !== 'room' && floors.length > 1 && (
            <div className={styles.floors} role="group" aria-label="Floor">
              {floors.map((f) => (
                <button key={f.z} type="button" aria-pressed={f.z === z} className={f.z === z ? styles.active : undefined} onClick={() => onFloor(f.z)}>
                  Floor {f.z} <span className={styles.count}>{f.rooms}</span>
                </button>
              ))}
            </div>
          )}
          {unplacedContinent ? (
            <p className={styles.empty}>No area of this continent has been placed on its map yet, so there is nothing to draw: choose an area from the list.</p>
          ) : (
            <div className={styles.picture} ref={picture} onClick={click} onDoubleClick={open} dangerouslySetInnerHTML={{ __html: svg }} />
          )}
          {focus.level !== 'continent' && (
            <ul className={styles.legend} aria-label="How to read the map">
              <li data-kind="confirmed">solid line: walked both ways</li>
              <li data-kind="candidate">dashed: seen once, or imported</li>
              <li data-kind="conflict">red, dotted: two sightings disagree</li>
              <li data-kind="unknown">? an exit that goes somewhere unknown</li>
              <li data-kind="offpage">→ a link that leaves this page</li>
              {svg.includes('data-tangled="twist"') && <li data-kind="twist">round chip on a room's edge: the exit on that side does not lead straight on</li>}
              {svg.includes('data-tangled="teleport"') && <li data-kind="teleport">square chip: an exit that lands far away (a teleport)</li>}
              {svg.includes('data-pill=') && <li data-kind="pill">IN way in · OUT leaves the area · END dead end · 1-WAY no way back</li>}
              {svg.includes('data-sectors=') && <li data-kind="terrain">tile colour: the terrain of the room (grey: not known yet)</li>}
              {svg.includes('data-kind=') && <li data-kind="hexagon">amber or purple tile: a maze, or a room with such an exit</li>}
            </ul>
          )}
          {focus.level !== 'continent' && (
            <p className={styles.counts} aria-live="polite">
              <span data-kind="unknown">{unknown.length} unknown exit{unknown.length === 1 ? '' : 's'}</span>
              <span data-kind="conflict">{conflicts.length} conflict{conflicts.length === 1 ? '' : 's'}</span>
              <span data-kind="offpage">{leaving.length} leaving the page</span>
              {slice.unplaced.length > 0 && <span data-kind="unplaced">{slice.unplaced.length} without a position</span>}
            </p>
          )}
        </>
      )}

      {focus.level === 'continent' && kids.length > 0 && (
        <>
          <ul className={styles.kids} aria-label="Areas">
            {kids
              .filter((kid) => kid.rooms > 0)
              .map((kid) => (
                <li key={kid.id}>
                  <button type="button" onClick={() => onFocus({ level: kid.level, id: kid.id })}>
                    {kid.name} <span className={styles.count}>{kid.rooms} rooms</span>
                  </button>
                </li>
              ))}
          </ul>
          {kids.some((kid) => kid.rooms === 0) && (
            <details className={styles.list}>
              <summary>Areas with no rooms yet ({kids.filter((kid) => kid.rooms === 0).length})</summary>
              <ul aria-label="Areas with no rooms">
                {kids
                  .filter((kid) => kid.rooms === 0)
                  .slice(0, MAX_LISTED_ROOMS)
                  .map((kid) => (
                    <li key={kid.id}>
                      <button type="button" onClick={() => onFocus({ level: kid.level, id: kid.id })}>
                        {kid.name}
                      </button>
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </>
      )}

      {!chooser && focus.level !== 'continent' && (
        <details className={styles.list} open={listed.length <= 40}>
          <summary>
            Rooms on this {focus.level === 'room' ? 'view' : `floor (${onThisFloor.length})`}
          </summary>
          <ul>
            {listed.map((room) => (
              <li key={room.id}>
                <button type="button" aria-pressed={room.id === selectedRoom} onClick={() => onSelectRoom(room.id)}>
                  {room.title}
                </button>
                <button type="button" className={styles.zoomIn} aria-label={`Zoom in to ${room.title}`} onClick={() => onFocus({ level: 'room', id: room.id })}>
                  ⤢
                </button>
              </li>
            ))}
          </ul>
          {onThisFloor.length > listed.length && <p className={styles.count}>Showing the first {listed.length} of {onThisFloor.length}; zoom in to a subzone for fewer.</p>}
        </details>
      )}

      {(unknown.length > 0 || conflicts.length > 0) && focus.level !== 'continent' && !chooser && (
        <details className={styles.list}>
          <summary>Gaps and conflicts ({unknown.length + conflicts.length})</summary>
          <ul>
            {[...unknown, ...conflicts].slice(0, MAX_LISTED_ROOMS).map((link) => (
              <li key={link.id}>
                <button type="button" onClick={() => onSelectRoom(link.from)}>
                  {titleOf.get(link.from) ?? link.from} {link.dir}: {link.state === 'conflict' ? 'sightings disagree' : 'unknown target'}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
