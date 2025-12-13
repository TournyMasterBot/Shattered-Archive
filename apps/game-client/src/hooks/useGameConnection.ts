// apps/game-client/src/hooks/useGameConnection.ts
import { useCallback, useEffect, useRef, useState } from 'react';

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
 * Text patterns that indicate we should start/reset watching for GMCP.
 *
 * Behavior:
 *  1. When ANY of these substrings is seen in RAW text, we (re)start a 5-minute timer.
 *  2a. If a GMCP message arrives before that timer fires, we cancel the timer
 *      and print "GMCP is enabled".
 *  2b. If no GMCP arrives before it fires, we auto-send "gmcp" and print the
 *      ghostly hands line.
 */
const GMCP_TRIGGER_PATTERNS: string[] = [
  'Welcome to DSL! DSL Loves You! Other muds think you are ugly, they said so!',
  'When approaching a Red Dragon, be sure to bring your wand of marshmallow.',
  'Reconnecting. Type replay to see missed tells.',
];

export function useGameConnection(): UseGameConnectionResult {
  const [isConnected, setIsConnected] = useState(false);
  const [currentHost, setCurrentHost] = useState<string | undefined>();
  const [currentPort, setCurrentPort] = useState<number | undefined>();
  const [lastError, setLastError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  // Track last connected host/port so we can include them in events
  const lastHostRef = useRef<string | undefined>(undefined);
  const lastPortRef = useRef<number | undefined>(undefined);

  // GMCP auto-enable state
  const gmcpProbeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gmcpAutoEnableRef = useRef(true);

  const clearGmcpProbe = () => {
    if (gmcpProbeTimerRef.current) {
      clearTimeout(gmcpProbeTimerRef.current);
      gmcpProbeTimerRef.current = null;
      console.log('[game-connection] GMCP probe timer cleared');
    }
  };

  const emitTerminalText = useCallback((text: string) => {
    try {
      window.dispatchEvent(
        new CustomEvent('game:terminal-data', {
          detail: { text },
        }),
      );
    } catch {
      // ignore if window isn't available
    }
  }, []);

  const sendTelnetData = useCallback((data: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'data', data }));
  }, []);

  const emitSocketClosed = useCallback(() => {
    try {
      window.dispatchEvent(new CustomEvent('game:socket-closed'));
    } catch {
      // ignore
    }
  }, []);

  const emitSocketOpen = useCallback(() => {
    try {
      window.dispatchEvent(new CustomEvent('game:socket-open'));
    } catch {
      // ignore
    }
  }, []);

  const cleanupSocket = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }

    setIsConnected(false);
    setCurrentHost(undefined);
    setCurrentPort(undefined);

    clearGmcpProbe();
    gmcpAutoEnableRef.current = true;

    // Notify listeners (timers, etc.) that the socket is closed
    emitSocketClosed();
  }, [emitSocketClosed]);

  const disconnect = useCallback(() => {
    cleanupSocket();
  }, [cleanupSocket]);

  /**
   * Start / reset a one-shot GMCP check AFTER a trigger text is seen.
   * If, when the timer fires, we have NOT seen any GMCP (we will
   * cancel the timer when GMCP arrives), we auto-send "gmcp".
   */
  const scheduleGmcpCheck = useCallback(() => {
    if (!gmcpAutoEnableRef.current) {
      console.log('[game-connection] GMCP auto-enable is disabled; not scheduling probe');
      return;
    }

    // If there's already a timer running, reset it
    if (gmcpProbeTimerRef.current) {
      clearTimeout(gmcpProbeTimerRef.current);
      gmcpProbeTimerRef.current = null;
      console.log('[game-connection] GMCP probe timer reset due to new trigger text');
    }

    gmcpProbeTimerRef.current = setTimeout(
      () => {
        gmcpProbeTimerRef.current = null;

        if (!gmcpAutoEnableRef.current) {
          console.log('[game-connection] GMCP auto-enable disabled while waiting; aborting');
          return;
        }

        console.log('[game-connection] No GMCP received in window → sending gmcp command');

        emitTerminalText("\x1b[38;5;67mGhostly hands type 'gmcp'\x1b[0m\r\n");
        sendTelnetData('gmcp');

        try {
          window.dispatchEvent(
            new CustomEvent('game:gmcp-auto-enable', {
              detail: {
                host: lastHostRef.current,
                port: lastPortRef.current,
              },
            }),
          );
        } catch {
          // ignore
        }
      },
      5 * 60 * 1000,
    ); // 5 minutes

    emitTerminalText('\x1b[38;5;67m[game-connection] GMCP probe timer created (5 minutes)\x1b[0m\r\n');
  }, [emitTerminalText, sendTelnetData]);

  const connect = useCallback(
    (host: string, port: number, options?: { autoEnableGmcp?: boolean }) => {
      setLastError(null);
      cleanupSocket();

      gmcpAutoEnableRef.current = options?.autoEnableGmcp ?? true;
      clearGmcpProbe();

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/ws/game`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'connect',
            host,
            port,
          }),
        );

        setIsConnected(true);
        setCurrentHost(host);
        setCurrentPort(port);

        lastHostRef.current = host;
        lastPortRef.current = port;

        console.log('[game-connection] WebSocket opened; waiting for GMCP trigger text');

        // Notify listeners (e.g., timers) that the socket is open
        emitSocketOpen();
      };

      ws.onclose = () => {
        console.log('[game-connection] WebSocket closed');
        setIsConnected(false);
        setCurrentHost(undefined);
        setCurrentPort(undefined);
        clearGmcpProbe();
        emitSocketClosed();
      };

      ws.onerror = (ev) => {
        console.error('[game-connection] websocket error', ev);
        setLastError('Connection error');
      };

      ws.onmessage = (ev) => {
        let msg: { type: string; data?: any };
        try {
          msg = JSON.parse(String(ev.data));
        } catch (err) {
          console.error('[game-connection] failed to parse message', err);
          return;
        }

        switch (msg.type) {
          case 'raw': {
            const text: string = msg.data ?? '';

            emitTerminalText(text);

            if (
              text.includes('When approaching a Red Dragon') ||
              text.includes('Reconnecting. Type replay') ||
              text.includes('DSL Loves You')
            ) {
              console.log('[game-connection] RAW candidate for GMCP trigger:', JSON.stringify(text));
            }

            const matchedPattern = GMCP_TRIGGER_PATTERNS.find((pattern) => text.includes(pattern));

            if (matchedPattern) {
              console.log(
                '[game-connection] GMCP trigger text detected; (re)starting GMCP watch window via pattern:',
                matchedPattern,
              );
              scheduleGmcpCheck();
            }

            break;
          }

          case 'gmcp': {
            if (gmcpProbeTimerRef.current) {
              clearTimeout(gmcpProbeTimerRef.current);
              gmcpProbeTimerRef.current = null;

              emitTerminalText('\x1b[38;5;67mGMCP is enabled\x1b[0m\r\n');
              console.log('[game-connection] GMCP received within probe window → GMCP is enabled');
            } else {
              console.log('[game-connection] GMCP received (no active probe timer)');
            }

            console.log('[gmcp raw msg.data]', msg.data);

            try {
              const raw: string = msg.data ?? '';
              const trimmed = raw.trim();
              const firstSpace = trimmed.indexOf(' ');
              if (firstSpace > 0) {
                const packageName = trimmed.slice(0, firstSpace);
                const jsonPart = trimmed.slice(firstSpace + 1).trim();

                console.log('[gmcp parsed]', {
                  packageName,
                  jsonPart: jsonPart.slice(0, 80) + '...',
                });

                if (jsonPart.startsWith('{')) {
                  const payload = JSON.parse(jsonPart);

                  switch (packageName) {
                    case 'char_data': {
                      console.log('[gmcp char_data payload]', payload);

                      // Existing: desktop / other listeners
                      window.dispatchEvent(new CustomEvent('game:char-data', { detail: payload }));
                      window.dispatchEvent(
                        new CustomEvent('game:gmcp-vitals', {
                          detail: {
                            hp: payload.hp,
                            hpMax: payload.max_hp ?? payload.hpMax,
                            mp: payload.mana ?? payload.mp,
                            mpMax: payload.max_mana ?? payload.mpMax,
                            stamina: payload.move ?? payload.mv ?? payload.stamina,
                            staminaMax: payload.max_move ?? payload.mvMax ?? payload.staminaMax,
                          },
                        }),
                      );

                      break;
                    }

                    case 'room_data': {
                      console.log('[gmcp room_data payload]', payload);

                      window.dispatchEvent(
                        new CustomEvent('game:room-data', {
                          detail: payload,
                        }),
                      );

                      console.log('[gmcp] dispatched game:room-data');
                      break;
                    }

                    case 'tick': {
                      console.log('[gmcp tick payload]', payload);
                      window.dispatchEvent(new CustomEvent('game:tick', { detail: payload }));
                      break;
                    }

                    case 'affects': {
                      console.log('[gmcp] affect_data payload parsed', payload);

                      const affects = Array.isArray(payload?.affects) ? payload.affects : [];

                      window.dispatchEvent(
                        new CustomEvent('game:affects-trueup', {
                          detail: { affects },
                        }),
                      );

                      console.log('[gmcp] dispatched game:affects-trueup', affects.length);
                      break;
                    }

                    case 'add_affect': {
                      const affect = payload as any;

                      if (affect?.n) {
                        window.dispatchEvent(
                          new CustomEvent('game:affect-added', {
                            detail: affect,
                          }),
                        );
                      }

                      break;
                    }

                    case 'remove_affect':
                      window.dispatchEvent(new CustomEvent('game:affect-removed', { detail: payload }));
                      break;

                    // add room_data / affect_data later if needed
                  }
                }
              }
            } catch (err) {
              console.error('[game-connection] failed to parse GMCP package', err);
            }

            try {
              window.dispatchEvent(
                new CustomEvent('game:gmcp', {
                  detail: msg.data,
                }),
              );
            } catch {
              // ignore
            }
            break;
          }

          case 'error': {
            setLastError(msg.data || 'Server error');
            break;
          }

          case 'close': {
            cleanupSocket();
            break;
          }

          default:
            console.warn('[game-connection] unknown message type', msg.type);
        }
      };
    },
    [cleanupSocket, emitSocketClosed, emitSocketOpen, emitTerminalText, scheduleGmcpCheck],
  );

  const sendRaw = useCallback(
    (data: string) => {
      sendTelnetData(data);
    },
    [sendTelnetData],
  );

  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    const handler = (ev: Event) => {
      const ce = ev as CustomEvent<any>;
      const cmdRaw = ce.detail?.cmd;

      // Only bail if truly missing; allow empty string
      if (cmdRaw === undefined || cmdRaw === null) return;

      const cmd = String(cmdRaw);

      // Echo to terminal (preserve exactly what was sent)
      emitTerminalText(`\x1b[38;5;244m> ${cmd}\x1b[0m\r\n`);

      // Actually send to the game (sendTelnetData already checks OPEN)
      sendTelnetData(cmd);
    };

    try {
      window.addEventListener('game:send-command', handler as EventListener);
    } catch {
      // ignore (SSR / no window)
    }

    return () => {
      try {
        window.removeEventListener('game:send-command', handler as EventListener);
      } catch {
        // ignore
      }
    };
  }, [emitTerminalText, sendTelnetData]);

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
