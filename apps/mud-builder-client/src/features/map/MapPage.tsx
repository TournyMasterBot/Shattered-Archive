import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AreaFile, RoomExit, RoomsSection } from '@shatteredarchive/merc-area';

import { api, ApiError, type AreaListEntry, type AreaMapResponse, type ExternalRef, type PreviewResult } from '../../api/client.js';
import { ConflictPanel } from '../areas/workbench.js';
import PreviewPane from '../areas/PreviewPane.js';
import { LOCK_STATES } from '../../data/flags.js';
import { applyOps, areaToMapRooms, describeOp, inferDirection, type ExitOp } from './exit-edit.js';
import { DOOR_NAMES, layoutArea, type AreaLayout, type LayoutEdge, type PlacedRoom } from './layout.js';
import WorldMap from './WorldMap.js';
import { Toast, type ToastState } from '../shared/Toast.js';
import './map.css';

/**
 * AI-ANNOTATION
 * @ai-summary Map tab (Phase 12): SVG area map (rooms on a BFS grid, exits as
 *   edges, cross-area exits as portal stubs that jump to the neighbor's map)
 *   plus a world-level mode (WorldMap). Pan by drag, zoom by wheel. Clicking a
 *   room hands off to the Areas tab via the areaTarget lift. Phase 13: optional
 *   "Spawns" toolbar toggle overlays per-room boot-state mob counts (green
 *   top-left badge) from the read-only /spawn aggregate. Phase 14b: an opt-in
 *   "Edit exits" mode turns the same canvas into an exit editor — drag room to
 *   room to connect, click an edge to change/delete it, staged-changes tray,
 *   save through the existing preview/baseHash pipeline (see @ai-notes). Phase 14c: once
 *   a live snapshot exists (GET /api/state/live — populated by the Simulate pane's
 *   "Compare live"), the Spawns overlay gains a Boot/Live sub-toggle; Live swaps the same
 *   badge to live per-room mob totals, rendered in an amber variant so the mode reads at
 *   a glance. This tab only ever READS the snapshot — it never requests a refresh itself.
 * @ai-public MapPage (default)
 * @ai-notes View mode (default) is strictly read-only, driven by /api/map +
 *   /api/areas/:file/spawn. Phase 14b adds an opt-in "Edit exits" mode: fetches
 *   the full AreaFile via api.getArea and stages edits as an ExitOp list —
 *   exit-edit.ts replays the ops immutably (never mutates the fetched model),
 *   projected back through the SAME layoutArea via areaToMapRooms so the two
 *   modes share one renderer. Saving flows through the existing
 *   api.preview/api.save baseHash pipeline (AreasPage precedent) — no new
 *   server surface. Spawn overlay is force-disabled while editing (staged
 *   exits would make its counts misleading).
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
  spawnLive = false,
  editMode = false,
  focusVnum = null,
  onOpenRoom,
  onOpenPortal,
  onCreateExit,
  resolveExit,
  onUpdateExit,
  onRemoveExit,
}: {
  file: string;
  layout: AreaLayout;
  spawnCounts?: Map<number, number>;
  /** Phase 14c: true when spawnCounts holds LIVE per-room totals rather than boot-state ones — swaps the badge to its amber variant. */
  spawnLive?: boolean;
  /** Phase 14b: enables drag-to-connect + keyboard connect; room click/onOpenRoom is suppressed while on. */
  editMode?: boolean;
  /** 2026-07-26: a room to center the viewport on and highlight, e.g. from a blocked room-delete's "Go fix it on the Map" hand-off. */
  focusVnum?: number | null;
  onOpenRoom?: (ref: ExternalRef) => void;
  onOpenPortal: (file: string) => void;
  onCreateExit?: (from: number, door: number, to: number, twoWay: boolean, locks: number, key: number) => void;
  /** Full RoomExit record for an existing exit — feeds the edge popover's lock/key prefill. */
  resolveExit?: (from: number, door: number) => RoomExit | undefined;
  onUpdateExit?: (from: number, door: number, locks: number, key: number) => void;
  onRemoveExit?: (from: number, door: number, alsoReverse: boolean) => void;
}) {
  const fullW = PAD * 2 + Math.max(layout.width - 1, 0) * CELL_W + NODE_W;
  const fullH = PAD * 2 + Math.max(layout.height - 1, 0) * CELL_H + NODE_H;
  const [view, setView] = useState<ViewBox>({ x: 0, y: 0, w: fullW, h: fullH });
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; view: ViewBox } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Exit-drag (Phase 14b): `ghost` tracks the in-progress drag line (SVG coords),
  // `armedFrom` is the keyboard-connect equivalent (Enter on a room arms it, Enter on
  // a second room completes it — no pointer needed), `draft` is the confirm popover.
  const [ghost, setGhost] = useState<{ fromVnum: number; fromCell: [number, number]; x: number; y: number } | null>(
    null,
  );
  const [armedFrom, setArmedFrom] = useState<number | null>(null);
  const [draft, setDraft] = useState<{
    fromVnum: number;
    toVnum: number;
    door: number;
    twoWay: boolean;
    locks: number;
    keyVnum: number;
    anchor: { left: number; top: number };
  } | null>(null);

  // Edge popover (existing exit): editable for internal exits, read-only when the
  // exit's target isn't a local room but a cross-area portal (server-resolved via
  // `data`/resolveExternal — see areaToMapRooms). `twoWay` gates the "also remove
  // reverse" checkbox — only offered when the reverse slot genuinely points back here.
  const [edgeDraft, setEdgeDraft] = useState<{
    fromVnum: number;
    toVnum: number;
    door: number;
    external: boolean;
    twoWay: boolean;
    locks: number;
    keyVnum: number;
    alsoReverse: boolean;
    anchor: { left: number; top: number };
  } | null>(null);

  useEffect(() => {
    setView({ x: 0, y: 0, w: fullW, h: fullH });
  }, [file, fullW, fullH]);

  // Center the viewport on the focused room, once, whenever it (or the area) changes.
  // Runs AFTER the reset-view effect above (declaration order) so it isn't clobbered
  // by that effect running on the same mount/file-change render.
  useEffect(() => {
    if (focusVnum == null) return;
    const room = layout.rooms.find((r) => r.vnum === focusVnum);
    if (!room) return;
    const cx = PAD + room.x * CELL_W + NODE_W / 2;
    const cy = PAD + room.y * CELL_H + NODE_H / 2;
    setView((v) => ({ x: cx - v.w / 2, y: cy - v.h / 2, w: v.w, h: v.h }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusVnum, file]);

  // Escape cancels whichever exit-connect step is in progress.
  useEffect(() => {
    if (!ghost && !draft && !edgeDraft && armedFrom === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setGhost(null);
      setDraft(null);
      setEdgeDraft(null);
      setArmedFrom(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ghost, draft, edgeDraft, armedFrom]);

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    setView((v) => {
      const w = Math.min(Math.max(v.w * factor, 200), fullW * 4);
      const h = (w / v.w) * v.h;
      return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
    });
  }, [fullW]);

  const clientToSvg = useCallback(
    (clientX: number, clientY: number): [number, number] => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return [view.x, view.y];
      return [view.x + ((clientX - rect.left) / rect.width) * view.w, view.y + ((clientY - rect.top) / rect.height) * view.h];
    },
    [view],
  );

  const openDraftFor = useCallback(
    (fromVnum: number, fromCell: [number, number], toVnum: number, toCell: [number, number], anchor: { left: number; top: number }) => {
      setEdgeDraft(null);
      setDraft({ fromVnum, toVnum, door: inferDirection(fromCell, toCell), twoWay: true, locks: 0, keyVnum: 0, anchor });
    },
    [],
  );

  const onEdgeActivate = useCallback(
    (edge: LayoutEdge, anchor: { left: number; top: number }) => {
      if (!editMode || edge.kind === 'warp') return;
      const exit = resolveExit?.(edge.fromVnum, edge.door);
      if (!exit) return; // editLayout is derived from the same model this resolves against — shouldn't miss
      setDraft(null);
      setEdgeDraft({
        fromVnum: edge.fromVnum,
        toVnum: exit.toVnum,
        door: edge.door,
        external: edge.kind === 'external',
        twoWay: edge.classification === 'two-way',
        locks: exit.locks,
        keyVnum: exit.key,
        alsoReverse: false,
        anchor,
      });
    },
    [editMode, resolveExit],
  );

  const startExitDrag = useCallback(
    (room: PlacedRoom, e: React.PointerEvent) => {
      e.stopPropagation();
      const [x, y] = clientToSvg(e.clientX, e.clientY);
      setGhost({ fromVnum: room.vnum, fromCell: [room.x, room.y], x, y });
    },
    [clientToSvg],
  );

  const finishExitDrag = useCallback(
    (room: PlacedRoom, e: React.PointerEvent) => {
      if (!ghost) return;
      e.stopPropagation();
      if (room.vnum !== ghost.fromVnum) {
        openDraftFor(ghost.fromVnum, ghost.fromCell, room.vnum, [room.x, room.y], { left: e.clientX, top: e.clientY });
      }
      setGhost(null);
    },
    [ghost, openDraftFor],
  );

  const onRoomKeyDown = useCallback(
    (room: PlacedRoom, e: React.KeyboardEvent<SVGGElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (!editMode) {
        onOpenRoom?.({ kind: 'room', vnum: room.vnum, where: 'map', file, name: room.name });
        return;
      }
      e.preventDefault();
      if (armedFrom === null) {
        setArmedFrom(room.vnum);
        return;
      }
      if (armedFrom === room.vnum) {
        setArmedFrom(null);
        return;
      }
      const fromRoom = layout.rooms.find((r) => r.vnum === armedFrom);
      setArmedFrom(null);
      if (!fromRoom) return;
      const anchorRect = e.currentTarget.getBoundingClientRect();
      openDraftFor(fromRoom.vnum, [fromRoom.x, fromRoom.y], room.vnum, [room.x, room.y], {
        left: anchorRect.left,
        top: anchorRect.bottom,
      });
    },
    [editMode, armedFrom, layout.rooms, file, onOpenRoom, openDraftFor],
  );

  const confirmDraft = useCallback(() => {
    if (!draft) return;
    onCreateExit?.(draft.fromVnum, draft.door, draft.toVnum, draft.twoWay, draft.locks, draft.keyVnum);
    setDraft(null);
  }, [draft, onCreateExit]);

  const confirmEdgeUpdate = useCallback(() => {
    if (!edgeDraft) return;
    onUpdateExit?.(edgeDraft.fromVnum, edgeDraft.door, edgeDraft.locks, edgeDraft.keyVnum);
    setEdgeDraft(null);
  }, [edgeDraft, onUpdateExit]);

  const confirmEdgeDelete = useCallback(() => {
    if (!edgeDraft) return;
    onRemoveExit?.(edgeDraft.fromVnum, edgeDraft.door, edgeDraft.alsoReverse);
    setEdgeDraft(null);
  }, [edgeDraft, onRemoveExit]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, view };
    },
    [view],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (ghost) {
        const [x, y] = clientToSvg(e.clientX, e.clientY);
        setGhost((g) => (g ? { ...g, x, y } : g));
        return;
      }
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const clientW = svgRef.current?.clientWidth || 800;
      const scale = drag.view.w / clientW;
      setView({
        ...drag.view,
        x: drag.view.x - (e.clientX - drag.startX) * scale,
        y: drag.view.y - (e.clientY - drag.startY) * scale,
      });
    },
    [ghost, clientToSvg],
  );
  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    setGhost(null);
  }, []);

  return (
    <div className="mb-map-canvas">
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
          const clickable = editMode && edge.kind !== 'warp';
          return (
            <g
              key={`e${i}`}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              aria-label={clickable ? `edge #${edge.fromVnum} ${DOOR_NAMES[edge.door] ?? '?'}` : undefined}
              onClick={clickable ? (e) => onEdgeActivate(edge, { left: e.clientX, top: e.clientY }) : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
                      const r = e.currentTarget.getBoundingClientRect();
                      onEdgeActivate(edge, { left: r.left, top: r.bottom });
                    }
                  : undefined
              }
            >
              <circle
                className="mb-map-edge mb-map-edge--loop"
                cx={x1 + NODE_W / 2 - 6}
                cy={y1 - NODE_H / 2 + 6}
                r={10}
              >
                <title>{`#${edge.fromVnum} ${DOOR_NAMES[edge.door] ?? '?'}: loops back into the same room`}</title>
              </circle>
            </g>
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
        const clickable = editMode && edge.kind !== 'warp';
        return (
          <g
            key={`e${i}`}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-label={
              clickable
                ? `edge #${edge.fromVnum} ${DOOR_NAMES[edge.door] ?? '?'}${edge.kind === 'external' ? ' (cross-area)' : ''}`
                : undefined
            }
            onClick={clickable ? (e) => onEdgeActivate(edge, { left: e.clientX, top: e.clientY }) : undefined}
            onKeyDown={
              clickable
                ? (e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect();
                    onEdgeActivate(edge, { left: r.left, top: r.bottom });
                  }
                : undefined
            }
          >
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
            {clickable && (
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="transparent"
                strokeWidth={14}
                pointerEvents="stroke"
              />
            )}
            {(edge.locks ?? 0) > 0 && (
              <rect className="mb-map-door" x={mx - 5} y={my - 5} width={10} height={10}>
                <title>{`${DOOR_NAMES[edge.door] ?? '?'} from #${edge.fromVnum}: ${LOCK_STATES.find((l) => l.value === edge.locks)?.label ?? `door (locks ${edge.locks})`}`}</title>
              </rect>
            )}
          </g>
        );
      })}
      {ghost
        ? (() => {
            const [gx1, gy1] = centerOf(ghost.fromCell);
            return <line className="mb-map-edge mb-map-edge--ghost" x1={gx1} y1={gy1} x2={ghost.x} y2={ghost.y} />;
          })()
        : null}
      {layout.rooms.map((room) => {
        const px = PAD + room.x * CELL_W;
        const py = PAD + room.y * CELL_H;
        const spawnCount = spawnCounts?.get(room.vnum) ?? 0;
        const armed = editMode && armedFrom === room.vnum;
        const focused = focusVnum != null && room.vnum === focusVnum;
        const roomClass = ['mb-map-room', armed ? 'mb-map-room--armed' : '', focused ? 'mb-map-room--focused' : '']
          .filter(Boolean)
          .join(' ');
        return (
          <g
            key={room.vnum}
            className={roomClass}
            role="button"
            tabIndex={0}
            aria-label={`room #${room.vnum} ${room.name}`}
            onPointerDown={editMode ? (e) => startExitDrag(room, e) : undefined}
            onPointerUp={editMode ? (e) => finishExitDrag(room, e) : undefined}
            onClick={() => {
              if (editMode) return;
              onOpenRoom?.({ kind: 'room', vnum: room.vnum, where: 'map', file, name: room.name });
            }}
            onKeyDown={(e) => onRoomKeyDown(room, e)}
          >
            <title>
              {editMode
                ? `#${room.vnum} ${room.name} — drag to another room to connect an exit, or press Enter`
                : `#${room.vnum} ${room.name} — click to edit in Areas`}
            </title>
            <rect x={px} y={py} width={NODE_W} height={NODE_H} rx={6} />
            <text x={px + NODE_W / 2} y={py + 22} className="mb-map-room-vnum">
              #{room.vnum}
            </text>
            <text x={px + NODE_W / 2} y={py + 42} className="mb-map-room-name">
              {truncate(room.name, 20)}
            </text>
            {/* Spawn badge sits top-LEFT — the 12b self-loop ring owns the top-right corner. */}
            {spawnCount > 0 && (
              <g className={spawnLive ? 'mb-map-spawn-badge mb-map-spawn-badge--live' : 'mb-map-spawn-badge'}>
                <title>
                  {spawnLive
                    ? `${spawnCount} mob${spawnCount === 1 ? '' : 's'} here right now (live) — see Resets ▸ Simulate`
                    : `${spawnCount} mob${spawnCount === 1 ? '' : 's'} spawn${spawnCount === 1 ? 's' : ''} here at boot — see Resets ▸ Simulate`}
                </title>
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
    {draft && (
      <div
        className="mb-map-create-popover"
        style={{ left: draft.anchor.left, top: draft.anchor.top }}
        role="dialog"
        aria-label="Create exit"
      >
        <div className="mb-map-popover-header">
          #{draft.fromVnum} → #{draft.toVnum}
        </div>
        <label className="mb-field">
          <span>Direction</span>
          <select
            aria-label="Exit direction"
            value={draft.door}
            onChange={(e) => setDraft((d) => (d ? { ...d, door: Number(e.target.value) } : d))}
          >
            {DOOR_NAMES.map((name, i) => (
              <option key={i} value={i}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="mb-flag">
          <input
            type="checkbox"
            checked={draft.twoWay}
            onChange={(e) => setDraft((d) => (d ? { ...d, twoWay: e.target.checked } : d))}
          />
          Two-way
        </label>
        <label className="mb-field">
          <span>Lock state</span>
          <select
            aria-label="Lock state"
            value={draft.locks}
            onChange={(e) => setDraft((d) => (d ? { ...d, locks: Number(e.target.value) } : d))}
          >
            {LOCK_STATES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="mb-field">
          <span>Key vnum</span>
          <input
            type="number"
            aria-label="Key vnum"
            value={draft.keyVnum}
            onChange={(e) => setDraft((d) => (d ? { ...d, keyVnum: Number(e.target.value) } : d))}
          />
        </label>
        <div className="mb-map-popover-actions">
          <button type="button" onClick={confirmDraft}>
            Create
          </button>
          <button type="button" onClick={() => setDraft(null)}>
            Cancel
          </button>
        </div>
      </div>
    )}
    {edgeDraft && (
      <div
        className="mb-map-edge-popover"
        style={{ left: edgeDraft.anchor.left, top: edgeDraft.anchor.top }}
        role="dialog"
        aria-label="Edit exit"
      >
        <div className="mb-map-popover-header">
          #{edgeDraft.fromVnum} {DOOR_NAMES[edgeDraft.door] ?? '?'} → #{edgeDraft.toVnum}
        </div>
        {edgeDraft.external ? (
          <>
            <p className="mb-muted">Cross-area — edit from that area's file.</p>
            <div className="mb-map-popover-actions">
              <button type="button" onClick={() => setEdgeDraft(null)}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="mb-field">
              <span>Lock state</span>
              <select
                aria-label="Edit lock state"
                value={edgeDraft.locks}
                onChange={(e) => setEdgeDraft((d) => (d ? { ...d, locks: Number(e.target.value) } : d))}
              >
                {LOCK_STATES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mb-field">
              <span>Key vnum</span>
              <input
                type="number"
                aria-label="Edit key vnum"
                value={edgeDraft.keyVnum}
                onChange={(e) => setEdgeDraft((d) => (d ? { ...d, keyVnum: Number(e.target.value) } : d))}
              />
            </label>
            <div className="mb-map-popover-actions">
              <button type="button" onClick={confirmEdgeUpdate}>
                Update
              </button>
            </div>
            <hr className="mb-map-popover-divider" />
            {edgeDraft.twoWay && (
              <label className="mb-flag">
                <input
                  type="checkbox"
                  checked={edgeDraft.alsoReverse}
                  onChange={(e) => setEdgeDraft((d) => (d ? { ...d, alsoReverse: e.target.checked } : d))}
                />
                Also remove reverse exit
              </label>
            )}
            <div className="mb-map-popover-actions">
              <button type="button" className="mb-danger" onClick={confirmEdgeDelete}>
                Delete
              </button>
              <button type="button" onClick={() => setEdgeDraft(null)}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    )}
    </div>
  );
}

export default function MapPage({
  onOpenRoom,
  initialFocus,
}: {
  onOpenRoom?: (ref: ExternalRef) => void;
  /** 2026-07-26: opens this area and centers/highlights this room — e.g. a blocked room-delete's "Go fix it on the Map" hand-off. */
  initialFocus?: { file: string; vnum: number } | null;
} = {}) {
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
  // Boot/Live sub-toggle (Phase 14c). The Live radio only appears once a live snapshot is
  // actually available — this tab never triggers a refresh itself (that's the Simulate
  // pane's job); it just shows whatever GET /api/state/live already has, if anything.
  const [spawnSource, setSpawnSource] = useState<'boot' | 'live'>('boot');
  const [liveSpawnCounts, setLiveSpawnCounts] = useState<Map<number, number> | null>(null);
  const [liveSpawnAgeMs, setLiveSpawnAgeMs] = useState<number | null>(null);

  // Edit mode (Phase 14b).
  const [editMode, setEditMode] = useState(false);
  const [baseArea, setBaseArea] = useState<AreaFile | null>(null);
  const [baseHash, setBaseHash] = useState<string | undefined>(undefined);
  const [areaLoading, setAreaLoading] = useState(false);
  const [ops, setOps] = useState<ExitOp[]>([]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const spawnsActive = showSpawns && !editMode;

  const ok = (text: string) => setToast({ kind: 'ok', text });
  const err = (text: string) => setToast({ kind: 'err', text });

  useEffect(() => {
    if (!initialFocus) return;
    setMode('area');
    setFile(initialFocus.file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFocus]);

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
    if (!file || mode !== 'area' || !spawnsActive) return;
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
  }, [file, mode, spawnsActive]);

  // Live spawn overlay (Phase 14c): reads whatever GET /api/state/live already has, if
  // anything — this tab never itself requests a refresh (Simulate's "Compare live" does
  // that). A 404 ("no snapshot yet") just means the Boot/Live sub-toggle stays hidden;
  // any other failure degrades the same way, since Boot mode still works fine either way.
  useEffect(() => {
    if (!file || mode !== 'area' || !spawnsActive) {
      setLiveSpawnCounts(null);
      setLiveSpawnAgeMs(null);
      return;
    }
    let live = true;
    api
      .stateLive()
      .then((res) => {
        if (!live) return;
        const counts = new Map<number, number>();
        for (const room of res.snapshot.rooms) {
          const total = room.mobs.reduce((sum, [, count]) => sum + count, 0);
          if (total > 0) counts.set(room.vnum, total);
        }
        setLiveSpawnCounts(counts);
        setLiveSpawnAgeMs(res.ageMs);
      })
      .catch(() => {
        if (!live) return;
        setLiveSpawnCounts(null);
        setLiveSpawnAgeMs(null);
      });
    return () => {
      live = false;
    };
  }, [file, mode, spawnsActive]);

  // A live snapshot from a previous area shouldn't linger, mislabeled, under a new one.
  useEffect(() => {
    setSpawnSource('boot');
  }, [file]);

  const spawnSourceActive = spawnSource === 'live' && liveSpawnCounts !== null;
  const effectiveSpawnCounts = spawnSourceActive ? liveSpawnCounts : spawnCounts;

  // Fetches the FULL AreaFile (never the /api/map projection — it lacks non-exit
  // room fields and would destroy data if saved) whenever edit mode turns on or
  // the mapped area changes while editing. Also the reset point for staged ops:
  // every fetch here means the base model just changed, so ops from the PREVIOUS
  // base no longer apply.
  useEffect(() => {
    if (!file || mode !== 'area' || !editMode) {
      setBaseArea(null);
      setBaseHash(undefined);
      setOps([]);
      return;
    }
    let live = true;
    setAreaLoading(true);
    api
      .getArea(file)
      .then((res) => {
        if (!live) return;
        setBaseArea(res.area);
        setBaseHash(res.baseHash);
        setOps([]);
      })
      .catch((e) => live && setError((e as Error).message))
      .finally(() => live && setAreaLoading(false));
    return () => {
      live = false;
    };
  }, [file, mode, editMode]);

  const { area: editedArea, warnings: opWarnings } = useMemo(() => {
    if (!baseArea) return { area: null as AreaFile | null, warnings: [] as string[] };
    return applyOps(baseArea, ops);
  }, [baseArea, ops]);

  // The server already cross-area-resolved exits in the last /api/map fetch (`data`) —
  // reuse it as an oracle so edit mode can still show a portal stub + read-only popover
  // for an EXISTING external exit, while a newly staged one (not in `data`) stays
  // dangling (cross-area exit CREATION is out of scope for this phase).
  const resolveExternal = useCallback(
    (fromVnum: number, door: number, toVnum: number) => {
      const exit = data?.rooms.find((r) => r.vnum === fromVnum)?.exits.find((e) => e.door === door && e.toVnum === toVnum);
      return exit?.external;
    },
    [data],
  );

  const editLayout = useMemo(
    () => (editedArea ? layoutArea(areaToMapRooms(editedArea, resolveExternal)) : null),
    [editedArea, resolveExternal],
  );

  const activeLayout = editMode ? editLayout : layout;

  const resolveExit = useCallback(
    (from: number, door: number): RoomExit | undefined => {
      const section = editedArea?.sections.find((s): s is RoomsSection => s.kind === 'rooms');
      return section?.rooms.find((r) => r.vnum === from)?.exits.find((e) => e.door === door);
    },
    [editedArea],
  );

  /** Staged ops would silently vanish on any area/mode switch — confirm first. */
  const guardDiscard = useCallback(() => {
    if (ops.length === 0) return true;
    return window.confirm('Discard unsaved exit changes?');
  }, [ops]);

  const toggleEditMode = useCallback(() => {
    if (editMode && !guardDiscard()) return;
    setEditMode((v) => !v);
  }, [editMode, guardDiscard]);

  const openPortal = useCallback(
    (target: string) => {
      if (!guardDiscard()) return;
      setFile(target);
    },
    [guardDiscard],
  );

  const onCreateExit = useCallback(
    (from: number, door: number, to: number, twoWay: boolean, locks: number, key: number) => {
      setOps((prev) => [...prev, { op: 'addExit', from, door, to, twoWay, locks, key }]);
    },
    [],
  );

  const onUpdateExit = useCallback((from: number, door: number, locks: number, key: number) => {
    setOps((prev) => [...prev, { op: 'updateExit', from, door, locks, key }]);
  }, []);

  const onRemoveExit = useCallback((from: number, door: number, alsoReverse: boolean) => {
    setOps((prev) => [...prev, { op: 'removeExit', from, door, alsoReverse }]);
  }, []);

  const undoOp = useCallback((index: number) => {
    setOps((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /** Pulls the canonical post-save state back in — both the edit-mode base model and the view-mode projection. */
  const refetchAfterSave = async (targetFile: string) => {
    const [freshArea, freshMap] = await Promise.all([api.getArea(targetFile), api.areaMap(targetFile)]);
    setBaseArea(freshArea.area);
    setBaseHash(freshArea.baseHash);
    setData(freshMap);
    setLayout(layoutArea(freshMap.rooms));
  };

  const doPreviewSave = async () => {
    if (!file || !editedArea) return;
    try {
      setPreview(await api.preview(file, editedArea));
    } catch (e) {
      err(`preview failed: ${(e as Error).message}`);
    }
  };

  const doSave = async () => {
    if (!file || !editedArea) return;
    setSaving(true);
    try {
      const r = await api.save(file, editedArea, baseHash);
      setOps([]);
      setPreview(null);
      setConflict(false);
      await refetchAfterSave(file);
      ok(`saved ${file}${r.backupPath ? ' (backup written)' : ''}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
        err(`someone else saved ${file} since you loaded it — resolve the conflict below`);
      } else {
        err(`save failed: ${(e as Error).message}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const conflictReload = async () => {
    if (!file) return;
    if (!window.confirm(`Discard YOUR staged exit changes to ${file} and reload what is on disk now?`)) return;
    setOps([]);
    setPreview(null);
    setConflict(false);
    await refetchAfterSave(file);
    ok(`reloaded ${file} from disk — your staged exit changes were discarded`);
  };

  const conflictSaveAnyway = async () => {
    if (!file || !editedArea) return;
    if (!window.confirm(`Overwrite ${file} with YOUR version, discarding the other builder's save? A backup of theirs is taken first.`))
      return;
    try {
      const r = await api.save(file, editedArea); // no baseHash: unconditional
      setOps([]);
      setPreview(null);
      setConflict(false);
      await refetchAfterSave(file);
      ok(`saved ${file} over the conflicting version${r.backupPath ? " (their version is in the backup)" : ''}`);
    } catch (e) {
      err(`save failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="mb-map-page">
      <div className="mb-map-toolbar">
        <div className="mb-map-mode" role="group" aria-label="Map mode">
          <button
            type="button"
            className={mode === 'area' ? 'mb-map-mode-btn mb-map-mode-btn--active' : 'mb-map-mode-btn'}
            onClick={() => {
              if (!guardDiscard()) return;
              setMode('area');
            }}
          >
            Area
          </button>
          <button
            type="button"
            className={mode === 'world' ? 'mb-map-mode-btn mb-map-mode-btn--active' : 'mb-map-mode-btn'}
            onClick={() => {
              if (!guardDiscard()) return;
              setMode('world');
            }}
          >
            World
          </button>
        </div>
        {mode === 'area' ? (
          <label className="mb-map-picker">
            Area{' '}
            <select
              value={file ?? ''}
              onChange={(e) => {
                if (!guardDiscard()) return;
                setFile(e.target.value);
              }}
              aria-label="Area to map"
            >
              {areas.map((a) => (
                <option key={a.file} value={a.file}>
                  {a.name ? `${a.name} (${a.file})` : a.file}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {mode === 'area' ? (
          <button
            type="button"
            className={editMode ? 'mb-map-mode-btn mb-map-mode-btn--active' : 'mb-map-mode-btn'}
            aria-pressed={editMode}
            onClick={toggleEditMode}
          >
            Edit exits
          </button>
        ) : null}
        {mode === 'area' ? (
          <label
            className="mb-map-spawn-toggle"
            title={editMode ? 'Disabled while editing exits — staged changes would make counts misleading' : undefined}
          >
            <input
              type="checkbox"
              checked={showSpawns}
              disabled={editMode}
              onChange={(e) => setShowSpawns(e.target.checked)}
            />{' '}
            Spawns
          </label>
        ) : null}
        {mode === 'area' && spawnsActive && liveSpawnCounts ? (
          <span className="mb-map-spawn-source" role="radiogroup" aria-label="Spawn data source">
            <label>
              <input type="radio" name="mb-spawn-source" checked={spawnSource === 'boot'} onChange={() => setSpawnSource('boot')} />
              Boot
            </label>
            <label>
              <input type="radio" name="mb-spawn-source" checked={spawnSource === 'live'} onChange={() => setSpawnSource('live')} />
              Live{liveSpawnAgeMs !== null ? ` (${Math.max(0, Math.round(liveSpawnAgeMs / 1000))}s ago)` : ''}
            </label>
          </span>
        ) : null}
        {editMode && opWarnings.length > 0 ? (
          <span className="mb-map-edit-warning" role="status">
            {opWarnings.length} warning{opWarnings.length === 1 ? '' : 's'}
          </span>
        ) : null}
        {mode === 'area' && data ? (
          <span className="mb-map-meta">
            {editMode && editLayout ? editLayout.rooms.length : data.rooms.length} rooms
            {layout && layout.portals.length > 0 ? ` · ${layout.portals.length} cross-area exits` : ''}
            {editMode
              ? ' · edit mode: drag a room onto another to add an exit, click an edge to change or remove it'
              : ' · drag to pan, wheel to zoom, click a room to edit'}
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
          {showSpawns && spawnSourceActive ? (
            <span>
              <i className="mb-legend-swatch mb-legend-swatch--spawn-live" /> mobs live now (count)
            </span>
          ) : showSpawns ? (
            <span>
              <i className="mb-legend-swatch mb-legend-swatch--spawn" /> mobs at boot (count)
            </span>
          ) : null}
        </div>
      ) : null}

      {editMode && ops.length > 0 ? (
        <div className="mb-map-tray" aria-label="Staged exit changes">
          <div className="mb-map-tray-header">
            <span>{ops.length} staged change{ops.length === 1 ? '' : 's'}</span>
            <button type="button" onClick={() => setOps([])}>
              Discard all
            </button>
            <button
              type="button"
              className="mb-map-tray-save"
              disabled={saving || conflict}
              aria-label={`Save (${ops.length})`}
              onClick={() => void doPreviewSave()}
            >
              Save ({ops.length})
            </button>
          </div>
          <ul className="mb-map-tray-list">
            {ops.map((op, i) => (
              <li key={i}>
                <span>{describeOp(op, baseArea ?? { sections: [] })}</span>
                <button type="button" aria-label={`Undo staged change ${i + 1}`} onClick={() => undoOp(i)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {editMode && conflict && file ? (
        <ConflictPanel file={file} onReload={() => void conflictReload()} onSaveAnyway={() => void conflictSaveAnyway()} />
      ) : editMode && preview ? (
        <div className="mb-map-save-confirm">
          <PreviewPane preview={preview} />
          <div className="mb-map-popover-actions">
            <button type="button" onClick={() => void doSave()} disabled={saving}>
              {saving ? 'Saving…' : 'Confirm save'}
            </button>
            <button type="button" onClick={() => setPreview(null)} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {mode === 'world' ? (
        <WorldMap
          onOpenArea={(f) => {
            if (!guardDiscard()) return;
            setFile(f);
            setMode('area');
          }}
        />
      ) : loading && !layout ? (
        <p className="mb-map-loading">Loading map…</p>
      ) : editMode && areaLoading && !editLayout ? (
        <p className="mb-map-loading">Loading area for editing…</p>
      ) : activeLayout && file ? (
        activeLayout.rooms.length === 0 ? (
          <p className="mb-map-empty">
            {editMode ? 'This area has no rooms yet — add one from the Areas tab first.' : 'This area has no rooms yet.'}
          </p>
        ) : (
          <AreaMapSvg
            file={file}
            layout={activeLayout}
            spawnCounts={spawnsActive ? effectiveSpawnCounts ?? undefined : undefined}
            spawnLive={spawnsActive && spawnSourceActive}
            editMode={editMode}
            focusVnum={initialFocus && initialFocus.file === file ? initialFocus.vnum : null}
            onOpenRoom={onOpenRoom}
            onOpenPortal={openPortal}
            onCreateExit={onCreateExit}
            resolveExit={resolveExit}
            onUpdateExit={onUpdateExit}
            onRemoveExit={onRemoveExit}
          />
        )
      ) : null}
    </div>
  );
}
