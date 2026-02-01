// apps/game-client/src/hooks/useGameConnection.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { DispatchEvent, ListenEvent } from '../features/event-emitter/event-dispatcher';
import { dslToAnsi } from '../features/chat/dsl-to-ansi';

export interface UseGameConnectionResult {
  isConnected: boolean;
  currentHost?: string;
  currentPort?: number;
  lastError?: string | null;

  connect: (host: string, port: number, options?: { autoEnableGmcp?: boolean }) => void;
  disconnect: () => void;
  sendRaw: (data: string) => void;
}

/**
 * These match the server message contracts:
 * ServerMessage = raw | gmcp | error | close
 */
type ServerRawMessage = { type: 'raw'; data: string };
type ServerGmcpMessage = { type: 'gmcp'; data: string };
type ServerErrorMessage = { type: 'error'; message: string };
type ServerCloseMessage = { type: 'close'; reason?: string };

type ServerMessage = ServerRawMessage | ServerGmcpMessage | ServerErrorMessage | ServerCloseMessage;

/**
 * Client → server payloads (unchanged from server expectations)
 */
type ClientConnectMessage = { type: 'connect'; host: string; port: number };
type ClientDataMessage = { type: 'data'; data: string };
type ClientMessage = ClientConnectMessage | ClientDataMessage;

