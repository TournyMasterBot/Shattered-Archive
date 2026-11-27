// apps/game-client/src/components/WorldMapWindow.tsx
//
// The map window: a floating, movable, resizable window (no backdrop; the game behind it stays usable) showing the published map of the area the
// player is in, with their room marked. PRODUCTION feature, not flag-gated: it reads only the audited layer from the C# site.
//
// What it does, in the order a player meets it:
//   - Opens beside the terminal (in the black space left of the right sidebar) and remembers where it was put and how big.
//   - Follows the player: the picture centres on their room and on their floor as they walk. Panning (drag), choosing a floor or looking at
//     another area stops the following; the Me button (or Reset view) brings it back.
//   - Pan by dragging, zoom with the wheel (around the pointer) or the + - buttons, Fit shows the whole floor. Arrow keys, + -, PageUp/PageDown
//     and Home do the same from the keyboard.
//   - Floors: a slim strip at the left edge lists the floors of the area; the floors above and below the chosen one are drawn behind it, offset
//     and more transparent the further away (the renderer's ghost floors); a ghost room can be clicked to go to its floor. The gear sets how
//     many other floors show (none, nearby, all), and labels.
//   - An exit that leaves the area is an arrow you can click: the neighbouring area opens at that room, and Reset view comes back.
//
// The picture is the shared renderer's SVG put in with dangerouslySetInnerHTML ON PURPOSE: renderSvg escapes every string it writes (titles come
// from game text), writes no script, style sheet or external reference. Nothing else from the map is written as markup. See docs/shattered-maps/surfaces.md.

import React from 'react';
import { applyFog, renderSvg, sliceMap } from '@shatteredarchive/shattered-maps-core';
import styles from '../styles/WorldMapWindow.module.scss';
import { useFloatingPanel } from '../hooks/useFloatingPanel';
import { useWindowLayer } from '../hooks/useWindowLayer';
import type { ApiResult, LoadedArea, WorldMapApi } from '../features/worldmap/api';
import {
  FLOORS_LABELS,
  FOG_LABELS,
  GHOSTS_BY_MODE,
  sharedSettings,
  type FloorsMode,
  type FogMode,
  type MapSettings,
  type SettingsStore,
} from '../features/worldmap/settings';
import type { Location, WorldMapSession } from '../features/worldmap/session';
import type { Observed } from '../features/worldmap/mine/draft';
import type { LayerStore } from '../features/worldmap/mine/layerStore';
import { sharedLayerStore } from '../features/worldmap/mine/shared';
import { useVisited } from '../features/worldmap/fog/useVisited';
import type { VisitStore } from '../features/worldmap/fog/visits';
import type { BackupApi } from '../features/worldmap/sync/backup';
import MapBackupSection from './MapBackupSection';
import MapWorldPicker from './MapWorldPicker';
import { getRoomData } from '../features/room/roomDataStore';
import AddRoomPanel from './AddRoomPanel';
import HelpInfoButton from './HelpInfoButton';
import MapHelp from './MapHelp';
import { sharedWorldMapApi, useWorldMap, type WorldMapView } from '../features/worldmap/useWorldMap';
import { useActiveMapWorld, type MapWorld } from '../features/worldmap/world';
import {
  IDENTITY,
  MAX_SCALE,
  centerOn,
  MIN_SCALE,
  fit,
  floorLabel,
  floorName,
  panBy,
  placeView,
  polygonCenter,
  polygonDot,
  zoomAt,
  type Point,
  type Rect,
  type Size,
  type View,
} from '../features/worldmap/viewport';

type Located = Extract<Location, { status: 'located' }>;

const LIMITS = { minWidth: 300, minHeight: 240 } as const;
const SIZE = { width: 460, height: 380 } as const;
const FALLBACK_BOX: Size = { width: SIZE.width, height: SIZE.height - 70 };
const ZOOM_STEP = 1.25;
const KEY_PAN = 48;
/** A press that moves less than this is a click, not the start of a drag. */
const DRAG_SLOP = 4;

