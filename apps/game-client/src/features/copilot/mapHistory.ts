// apps/game-client/src/features/copilot/mapHistory.ts
//
// The Copilot server's walked rooms as a history source for the map window's add-room flow (features/worldmap/mine/history.ts). Local build
// only, like the rest of this folder. It answers only while the Copilot switch is on: a page with Copilot off asks the server nothing.

import type { HistoryRoom, HistorySource } from '../worldmap/mine/history';
import type { CopilotApi } from './api';

export function createCopilotHistorySource(api: CopilotApi, isEnabled: () => boolean): HistorySource {
  return {
    label: 'your Copilot history',
    async find(world, observation, signal): Promise<HistoryRoom[]> {
      if (!isEnabled()) return [];
      const result = await api.nearRooms(world, observation.title, observation.exits, signal);
      if (!result.ok) return [];
      return result.value.map((room) => ({
        source: 'copilot',
        title: room.title,
        ...(room.sector === undefined ? {} : { sector: room.sector }),
        exits: room.exits.map((e) => e.dir),
        neighbours: room.exits.flatMap((e) => (e.toTitle === undefined ? [] : [{ dir: e.dir, title: e.toTitle }])),
        visits: room.visits,
        sameExits: room.sameExits,
      }));
    },
  };
}
