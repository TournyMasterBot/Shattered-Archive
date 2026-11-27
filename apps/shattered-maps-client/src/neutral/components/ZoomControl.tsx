import { useRef, type KeyboardEvent } from 'react';
import type { MapFile, SliceLevel } from '@shatteredarchive/shattered-maps-core';
import { LEVELS, breadcrumb, zoomOut, type Focus } from '../zoom';
import styles from '../../styles/ZoomControl.module.scss';

/**
 * The zoom control: one button per level (continent, area, subzone, room) showing the name at that level, and a button to go one level
 * out. A toolbar in the ARIA sense: one tab stop, the arrow keys, Home and End move between the levels that exist, Enter or Space
 * (the button's own activation) zooms to the one with the focus.
 */

const LABEL: Record<SliceLevel, string> = { continent: 'Continent', area: 'Area', subzone: 'Subzone', room: 'Room' };

export default function ZoomControl({ map, focus, onFocus }: { map: MapFile; focus: Focus | null; onFocus: (focus: Focus) => void }) {
  const crumbs = focus ? breadcrumb(map, focus) : [];
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const out = focus ? zoomOut(map, focus) : null;

  const move = (event: KeyboardEvent<HTMLDivElement>): void => {
    const enabled = LEVELS.map((_, i) => i).filter((i) => i < crumbs.length);
    const current = refs.current.findIndex((el) => el === document.activeElement);
    const at = enabled.indexOf(current);
    let next: number | undefined;
    if (event.key === 'ArrowRight') next = enabled[Math.min(enabled.length - 1, at + 1)];
    else if (event.key === 'ArrowLeft') next = enabled[Math.max(0, at - 1)];
    else if (event.key === 'Home') next = enabled[0];
    else if (event.key === 'End') next = enabled[enabled.length - 1];
    if (next === undefined) return;
    event.preventDefault();
    refs.current[next]?.focus();
  };

  return (
    <div className={styles.zoom}>
      <button type="button" className={styles.out} disabled={out === null} onClick={() => out && onFocus(out)} aria-label="Zoom out one level">
        ↑ Zoom out
      </button>
      <div role="toolbar" aria-label="Zoom level" aria-orientation="horizontal" className={styles.levels} onKeyDown={move}>
        {LEVELS.map((level, i) => {
          const crumb = crumbs[i];
          const here = crumb !== undefined && focus !== null && crumb.level === focus.level && crumb.id === focus.id;
          return (
            <button
              key={level}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              className={`${styles.level} ${here ? styles.here : ''}`}
              disabled={crumb === undefined}
              aria-current={here ? 'step' : undefined}
              tabIndex={here || (focus === null && i === 0) ? 0 : -1}
              onClick={() => crumb && onFocus({ level: crumb.level, id: crumb.id })}
            >
              <span className={styles.kind}>{LABEL[level]}</span>
              <span className={styles.name}>{crumb?.name ?? '–'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
