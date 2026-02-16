// apps\game-client\src\types\event-types\game-remote-server-error.ts
export type GameRemoteServerError = {
  type: 'error';
  payload: {
    receivedTimestamp: string;
    message: string;
  };
};
