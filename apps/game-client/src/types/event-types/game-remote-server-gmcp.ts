// apps\game-client\src\types\event-types\game-remote-server-gmcp.ts
export type GameRemoteServerGmcp = {
  type: 'gmcp';
  receivedTimestamp: string;
  payload: string;
};