/** Beside the terminal: just left of the right sidebar, near the top (the black space of the terminal). */
function defaultGeometry(): { width: number; height: number; x: number; y: number } {
  let right = window.innerWidth;
  try {
    const pane = document.querySelector('[class*="rightPane"]');
    const left = pane?.getBoundingClientRect().left;
    if (typeof left === 'number' && left > 0) right = left;
  } catch {
    // no layout to measure: use the viewport's edge
  }
  return { ...SIZE, x: Math.max(8, right - SIZE.width - 24), y: 56 };
}

function floorsOf(area: LoadedArea): number[] {
  const set = new Set<number>();
  for (const c of area.map.continents as { areas: { subzones: { rooms: { coords?: { z?: number } }[] }[] }[] }[]) {
    for (const a of c.areas)
      for (const s of a.subzones) for (const r of s.rooms) if (r.coords) set.add(r.coords.z ?? 0);
  }
  return [...set].sort((a, b) => b - a);
}

function roomFloor(area: LoadedArea, roomId: string): number | null {
  for (const c of area.map.continents as {
    areas: { subzones: { rooms: { id: string; coords?: { z?: number } }[] }[] }[];
  }[]) {
    for (const a of c.areas)
      for (const s of a.subzones)
        for (const r of s.rooms) if (r.id === roomId) return r.coords ? (r.coords.z ?? 0) : null;
  }
  return null;
}

function roomOf(area: LoadedArea, roomId: string): { title: string; exits: string[] } | null {
  for (const c of area.map.continents as {
    areas: { subzones: { rooms: { id: string; title?: string; exits: Record<string, string> }[] }[] }[];
  }[]) {
    for (const a of c.areas) {
      for (const s of a.subzones)
        for (const r of s.rooms)
          if (r.id === roomId) return { title: r.title || '(no title)', exits: Object.keys(r.exits) };
    }
  }
  return null;
}

function statusText(
  view: WorldMapView,
  located: Located | null,
  viewing: { area: LoadedArea } | null,
  z: number | null,
): string {
  const floor = z === null ? '' : ` · ${floorName(z)}`;
  if (viewing) return `Looking at ${viewing.area.name}${floor}`;
  if (view.phase === 'idle') return 'Walk into a room to see where you are.';
  if (view.phase === 'loading') return located ? `${located.area.name}${floor} · looking…` : 'Looking…';
  const l = view.location;
  switch (l.status) {
    case 'located':
      return `${l.roomIds.length > 1 ? `One of ${l.roomIds.length} rooms that look alike` : l.exact ? 'You are here' : 'You are probably here'}${floor}`;
    case 'unmapped':
      return located
        ? `Not on the map yet · last seen in ${located.area.name}`
        : `"${view.title}" is not on the map yet.`;
    case 'ambiguous':
      return `Several places are called "${view.title}": ${l.areas.map((a) => a.name).join(', ')}.`;
    default:
      return l.reason === 'not-published'
        ? 'No map has been published yet.'
        : l.reason === 'offline'
          ? 'The map is offline.'
          : l.message;
  }
}

export interface WorldMapWindowProps {
  isOpen: boolean;
  onClose: () => void;
  /** Tests give their own; the page uses the shared ones. */
  session?: WorldMapSession;
  api?: WorldMapApi;
  settings?: SettingsStore;
  /** The player's own rooms (tests give their own; the page uses the shared one). */
  layers?: LayerStore;
  /** The rooms visited, for fog of war (tests give their own; the page uses the shared one). */
  visits?: VisitStore;
  /** The cloud backup's calls (tests give fakes; the page uses the site's). */
  backup?: BackupApi;
}

// Keyed by the world: when the client moves to another game (a local-only build can) the window starts over on that world's map, never
// carrying an area, a floor or a placement of one world into another. A production build has one world, so the key never changes.
const WorldMapWindow: React.FC<WorldMapWindowProps> = (props) => {
  const world = useActiveMapWorld();
  return props.isOpen ? <OpenWindow key={world.id} {...props} world={world} /> : null;
};

