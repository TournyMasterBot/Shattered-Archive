// apps/game-client/src/features/worldmap/mine/layeredApi.ts
//
// A map client that lays the player's own rooms over the published map: the same WorldMapApi, so the session and the window need no change.
//   getIndex: the published index plus any continent, area or room of the layer that the published map does not have;
//   getArea:  the published area with the layer's rooms of that area merged in (an area only the layer has comes from the layer alone);
//   search:   the published hits, then the layer's;
//   getRoomArea: a layer room answers from the layer, any other room from the published map.
// The published map is never changed. Merged areas are remembered per published version and layer version.

import { layoutUnplaced, layerOfArea, layerRooms, mergeLayer, searchLayer, type MapFile } from '@shatteredarchive/shattered-maps-core';
import type { ApiResult, LoadedArea, RoomArea, SearchHit, SearchResult, WorldMapApi, WorldMapIndex } from '../api';
import type { LayerStore } from './layerStore';

export const LAYER_VERSION_ID = 'mine';

/** The published index with the layer's continents, areas and room counts added (and `available` when only the layer has rooms). */
export function extendIndex(index: WorldMapIndex, layer: MapFile): WorldMapIndex {
  if (layer.continents.length === 0) return index;
  const continents = new Map(index.continents.map((c) => [c.id, { ...c }]));
  const areas = new Map(index.areas.map((a) => [a.id, { ...a }]));
  for (const c of layer.continents) {
    const continent = continents.get(c.id) ?? { id: c.id, name: c.name, areas: 0, rooms: 0 };
    continents.set(c.id, continent);
    for (const a of c.areas) {
      const rooms = a.subzones.reduce((sum, s) => sum + s.rooms.length, 0);
      const area = areas.get(a.id);
      if (area) area.rooms += rooms;
      else {
        areas.set(a.id, { id: a.id, name: a.name, continentId: c.id, rooms });
        continent.areas += 1;
      }
      continent.rooms += rooms;
    }
  }
  return { ...index, available: true, continents: [...continents.values()], areas: [...areas.values()] };
}

function layerOnlyArea(layer: MapFile, areaId: string): LoadedArea | null {
  const part = layerOfArea(layer, areaId);
  if (part === null) return null;
  const continent = part.continents[0];
  return {
    id: areaId,
    name: continent.areas[0].name,
    continentId: continent.id,
    versionId: LAYER_VERSION_ID,
    credits: [],
    map: layoutUnplaced(part).map,
  };
}

export function withLayer(base: WorldMapApi, store: LayerStore, world: string): WorldMapApi {
  const merged = new Map<string, { key: string; area: LoadedArea }>();

  return {
    checkFresh: (signal) => base.checkFresh(signal),

    async getIndex(signal): Promise<ApiResult<WorldMapIndex>> {
      const result = await base.getIndex(signal);
      if (!result.ok) return result;
      return { ok: true, value: extendIndex(result.value, await store.get(world)) };
    },

    async getArea(areaId, signal): Promise<ApiResult<LoadedArea>> {
      const layer = await store.get(world);
      const part = layerOfArea(layer, areaId);
      const result = await base.getArea(areaId, signal);
      if (!result.ok) {
        const only = result.error.kind === 'http' && result.error.status === 404 ? layerOnlyArea(layer, areaId) : null;
        return only ? { ok: true, value: only } : result;
      }
      if (part === null) return result;
      const key = `${result.value.versionId}|${store.version(world)}`;
      const have = merged.get(areaId);
      if (have && have.key === key) return { ok: true, value: have.area };
      const area: LoadedArea = { ...result.value, map: mergeLayer(result.value.map, part) };
      merged.set(areaId, { key, area });
      return { ok: true, value: area };
    },

    async search(q, signal): Promise<ApiResult<SearchResult>> {
      const result = await base.search(q, signal);
      if (!result.ok) return result;
      const mine: SearchHit[] = searchLayer(await store.get(world), q).map((r) => ({
        roomId: r.roomId,
        title: r.title,
        areaId: r.areaId,
        areaName: r.areaName,
        subzoneId: r.subzoneId,
      }));
      if (mine.length === 0) return result;
      return { ok: true, value: { ...result.value, total: result.value.total + mine.length, results: [...result.value.results, ...mine] } };
    },

    async getRoomArea(roomId, signal): Promise<ApiResult<RoomArea>> {
      const own = layerRooms(await store.get(world)).find((r) => r.roomId === roomId);
      if (own) return { ok: true, value: { roomId, areaId: own.areaId, areaName: own.areaName } };
      return base.getRoomArea(roomId, signal);
    },
  };
}
