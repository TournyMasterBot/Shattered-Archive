// apps/game-client/src/features/room/roomDataStore.ts

import type { RoomDataPayload } from '../../hooks/useCompassBlock';

let lastRoomData: RoomDataPayload | null = null;

export function setRoomData(payload: RoomDataPayload): void {
  lastRoomData = payload;
}

export function getRoomData(): RoomDataPayload | null {
  return lastRoomData;
}
