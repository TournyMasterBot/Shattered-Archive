// apps\game-client\src\types\event-types\game-remote-server-close.ts
export type GameRemoteServerClose = {
  type: 'socket-closed' | 'server-closed';
  payload: {
    receivedTimestamp: string;
    reason?: string;
  };
};