const OpenWindow: React.FC<WorldMapWindowProps & { world: MapWorld }> = ({
  onClose,
  session,
  api: injectedApi,
  settings: injectedSettings,
  layers: injectedLayers,
  visits: injectedVisits,
  backup: injectedBackup,
  world,
}) => {
  const api = React.useMemo(() => injectedApi ?? sharedWorldMapApi(world), [injectedApi, world]);
  const layers = React.useMemo(() => injectedLayers ?? sharedLayerStore(), [injectedLayers]);
  const store = React.useMemo(() => injectedSettings ?? sharedSettings(), [injectedSettings]);
  const prefs: MapSettings = React.useSyncExternalStore(store.subscribe, store.get);
  const view = useWorldMap(session);
  const initial = React.useMemo(() => defaultGeometry(), []);
  const panel = useFloatingPanel({ storageKey: 'shatteredarchive:worldmap:window:v1', initial, limits: LIMITS });
  const { x, y, width, height } = panel.geometry;

  // ---- where the player is, and what is shown ----
  const here: Located | null = view.phase === 'done' && view.location.status === 'located' ? view.location : null;
  const [lastHere, setLastHere] = React.useState<Located | null>(null);
  const [seen, setSeen] = React.useState<WorldMapView>(view);
  if (view !== seen) {
    setSeen(view);
    if (here) setLastHere(here); // the last place the player was found stays shown while they are somewhere unmapped
  }
  const player = here ?? lastHere;

  const [viewing, setViewing] = React.useState<{ area: LoadedArea; roomId: string } | null>(null);
  const [floorPick, setFloorPick] = React.useState<number | null>(null);
  const [following, setFollowing] = React.useState(true);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<{ title: string; exits: string[] } | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  // the add-a-room panel: opened for the room the player stands in (filled from their history) or empty, to type a room in by hand
  const [adding, setAdding] = React.useState<{ observed: Observed | null } | null>(null);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const openAdd = (forThisRoom: boolean): void => {
    const room = getRoomData();
    const title = String(room?.room ?? '').trim();
    setMenuOpen(false);
    setAdding({ observed: forThisRoom && title !== '' ? { title, exits: room?.exits ?? [], sector: room?.sector } : null });
  };

  // the player walked into another area: stop looking at the one that was clicked, and follow again
  const [playerArea, setPlayerArea] = React.useState<string | null>(null);
  const nowArea = here?.area.id ?? null;
  if (nowArea !== null && nowArea !== playerArea) {
    setPlayerArea(nowArea);
    if (playerArea !== null) {
      setViewing(null);
      setFloorPick(null);
      setFollowing(true);
    }
  }

  const playerRoomIds = React.useMemo(() => (viewing ? [] : (player?.roomIds ?? [])), [viewing, player]);
  // Fog of war: with it on, only the rooms the account (or the character) has visited are drawn, and the player's own room always is; every
  // other room, its name and where an exit leads are left out (applyFog). Off changes nothing at all.
  const visited = useVisited(prefs.fog, world.id, injectedVisits);
  const rawArea = viewing?.area ?? player?.area ?? null;
  const area = React.useMemo(
    () => (rawArea && visited ? { ...rawArea, map: applyFog(rawArea.map, new Set([...visited, ...playerRoomIds])) } : rawArea),
    [rawArea, visited, playerRoomIds],
  );
  const floors = React.useMemo(() => (area ? floorsOf(area) : []), [area]);
  const viewingFloor = viewing ? roomFloor(viewing.area, viewing.roomId) : null;
  // The floor shown: the one picked, else the clicked room's floor, else the player's own; the lowest one when none of those is known.
  const preferred = floorPick ?? viewingFloor ?? (viewing || player === null ? null : player.z);
  const z: number | null = area === null ? null : (preferred ?? floors[floors.length - 1] ?? null);

  const html = React.useMemo(() => {
    if (area === null || z === null) return null;
    const slice = sliceMap(area.map, 'area', area.id);
    if (!slice) return null;
    const svg = renderSvg(slice, {
      layout: 'grid', // a room is an octagon: the game has eight compass directions (the hexagon layout was removed)
      z,
      labels: prefs.labels,
      align: 'slice',
      ghosts: GHOSTS_BY_MODE[prefs.floors],
    });
    return { __html: svg };
  }, [area, z, prefs.labels, prefs.floors]);

  // ---- pan and zoom ----
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const [pose, setPose] = React.useState<View>(IDENTITY);
  // The latest pose for the handlers that must not be rebuilt on every move. Declared before the placing effect below, so it is current there.
  const poseRef = React.useRef<View>(IDENTITY);
  React.useLayoutEffect(() => {
    poseRef.current = pose;
  }, [pose]);
  const boxSize = (): Size => {
    const el = viewportRef.current;
    return el && el.clientWidth > 0 && el.clientHeight > 0
      ? { width: el.clientWidth, height: el.clientHeight }
      : FALLBACK_BOX;
  };
  /** What "the whole floor" is: the rooms of the drawn floor (the renderer's data-bounds), else the whole picture, else nothing. */
  const contentRect = (): Rect => {
    const svg = stageRef.current?.querySelector('svg');
    const parts = (svg?.getAttribute('data-bounds') ?? '').split(' ').map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite))
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    return {
      x: 0,
      y: 0,
      width: Number(svg?.getAttribute('width')) || 0,
      height: Number(svg?.getAttribute('height')) || 0,
    };
  };
  const roomPoint = (roomId: string): Point | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    for (const el of Array.from(stage.querySelectorAll('[data-room]'))) {
      if (el.getAttribute('data-room') === roomId) return polygonCenter(el.getAttribute('points'));
    }
    return null;
  };

  const pendingFocus = React.useRef<string | null>(null);
  const lastFrame = React.useRef('');
  const frame = `${area?.id ?? ''}|${prefs.labels}`;
  const targetKey = `${playerRoomIds.join(',')}|${following}|${viewing?.roomId ?? ''}`;

  // After the picture is drawn: mark the player's room(s), then place the view (centre on the player or the clicked room, or fit a new area).
  React.useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || html === null) return;
    const wanted = new Set(playerRoomIds);
    for (const el of Array.from(stage.querySelectorAll('[data-room]'))) {
      if (wanted.has(String(el.getAttribute('data-room')))) el.setAttribute('data-current', 'true');
      else el.removeAttribute('data-current');
    }
    const focusId = pendingFocus.current ?? (following ? (playerRoomIds[0] ?? null) : null);
    const target = focusId ? roomPoint(focusId) : null;
    const areaChanged = lastFrame.current !== frame;
    lastFrame.current = frame;
    const next = placeView({
      areaChanged,
      current: poseRef.current,
      content: contentRect(),
      box: boxSize(),
      target,
      centerOnTarget: pendingFocus.current !== null || following,
    });
    pendingFocus.current = null;
    if (next !== poseRef.current) setPose(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the pose is read through its ref; what changes the placing is the picture and who is followed
  }, [html, frame, targetKey]);

  // "You are here": a red dot on the player's room (on every room that looks alike, fainter, when it is not certain which), drawn after the picture is,
  // like the room mark above. It follows the toggle button; it is not drawn while another area is being looked at (the player's rooms are none then).
  React.useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || html === null) return;
    stage.querySelectorAll('[data-you-are-here]').forEach((el) => el.remove());
    const svg = stage.querySelector('svg');
    if (!svg || !prefs.here || playerRoomIds.length === 0) return;
    const wanted = new Set(playerRoomIds);
    const sure = playerRoomIds.length === 1 && player?.exact === true;
    for (const el of Array.from(stage.querySelectorAll('[data-room]'))) {
      if (!wanted.has(String(el.getAttribute('data-room')))) continue;
      const dot = polygonDot(el.getAttribute('points')) as NonNullable<ReturnType<typeof polygonDot>>; // the renderer always writes a tile's points
      const mark = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      mark.setAttribute('cx', String(dot.x));
      mark.setAttribute('cy', String(dot.y));
      mark.setAttribute('r', String(dot.r));
      mark.setAttribute('fill', '#e5252a');
      mark.setAttribute('stroke', '#ffffff');
      mark.setAttribute('stroke-width', '2');
      mark.setAttribute('opacity', sure ? '1' : '0.6');
      mark.setAttribute('pointer-events', 'none');
      mark.setAttribute('data-you-are-here', el.getAttribute('data-room') as string);
      svg.appendChild(mark);
    }
  }, [html, playerRoomIds, player, prefs.here]);

  // The wheel zooms around the pointer. It needs a non-passive listener (React's onWheel is passive and cannot stop the page scrolling).
  React.useEffect(() => {
    const el = viewportRef.current as HTMLDivElement; // the viewport is always mounted with the window
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      setPose(
        zoomAt(poseRef.current, Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top),
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const drag = React.useRef<{
    id: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = React.useRef(false);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== undefined && event.button !== 0) return;
    // A new press starts clean: the click that ends a drag is swallowed once, but a drag that ends without one (the pointer was released
    // elsewhere) must not swallow the next real click.
    suppressClick.current = false;
    drag.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
    // The pointer is NOT captured yet: with it captured, the click that ends a plain press is retargeted to the viewport, and a click on a room,
    // an exit or a ghost floor would never find its element. It is captured once the press turns into a drag (below).
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    if (!d.moved && Math.hypot(event.clientX - d.startX, event.clientY - d.startY) < DRAG_SLOP) return;
    if (!d.moved) event.currentTarget.setPointerCapture?.(event.pointerId); // a drag keeps following the pointer outside the picture
    d.moved = true;
    // the distance is taken now: the updater below runs later, after lastX and lastY have moved on
    const dx = event.clientX - d.lastX;
    const dy = event.clientY - d.lastY;
    d.lastX = event.clientX;
    d.lastY = event.clientY;
    setPose((p) => panBy(p, dx, dy));
    setFollowing(false);
  };
  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    suppressClick.current = d.moved;
    drag.current = null;
    if (d.moved) event.currentTarget.releasePointerCapture?.(event.pointerId); // only a drag captured it
  };

  // ---- actions ----
  const requests = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => requests.current?.abort(), []);

  const zoomBy = (factor: number): void => {
    const box = boxSize();
    setPose((p) => zoomAt(p, factor, box.width / 2, box.height / 2));
  };
  const fitAll = (): void => {
    setFollowing(false);
    setPose(fit(contentRect(), boxSize()));
  };
  /** Back to the player: their area, their floor, following again, life-size on their room (or the whole floor when they are not on the map). */
  const resetView = (): void => {
    setViewing(null);
    setFloorPick(null);
    setPicked(null);
    setNotice(null);
    setFollowing(true);
    const target = playerRoomIds[0] ? roomPoint(playerRoomIds[0]) : null;
    setPose(target ? centerOn(IDENTITY, target, boxSize()) : fit(contentRect(), boxSize()));
  };
  /** Like Reset view, but keeps the zoom when the player's own area and floor are already shown. */
  const centerMe = (): void => {
    const target = !viewing && floorPick === null && playerRoomIds[0] ? roomPoint(playerRoomIds[0]) : null;
    if (!target) return resetView();
    setFollowing(true);
    setPose((p) => centerOn(p, target, boxSize()));
  };
  const chooseFloor = (floor: number): void => {
    setFloorPick(floor);
    setFollowing(false);
  };
  const stepFloor = (direction: 1 | -1): void => {
    const at = floors.indexOf(z as number); // -1 when no floor is shown or it is not one of the area's
    if (at < 0) return;
    const next = floors[at - direction];
    if (next !== undefined) chooseFloor(next);
  };

  async function openNeighbour(roomId: string): Promise<void> {
    requests.current?.abort();
    const mine = new AbortController();
    requests.current = mine;
    setNotice('Looking at the neighbouring area…');
    const fail = (r: Extract<ApiResult<unknown>, { ok: false }>): void => {
      if (r.error.kind === 'aborted') return;
      setNotice(
        r.error.kind === 'offline'
          ? 'The map is offline.'
          : r.error.kind === 'http' && r.error.status === 404
            ? 'That exit leads to a place that is not on the map yet.'
            : r.error.kind === 'http'
              ? r.error.message
              : 'The map answer was not understood.',
      );
    };
    await api.checkFresh(mine.signal);
    if (mine.signal.aborted) return;
    const where = await api.getRoomArea(roomId, mine.signal);
    if (mine.signal.aborted) return;
    if (!where.ok) return fail(where);
    const loaded = await api.getArea(where.value.areaId, mine.signal);
    if (mine.signal.aborted) return;
    if (!loaded.ok) return fail(loaded);
    setNotice(null);
    setPicked(null);
    setFloorPick(null);
    setFollowing(false);
    // An exit whose room is in the area already shown is a link of this map, not an exit out of it (the renderer marks those only when the
    // target is outside the area): there is nothing to open.
    if (area !== null && loaded.value.id === area.id) return;
    pendingFocus.current = roomId;
    setViewing({ area: loaded.value, roomId });
  }

  const onClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const target = event.target as Element;
    const exit = target.closest?.('[data-offpage-to]');
    if (exit) return void openNeighbour(String(exit.getAttribute('data-offpage-to')));
    const ghost = target.closest?.('[data-ghost-floor]');
    if (ghost) return chooseFloor(Number(ghost.getAttribute('data-ghost-floor')));
    const roomEl = target.closest?.('[data-room]');
    if (roomEl && area) setPicked(roomOf(area, String(roomEl.getAttribute('data-room'))));
    else setPicked(null);
  };

  // Escape closes the innermost thing first (help, the add-room flow, the menu), then the window; the same from the window stack
  // (the focus anywhere on the page) as from inside the window
  const escape = (): void => {
    if (helpOpen) setHelpOpen(false);
    else if (adding) setAdding(null);
    else if (menuOpen) setMenuOpen(false);
    else onClose();
  };
  const layer = useWindowLayer({ open: true, onEscape: escape });
  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      escape();
      return;
    }
    if ((event.target as Element).closest?.('select,input,textarea')) return;
    const move = (dx: number, dy: number): void => {
      event.preventDefault();
      setFollowing(false);
      setPose((p) => panBy(p, dx, dy));
    };
    switch (event.key) {
      case 'ArrowLeft':
        return move(KEY_PAN, 0);
      case 'ArrowRight':
        return move(-KEY_PAN, 0);
      case 'ArrowUp':
        return move(0, KEY_PAN);
      case 'ArrowDown':
        return move(0, -KEY_PAN);
      case '+':
      case '=':
        event.preventDefault();
        return zoomBy(ZOOM_STEP);
      case '-':
        event.preventDefault();
        return zoomBy(1 / ZOOM_STEP);
      case 'PageUp':
        event.preventDefault();
        return stepFloor(1);
      case 'PageDown':
        event.preventDefault();
        return stepFloor(-1);
      case 'Home':
        event.preventDefault();
        return resetView();
      default:
    }
  };

  const away = viewing !== null || (!following && player !== null) || floorPick !== null;
  const showFloors = floors.length > 1 && html !== null;

  return (
    <div
      className={styles.window}
      role="dialog"
      aria-label="Map"
      onKeyDown={onKeyDown}
      onPointerDownCapture={layer.bringToFront}
      style={{ position: 'fixed', left: x, top: y, width, height, zIndex: layer.zIndex }}
    >
      <div className={styles.header} onPointerDown={panel.onHeaderPointerDown}>
        <span className={styles.title}>{world.label === '' ? 'Map' : `Map · ${world.label}`}</span>
        <span className={styles.areaName}>{area ? area.name : ''}</span>
        <HelpInfoButton topic="the map" open={helpOpen} onToggle={() => setHelpOpen((o) => !o)} />
        {prefs.fog !== 'off' && (
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Fog of war is on: ${FOG_LABELS[prefs.fog]}. Click to change`}
            title={`Fog of war: ${FOG_LABELS[prefs.fog]}`}
            onClick={() => setMenuOpen(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Map settings"
          aria-expanded={menuOpen}
          aria-haspopup="true"
          onClick={() => setMenuOpen((o) => !o)}
        >
          ⚙
        </button>
        <button type="button" className={styles.iconButton} aria-label="Close the map" onClick={onClose}>
          ×
        </button>
      </div>

      <div className={styles.body}>
        <div
          ref={viewportRef}
          className={styles.viewport}
          tabIndex={0}
          aria-label="Map picture. Drag to move, scroll to zoom."
          data-testid="world-map-viewport"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onClick={onClick}
        >
          {html !== null && (
            <div
              ref={stageRef}
              className={styles.stage}
              style={{ transform: `translate(${pose.x}px, ${pose.y}px) scale(${pose.scale})` }}
            >
              <div dangerouslySetInnerHTML={html} data-testid="world-map-picture" />
            </div>
          )}
          {html === null && <p className={styles.empty}>{statusText(view, player, viewing, z)}</p>}
        </div>

        {showFloors && (
          <div className={styles.floors} data-ui role="group" aria-label="Floors">
            {floors.map((f) => (
              <button
                key={f}
                type="button"
                className={styles.floor}
                aria-pressed={f === z}
                aria-label={floorName(f)}
                title={floorName(f)}
                onClick={() => chooseFloor(f)}
              >
                {floorLabel(f)}
              </button>
            ))}
          </div>
        )}

        {away && html !== null && (
          <button type="button" className={styles.back} data-ui onClick={resetView} title="Back to where you are">
            {viewing ? `Looking at ${viewing.area.name} · Reset view` : 'Reset view'}
          </button>
        )}

        <div className={styles.controls} data-ui role="group" aria-label="Zoom">
          <button
            type="button"
            className={styles.control}
            aria-label="Zoom in"
            title="Zoom in"
            disabled={html === null || pose.scale >= MAX_SCALE}
            onClick={() => zoomBy(ZOOM_STEP)}
          >
            +
          </button>
          <button
            type="button"
            className={styles.control}
            aria-label="Zoom out"
            title="Zoom out"
            disabled={html === null || pose.scale <= MIN_SCALE}
            onClick={() => zoomBy(1 / ZOOM_STEP)}
          >
            −
          </button>
          <button
            type="button"
            className={styles.control}
            aria-label="Fit the whole floor"
            title="Fit the whole floor"
            disabled={html === null}
            onClick={fitAll}
          >
            ⤢
          </button>
          <button
            type="button"
            className={styles.control}
            aria-label="Centre on me"
            title="Centre on me"
            disabled={html === null || playerRoomIds.length === 0}
            onClick={centerMe}
          >
            ⌖
          </button>
          <button
            type="button"
            className={styles.control}
            aria-label="Show where I am"
            title="Show where I am (a red dot)"
            aria-pressed={prefs.here}
            disabled={html === null}
            onClick={() => store.set({ here: !prefs.here })}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
              <circle cx="12" cy="12" r="5" fill="#e5252a" />
            </svg>
          </button>
        </div>

        {menuOpen && (
          <div className={styles.menu} data-ui role="group" aria-label="Map settings">
            <MapWorldPicker />
            <fieldset>
              <legend>Other floors</legend>
              {(Object.keys(FLOORS_LABELS) as FloorsMode[]).map((mode) => (
                <label key={mode}>
                  <input
                    type="radio"
                    name="worldmap-floors"
                    checked={prefs.floors === mode}
                    onChange={() => store.set({ floors: mode })}
                  />
                  {FLOORS_LABELS[mode]}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Fog of war</legend>
              {(Object.keys(FOG_LABELS) as FogMode[]).map((mode) => (
                <label key={mode}>
                  <input type="radio" name="worldmap-fog" checked={prefs.fog === mode} onChange={() => store.set({ fog: mode })} />
                  {FOG_LABELS[mode]}
                </label>
              ))}
            </fieldset>
            <label className={styles.check}>
              <input type="checkbox" checked={prefs.labels} onChange={(e) => store.set({ labels: e.target.checked })} />
              Room names
            </label>
            <button type="button" className={styles.menuAction} onClick={() => openAdd(false)}>
              Add a room by hand…
            </button>
            <MapBackupSection world={world.id} visits={injectedVisits} layers={injectedLayers} api={injectedBackup} />
          </div>
        )}

        {helpOpen && (
          <div className={styles.helpOverlay}>
            <MapHelp onBack={() => setHelpOpen(false)} />
          </div>
        )}

        {adding && (
          <AddRoomPanel
            api={api}
            store={layers}
            world={world}
            observed={adding.observed}
            here={player ? { areaId: player.area.id, continentId: player.area.continentId } : null}
            onClose={() => setAdding(null)}
          />
        )}
      </div>

      <div className={styles.status} role="status" aria-live="polite">
        <span className={styles.statusText}>
          {notice ??
            (picked
              ? `${picked.title}${picked.exits.length ? ` · exits ${picked.exits.join(', ')}` : ''}`
              : statusText(view, player, viewing, z))}
        </span>
        {!adding && view.phase === 'done' && view.location.status === 'unmapped' && viewing === null && (
          <button type="button" className={styles.addButton} onClick={() => openAdd(true)}>
            Add this room…
          </button>
        )}
        {area && area.credits.length > 0 && (
          <span className={styles.credit}>Map data by {area.credits.join(', ')}</span>
        )}
      </div>
      <div
        className={styles.resize}
        onPointerDown={panel.onResizePointerDown}
        aria-hidden="true"
        title="Drag to resize"
      />
    </div>
  );
};

export default WorldMapWindow;
