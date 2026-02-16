// apps\game-client\src\types\event-types\game-remote-server-raw.ts
export type GameRemoteServerRaw = {
  type: 'raw';
  receivedTimestamp: string;
  payload: string;
};
