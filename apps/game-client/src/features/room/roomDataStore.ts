// apps/game-client/src/features/room/roomDataStore.ts

import type { RoomDataPayload } from '../../hooks/useCompassBlock';

let lastRoomData: RoomDataPayload | null = null;

export function setRoomData(payload: RoomDataPayload): void {
  lastRoomData = payload;
}

export function getRoomData(): RoomDataPayload | null {
  return lastRoomData;
}

/** Test-only escape hatch — clears the cache between test cases so seeding
 * assertions in one test can't leak into another (shared module state). */
export function __resetForTests(): void {
  lastRoomData = null;
}
