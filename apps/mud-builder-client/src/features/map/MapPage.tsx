import { useCallback, useEffect, useRef, useState } from 'react';

import { api, type AreaListEntry, type AreaMapResponse, type ExternalRef } from '../../api/client.js';
import { LOCK_STATES } from '../../data/flags.js';
import { DOOR_NAMES, layoutArea, type AreaLayout } from './layout.js';
import WorldMap from './WorldMap.js';
import './map.css';

/**
 * AI-ANNOTATION
 * @ai-summary Map tab (Phase 12): SVG area map (rooms on a BFS grid, exits as
 *   edges, cross-area exits as portal stubs that jump to the neighbor's map)
 *   plus a world-level mode (WorldMap). Pan by drag, zoom by wheel. Clicking a
 *   room hands off to the Areas tab via the areaTarget lift. Phase 13: optional
 *   "Spawns" toolbar toggle overlays per-room boot-state mob counts (green
 *   top-left badge) from the read-only /spawn aggregate.
 * @ai-public MapPage (default)
 * @ai-notes Strictly a VIEW — nothing here mutates. Data comes from the
 *   read-only /api/map + /api/areas/:file/spawn endpoints; layout is
 *   client-side (layout.ts). Spawn data is fetched only while the toggle is on.
 */

const CELL_W = 170;
const CELL_H = 100;
const NODE_W = 140;
const NODE_H = 56;
const PORTAL_W = 140;
const PORTAL_H = 44;
const PAD = 40;

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const centerOf = (cell: [number, number]): [number, number] => [
  PAD + cell[0] * CELL_W + NODE_W / 2,
  PAD + cell[1] * CELL_H + NODE_H / 2,
];

