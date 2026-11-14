// apps/game-client/src/features/worldmap/mine/draft.ts
//
// The logic behind the map window's "add this room" panel, kept out of the component: what is known about the room the player is standing in
// (from their own history, else nothing), what each of its exits might lead to (rooms of the published map or of their own layer, found by
// the title the history gives), the places a room can be filed in, and the save. Everything goes through the same WorldMapApi the window uses,
// so a room added earlier is found too. Nothing here writes to the published map: a save goes to the player's layer.

import { DIRECTIONS, type AddRoomResult, type Direction, type Place } from '@shatteredarchive/shattered-maps-core';
import { exitsToSet } from '../../movement/classifyMovement';
import type { WorldMapApi } from '../api';
import { findHistory, type HistoryRoom } from './history';
import type { LayerStore } from './layerStore';

export interface RoomChoice {
  roomId: string;
  title: string;
  areaId: string;
  areaName: string;
}

export interface ExitRow {
  dir: Direction;
  /** What the history says this exit led to (the title as the game printed it), when it knows. */
  suggestedTitle?: string;
  /** Rooms of the map (published or the player's own) that title could be. */
  choices: RoomChoice[];
  /** The room to preselect: the only choice, else none. */
  preselected: string | null;
}

export interface PlaceOptions {
  continents: { id: string; name: string }[];
  areas: { id: string; name: string; continentId: string }[];
}

export interface DraftData {
  title: string;
  sector: string;
  exits: ExitRow[];
  /** "your Copilot history", "what this browser has seen", or null when no source knew the room. */
  historyLabel: string | null;
  places: PlaceOptions;
  /** Where to file it unless the player says otherwise: the area they were last found in, else the area of a neighbour. */
  defaultPlace: { continentId: string; areaId: string } | null;
}

export interface Observed {
  title: string;
  exits: string[];
  sector?: string;
}

export interface Here {
  areaId: string;
  continentId: string;
}

export function directionsOf(exits: string[]): Direction[] {
  const have = exitsToSet(exits);
  return DIRECTIONS.filter((d) => have.has(d));
}

function bestHistory(rooms: HistoryRoom[]): HistoryRoom | undefined {
  return rooms.find((r) => r.sameExits) ?? rooms[0];
}

/** The rooms of the map whose title is exactly this one (case and spacing ignored), at most `limit`. */
export async function roomsTitled(api: WorldMapApi, title: string, signal: AbortSignal, limit = 6): Promise<RoomChoice[]> {
  const key = title.replace(/\s+/g, ' ').trim().toLowerCase();
  const found = await api.search(title.trim().slice(0, 100), signal);
  if (!found.ok) return [];
  return found.value.results
    .filter((hit) => hit.title.replace(/\s+/g, ' ').trim().toLowerCase() === key)
    .slice(0, limit)
    .map((hit) => ({ roomId: hit.roomId, title: hit.title, areaId: hit.areaId, areaName: hit.areaName }));
}

/** Rooms of the map whose title contains the text, for the "find a room" box of an exit (at most `limit`). */
export async function findRooms(api: WorldMapApi, text: string, signal: AbortSignal, limit = 8): Promise<RoomChoice[]> {
  if (text.trim().length < 2) return [];
  const found = await api.search(text.trim().slice(0, 100), signal);
  if (!found.ok) return [];
  return found.value.results.slice(0, limit).map((hit) => ({ roomId: hit.roomId, title: hit.title, areaId: hit.areaId, areaName: hit.areaName }));
}

/** The subzones of an area (the map's and the player's own); empty when the area cannot be read. */
export async function subzonesOf(api: WorldMapApi, areaId: string, signal: AbortSignal): Promise<{ id: string; name: string }[]> {
  const area = await api.getArea(areaId, signal);
  if (!area.ok) return [];
  return area.value.map.continents.flatMap((c) => c.areas.filter((a) => a.id === areaId).flatMap((a) => a.subzones.map((s) => ({ id: s.id, name: s.name }))));
}

/** Gathers what the panel shows for the room the player is in. A map that cannot be read gives empty options (the player can still type). */
export async function loadDraft(api: WorldMapApi, world: string, observed: Observed, here: Here | null, signal: AbortSignal): Promise<DraftData> {
  const directions = directionsOf(observed.exits);
  const answer = observed.title.trim() === '' ? null : await findHistory(world, { title: observed.title, exits: directions }, signal);
  const best = answer ? bestHistory(answer.rooms) : undefined;
  const wanted = new Map(best?.neighbours.map((n) => [n.dir.toUpperCase(), n.title]));

  const rows: ExitRow[] = [];
  for (const dir of directions) {
    const suggestedTitle = wanted.get(dir);
    const choices = suggestedTitle === undefined ? [] : await roomsTitled(api, suggestedTitle, signal);
    rows.push({
      dir,
      ...(suggestedTitle === undefined ? {} : { suggestedTitle }),
      choices,
      preselected: choices.length === 1 ? choices[0].roomId : null,
    });
  }

  const index = await api.getIndex(signal);
  const places: PlaceOptions = index.ok
    ? { continents: index.value.continents.map((c) => ({ id: c.id, name: c.name })), areas: index.value.areas.map((a) => ({ id: a.id, name: a.name, continentId: a.continentId })) }
    : { continents: [], areas: [] };

  let defaultPlace: DraftData['defaultPlace'] = here ? { continentId: here.continentId, areaId: here.areaId } : null;
  if (defaultPlace === null) {
    const neighbour = rows.flatMap((r) => r.choices)[0];
    const area = neighbour ? places.areas.find((a) => a.id === neighbour.areaId) : undefined;
    if (area) defaultPlace = { continentId: area.continentId, areaId: area.id };
  }

  return {
    title: observed.title,
    sector: observed.sector ?? best?.sector ?? '',
    exits: rows,
    historyLabel: answer?.label ?? null,
    places,
    defaultPlace,
  };
}

/** A continent, area or subzone as the form holds it: an existing one (`id`) or a new name. */
export type PlaceChoice = { kind: 'existing'; id: string; name: string } | { kind: 'new'; name: string };

export interface RoomForm {
  title: string;
  sector: string;
  source: 'walked' | 'manual';
  /** Direction -> the room the exit leads to, or null for "I don't know". */
  exits: Partial<Record<Direction, string | null>>;
  continent: PlaceChoice;
  area: PlaceChoice;
  subzone: PlaceChoice;
}

function placeOf(form: RoomForm): Place {
  return {
    ...(form.continent.kind === 'existing' ? { continentId: form.continent.id } : {}),
    continent: form.continent.name,
    ...(form.area.kind === 'existing' ? { areaId: form.area.id } : {}),
    area: form.area.name,
    ...(form.subzone.kind === 'existing' ? { subzoneId: form.subzone.id } : {}),
    subzone: form.subzone.name,
  };
}

/** Files the room in the player's layer for this world. `avoid` holds the ids on screen, so a new id cannot collide with one of them. */
export function saveRoom(store: LayerStore, world: string, form: RoomForm, at: string, avoid: ReadonlySet<string> = new Set()): Promise<AddRoomResult> {
  return store.add(
    world,
    {
      title: form.title,
      ...(form.sector.trim() === '' ? {} : { sector: form.sector }),
      place: placeOf(form),
      exits: form.exits,
      source: form.source,
      at,
    },
    avoid,
  );
}