export function useGameConnection(): UseGameConnectionResult {
  const [isConnected, setIsConnected] = useState(false);
  const [currentHost, setCurrentHost] = useState<string | undefined>();
  const [currentPort, setCurrentPort] = useState<number | undefined>();
  const [lastError, setLastError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const lastHostRef = useRef<string | undefined>(undefined);
  const lastPortRef = useRef<number | undefined>(undefined);

  /**
   * -----------------------------------------------------------------------
   * Emitters (ONLY: server receive -> game:* event)
   * -----------------------------------------------------------------------
   */

  const emitSocketOpen = useCallback(() => {
    DispatchEvent('game:remote-server:open', {
      type: 'socket-opened',
      host: lastHostRef.current,
      port: lastPortRef.current,
      receivedTimestamp: new Date().toISOString(),
    });
  }, []);

  const emitSocketClosed = useCallback((reason?: string) => {
    DispatchEvent('game:remote-server:close', {
      type: 'socket-closed',
      host: lastHostRef.current,
      port: lastPortRef.current,
      payload: {
        receivedTimestamp: new Date().toISOString(),
        reason,
      },
    });
  }, []);

  const emitServerRaw = useCallback((data: string) => {
    DispatchEvent('game:remote-server:raw', {
      type: 'raw',
      receivedTimestamp: new Date().toISOString(),
      payload: data,
    });
  }, []);

  const emitServerGmcp = useCallback((data: string) => {
    DispatchEvent('game:remote-server:gmcp', {
      type: 'gmcp',
      receivedTimestamp: new Date().toISOString(),
      payload: data,
    });
  }, []);

  const emitServerError = useCallback((message: string) => {
    DispatchEvent('game:remote-server:error', {
      type: 'error',
      payload: {
        receivedTimestamp: new Date().toISOString(),
        message,
      },
    });
  }, []);

  const emitServerClose = useCallback((reason?: string) => {
    DispatchEvent('game:remote-server:close', {
      type: 'server-closed',
      payload: {
        host: lastHostRef.current,
        port: lastPortRef.current,
        receivedTimestamp: new Date().toISOString(),
        reason,
      },
    });
  }, []);

  /**
   * -----------------------------------------------------------------------
   * Socket lifecycle
   * -----------------------------------------------------------------------
   */

  const cleanupSocket = useCallback(
    (reason?: string) => {
      const ws = wsRef.current;
      wsRef.current = null;

      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }

      setIsConnected(false);
      setCurrentHost(undefined);
      setCurrentPort(undefined);

      emitSocketClosed(reason);
    },
    [emitSocketClosed],
  );

  const disconnect = useCallback(() => {
    cleanupSocket('client-disconnect');
  }, [cleanupSocket]);

  const sendTelnetData = useCallback((data: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const msg: ClientMessage = { type: 'data', data };
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // ignore
    }
  }, []);

  // -----------------------------------------------------------------------
  // Outbound bridge: shatteredarchive:send-command -> websocket "data"
  // -----------------------------------------------------------------------
  useEffect(() => {
    const unbind = ListenEvent<{ cmd: string }>('shatteredarchive:send-command', (payload) => {
      const cmd = payload?.cmd ?? '';
      const ansi = dslToAnsi(`{D> ${cmd}{x\n\n`);
      DispatchEvent('shatteredarchive:write-terminal', {
        rawText: ansi,
      });
      sendTelnetData(cmd);
    });

    return () => {
      try {
        unbind();
      } catch {
        // ignore
      }
    };
  }, [sendTelnetData]);

  const bindSocketHandlers = useCallback(
    (ws: WebSocket) => {
      const onOpen = () => {
        setIsConnected(true);
        setCurrentHost(lastHostRef.current);
        setCurrentPort(lastPortRef.current);
        emitSocketOpen();
      };

      const onClose = () => {
        setIsConnected(false);
        setCurrentHost(undefined);
        setCurrentPort(undefined);
        emitSocketClosed('ws-close');
      };

      const onError = () => {
        setLastError('WebSocket error');
        DispatchEvent('game:socket-error', {
          host: lastHostRef.current,
          port: lastPortRef.current,
          ts: Date.now(),
        });
      };

      const onMessage = (ev: MessageEvent) => {
        let msg: ServerMessage;

        try {
          msg = JSON.parse(String(ev.data)) as ServerMessage;
        } catch {
          setLastError('Invalid server payload');
          emitServerError('Invalid JSON payload from server');
          return;
        }

        switch (msg.type) {
          case 'raw': {
            emitServerRaw(msg.data ?? '');
            return;
          }

          case 'gmcp': {
            emitServerGmcp(msg.data ?? '');
            return;
          }

          case 'error': {
            const message = msg.message ?? 'Server error';
            setLastError(message);
            emitServerError(message);
            return;
          }

          case 'close': {
            emitServerClose(msg.reason);
            cleanupSocket(msg.reason ?? 'server-close');
            return;
          }

          default: {
            // defensive: unknown message
            emitServerError(`Unknown server message type: ${(msg as any)?.type}`);
            return;
          }
        }
      };

      ws.addEventListener('open', onOpen);
      ws.addEventListener('close', onClose);
      ws.addEventListener('error', onError);
      ws.addEventListener('message', onMessage);

      return () => {
        ws.removeEventListener('open', onOpen);
        ws.removeEventListener('close', onClose);
        ws.removeEventListener('error', onError);
        ws.removeEventListener('message', onMessage);
      };
    },
    [cleanupSocket, emitServerClose, emitServerError, emitServerGmcp, emitServerRaw, emitSocketClosed, emitSocketOpen],
  );

  const connect = useCallback(
    (host: string, port: number) => {
      setLastError(null);

      // Close any existing socket
      cleanupSocket('reconnect');

      lastHostRef.current = host;
      lastPortRef.current = port;

      setCurrentHost(host);
      setCurrentPort(port);

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/ws/game`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      const unbind = bindSocketHandlers(ws);

      const sendConnect = () => {
        const msg: ClientConnectMessage = { type: 'connect', host, port };
        try {
          ws.send(JSON.stringify(msg));
        } catch {
          // ignore
        }
      };

      if (ws.readyState === WebSocket.OPEN) {
        sendConnect();
      } else {
        const onceOpen = () => {
          ws.removeEventListener('open', onceOpen);
          sendConnect();
        };
        ws.addEventListener('open', onceOpen);
      }

      // If this hook unmounts, ensure handlers removed
      return () => {
        try {
          unbind();
        } catch {
          // ignore
        }
      };
    },
    [bindSocketHandlers, cleanupSocket],
  );

  const sendRaw = useCallback(
    (data: string) => {
      sendTelnetData(data);
    },
    [sendTelnetData],
  );

  return {
    isConnected,
    currentHost,
    currentPort,
    lastError,
    connect,
    disconnect,
    sendRaw,
  };
}