function AreaMapSvg({
  file,
  layout,
  spawnCounts,
  onOpenRoom,
  onOpenPortal,
}: {
  file: string;
  layout: AreaLayout;
  spawnCounts?: Map<number, number>;
  onOpenRoom?: (ref: ExternalRef) => void;
  onOpenPortal: (file: string) => void;
}) {
  const fullW = PAD * 2 + Math.max(layout.width - 1, 0) * CELL_W + NODE_W;
  const fullH = PAD * 2 + Math.max(layout.height - 1, 0) * CELL_H + NODE_H;
  const [view, setView] = useState<ViewBox>({ x: 0, y: 0, w: fullW, h: fullH });
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; view: ViewBox } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    setView({ x: 0, y: 0, w: fullW, h: fullH });
  }, [file, fullW, fullH]);

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    setView((v) => {
      const w = Math.min(Math.max(v.w * factor, 200), fullW * 4);
      const h = (w / v.w) * v.h;
      return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
    });
  }, [fullW]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, view };
    },
    [view],
  );
  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const clientW = svgRef.current?.clientWidth || 800;
    const scale = drag.view.w / clientW;
    setView({
      ...drag.view,
      x: drag.view.x - (e.clientX - drag.startX) * scale,
      y: drag.view.y - (e.clientY - drag.startY) * scale,
    });
  }, []);
  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <svg
      ref={svgRef}
      className="mb-map-svg"
      role="img"
      aria-label={`Map of ${file}`}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <defs>
        <marker
          id="mb-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="mb-map-arrowhead" />
        </marker>
        <marker
          id="mb-arrow-warp"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="mb-map-arrowhead mb-map-arrowhead--warp" />
        </marker>
      </defs>
      {layout.edges.map((edge, i) => {
        const [x1, y1] = centerOf(edge.from);
        // Loop-back: the exit re-enters its own room — draw a self-loop ring.
        if (edge.classification === 'loop') {
          return (
            <circle
              key={`e${i}`}
              className="mb-map-edge mb-map-edge--loop"
              cx={x1 + NODE_W / 2 - 6}
              cy={y1 - NODE_H / 2 + 6}
              r={10}
            >
              <title>{`#${edge.fromVnum} ${DOOR_NAMES[edge.door] ?? '?'}: loops back into the same room`}</title>
            </circle>
          );
        }
        let [x2, y2] = centerOf(edge.to);
        const directed = edge.kind === 'warp' || edge.classification === 'one-way' || edge.classification === 'non-returning';
        if (directed) {
          // pull the tip out from under the target node so the arrowhead shows
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.hypot(dx, dy) || 1;
          const trim = Math.min(NODE_H / 2 + 6, len / 2);
          x2 -= (dx / len) * trim;
          y2 -= (dy / len) * trim;
        }
        const cls = [
          'mb-map-edge',
          edge.kind === 'external' ? 'mb-map-edge--external' : '',
          edge.kind === 'warp' ? 'mb-map-edge--warp' : '',
          edge.classification === 'one-way' ? 'mb-map-edge--oneway' : '',
          edge.classification === 'non-returning' ? 'mb-map-edge--nonreturning' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const title =
          edge.kind === 'warp'
            ? `#${edge.fromVnum}: script teleport`
            : edge.classification === 'one-way'
              ? `#${edge.fromVnum} ${DOOR_NAMES[edge.door] ?? '?'}: one-way (no exit back)`
              : edge.classification === 'non-returning'
                ? `#${edge.fromVnum} ${DOOR_NAMES[edge.door] ?? '?'}: non-returning (the way back leads elsewhere)`
                : undefined;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        return (
          <g key={`e${i}`}>
            <line
              className={cls}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              markerEnd={directed ? (edge.kind === 'warp' ? 'url(#mb-arrow-warp)' : 'url(#mb-arrow)') : undefined}
            >
              {title && <title>{title}</title>}
            </line>
            {(edge.locks ?? 0) > 0 && (
              <rect className="mb-map-door" x={mx - 5} y={my - 5} width={10} height={10}>
                <title>{`${DOOR_NAMES[edge.door] ?? '?'} from #${edge.fromVnum}: ${LOCK_STATES.find((l) => l.value === edge.locks)?.label ?? `door (locks ${edge.locks})`}`}</title>
              </rect>
            )}
          </g>
        );
      })}
      {layout.rooms.map((room) => {
        const px = PAD + room.x * CELL_W;
        const py = PAD + room.y * CELL_H;
        const spawnCount = spawnCounts?.get(room.vnum) ?? 0;
        return (
          <g
            key={room.vnum}
            className="mb-map-room"
            role="button"
            tabIndex={0}
            aria-label={`room #${room.vnum} ${room.name}`}
            onClick={() =>
              onOpenRoom?.({ kind: 'room', vnum: room.vnum, where: 'map', file, name: room.name })
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                onOpenRoom?.({ kind: 'room', vnum: room.vnum, where: 'map', file, name: room.name });
              }
            }}
          >
            <title>{`#${room.vnum} ${room.name} — click to edit in Areas`}</title>
            <rect x={px} y={py} width={NODE_W} height={NODE_H} rx={6} />
            <text x={px + NODE_W / 2} y={py + 22} className="mb-map-room-vnum">
              #{room.vnum}
            </text>
            <text x={px + NODE_W / 2} y={py + 42} className="mb-map-room-name">
              {truncate(room.name, 20)}
            </text>
            {/* Spawn badge sits top-LEFT — the 12b self-loop ring owns the top-right corner. */}
            {spawnCount > 0 && (
              <g className="mb-map-spawn-badge">
                <title>{`${spawnCount} mob${spawnCount === 1 ? '' : 's'} spawn${spawnCount === 1 ? 's' : ''} here at boot — see Resets ▸ Simulate`}</title>
                <circle cx={px + 4} cy={py + 4} r={9} />
                <text x={px + 4} y={py + 7.5}>
                  {spawnCount}
                </text>
              </g>
            )}
          </g>
        );
      })}
      {layout.portals.map((portal) => {
        const px = PAD + portal.x * CELL_W + (NODE_W - PORTAL_W) / 2;
        const py = PAD + portal.y * CELL_H + (NODE_H - PORTAL_H) / 2;
        return (
          <g
            key={portal.id}
            className="mb-map-portal"
            role="button"
            tabIndex={0}
            aria-label={`portal to ${portal.file} — ${portal.name}`}
            onClick={() => onOpenPortal(portal.file)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onOpenPortal(portal.file);
            }}
          >
            <title>{`${DOOR_NAMES[portal.door] ?? '?'} to #${portal.toVnum} ${portal.name} (${portal.file}) — click to map that area`}</title>
            <rect x={px} y={py} width={PORTAL_W} height={PORTAL_H} rx={12} />
            <text x={px + PORTAL_W / 2} y={py + 18} className="mb-map-portal-file">
              {truncate(portal.file, 20)}
            </text>
            <text x={px + PORTAL_W / 2} y={py + 34} className="mb-map-portal-name">
              {truncate(portal.name, 20)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function MapPage({ onOpenRoom }: { onOpenRoom?: (ref: ExternalRef) => void } = {}) {
  const [areas, setAreas] = useState<AreaListEntry[]>([]);
  const [mode, setMode] = useState<'area' | 'world'>('area');
  const [file, setFile] = useState<string | null>(null);
  const [data, setData] = useState<AreaMapResponse | null>(null);
  const [layout, setLayout] = useState<AreaLayout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSpawns, setShowSpawns] = useState(false);
  const [spawnCounts, setSpawnCounts] = useState<Map<number, number> | null>(null);
  const [spawnError, setSpawnError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .listAreas()
      .then((res) => {
        if (!live) return;
        setAreas(res.areas);
        setFile((f) => f ?? res.areas[0]?.file ?? null);
      })
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!file || mode !== 'area') return;
    let live = true;
    setLoading(true);
    setError(null);
    api
      .areaMap(file)
      .then((res) => {
        if (!live) return;
        setData(res);
        setLayout(layoutArea(res.rooms));
      })
      .catch((e) => live && setError((e as Error).message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [file, mode]);

  // Spawn overlay (Phase 13): only fetched while toggled on in area mode, so the
  // overlay costs nothing until a builder asks for it. Counts are boot-state mob
  // instances per room from the read-only /spawn aggregate.
  useEffect(() => {
    if (!file || mode !== 'area' || !showSpawns) return;
    let live = true;
    setSpawnCounts(null);
    setSpawnError(null);
    api
      .spawn(file)
      .then((res) => {
        if (!live) return;
        const counts = new Map<number, number>();
        for (const room of res.rooms) {
          const total = room.mobs.reduce((sum, m) => sum + m.count, 0);
          if (total > 0) counts.set(room.room, total);
        }
        setSpawnCounts(counts);
      })
      .catch((e) => live && setSpawnError((e as Error).message));
    return () => {
      live = false;
    };
  }, [file, mode, showSpawns]);

  const openPortal = useCallback((target: string) => {
    setFile(target);
  }, []);

  return (
    <div className="mb-map-page">
      <div className="mb-map-toolbar">
        <div className="mb-map-mode" role="group" aria-label="Map mode">
          <button
            type="button"
            className={mode === 'area' ? 'mb-map-mode-btn mb-map-mode-btn--active' : 'mb-map-mode-btn'}
            onClick={() => setMode('area')}
          >
            Area
          </button>
          <button
            type="button"
            className={mode === 'world' ? 'mb-map-mode-btn mb-map-mode-btn--active' : 'mb-map-mode-btn'}
            onClick={() => setMode('world')}
          >
            World
          </button>
        </div>
        {mode === 'area' ? (
          <label className="mb-map-picker">
            Area{' '}
            <select value={file ?? ''} onChange={(e) => setFile(e.target.value)} aria-label="Area to map">
              {areas.map((a) => (
                <option key={a.file} value={a.file}>
                  {a.name ? `${a.name} (${a.file})` : a.file}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {mode === 'area' ? (
          <label className="mb-map-spawn-toggle">
            <input
              type="checkbox"
              checked={showSpawns}
              onChange={(e) => setShowSpawns(e.target.checked)}
            />{' '}
            Spawns
          </label>
        ) : null}
        {mode === 'area' && data ? (
          <span className="mb-map-meta">
            {data.rooms.length} rooms
            {layout && layout.portals.length > 0 ? ` · ${layout.portals.length} cross-area exits` : ''}
            {' · drag to pan, wheel to zoom, click a room to edit'}
          </span>
        ) : null}
      </div>

      {error ? <p className="mb-map-error">{error}</p> : null}
      {mode === 'area' && showSpawns && spawnError ? (
        <p className="mb-map-error">Spawn overlay unavailable: {spawnError}</p>
      ) : null}

      {mode === 'area' ? (
        <div className="mb-map-legend" aria-label="Map legend">
          <span>
            <i className="mb-legend-swatch mb-legend-swatch--edge" /> two-way
          </span>
          <span>
            <i className="mb-legend-swatch mb-legend-swatch--oneway" /> one-way →
          </span>
          <span>
            <i className="mb-legend-swatch mb-legend-swatch--nonreturning" /> non-returning →
          </span>
          <span>
            <i className="mb-legend-swatch mb-legend-swatch--loop" /> loops back
          </span>
          <span>
            <i className="mb-legend-swatch mb-legend-swatch--door" /> door / locked
          </span>
          <span>
            <i className="mb-legend-swatch mb-legend-swatch--warp" /> teleport (script)
          </span>
          <span>
            <i className="mb-legend-swatch mb-legend-swatch--external" /> cross-area
          </span>
          {showSpawns ? (
            <span>
              <i className="mb-legend-swatch mb-legend-swatch--spawn" /> mobs at boot (count)
            </span>
          ) : null}
        </div>
      ) : null}

      {mode === 'world' ? (
        <WorldMap onOpenArea={(f) => {
          setFile(f);
          setMode('area');
        }} />
      ) : loading && !layout ? (
        <p className="mb-map-loading">Loading map…</p>
      ) : layout && file ? (
        layout.rooms.length === 0 ? (
          <p className="mb-map-empty">This area has no rooms yet.</p>
        ) : (
          <AreaMapSvg
            file={file}
            layout={layout}
            spawnCounts={showSpawns ? spawnCounts ?? undefined : undefined}
            onOpenRoom={onOpenRoom}
            onOpenPortal={openPortal}
          />
        )
      ) : null}
    </div>
  );
}
