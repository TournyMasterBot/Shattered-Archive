// apps/game-client/src/hooks/useGameConnection.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { probeChatRange } from '../features/chat/chat-probe';
import { appendChatRaw } from '../features/chat/chat-store';

export interface UseGameConnectionResult {
  isConnected: boolean;
  currentHost?: string;
  currentPort?: number;
  lastError?: string | null;

  connect: (host: string, port: number, options?: { autoEnableGmcp?: boolean }) => void;
  disconnect: () => void;
  sendRaw: (data: string) => void;
}

const GMCP_TRIGGER_PATTERNS: string[] = [
  'Welcome to DSL! DSL Loves You! Other muds think you are ugly, they said so!',
  'When approaching a Red Dragon, be sure to bring your wand of marshmallow.',
  'Reconnecting. Type replay to see missed tells.',
];

function dispatchSafe(name: string, detail?: any) {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    // ignore (SSR / no window)
  }
}

export function useGameConnection(): UseGameConnectionResult {
  const [isConnected, setIsConnected] = useState(false);
  const [currentHost, setCurrentHost] = useState<string | undefined>();
  const [currentPort, setCurrentPort] = useState<number | undefined>();
  const [lastError, setLastError] = useState<string | null>(null);
  const lastMoveAttemptRef = useRef<{ ts: number; cmd: string; dir?: string } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  // Track last connected host/port so we can include them in events
  const lastHostRef = useRef<string | undefined>(undefined);
  const lastPortRef = useRef<number | undefined>(undefined);

  // GMCP auto-enable state
  const gmcpProbeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gmcpAutoEnableRef = useRef(true);

  useEffect(() => {
    const onAttempt = (ev: Event) => {
      const ce = ev as CustomEvent<any>;
      const cmdRaw = ce.detail?.cmd;
      if (cmdRaw === undefined || cmdRaw === null) return;
      const cmd = String(cmdRaw);
      lastMoveAttemptRef.current = { ts: Date.now(), cmd, dir: ce.detail?.dir };
    };

    window.addEventListener('game:movement-attempt', onAttempt as EventListener);
    return () => window.removeEventListener('game:movement-attempt', onAttempt as EventListener);
  }, []);

  const clearGmcpProbe = () => {
    if (gmcpProbeTimerRef.current) {
      clearTimeout(gmcpProbeTimerRef.current);
      gmcpProbeTimerRef.current = null;
      console.log('[game-connection] GMCP probe timer cleared');
    }
  };

  const emitTerminalText = useCallback((text: string) => {
    dispatchSafe('game:terminal-data', { text });
  }, []);

  const sendTelnetData = useCallback((data: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'data', data }));
  }, []);

  const emitSocketClosed = useCallback(() => {
    dispatchSafe('game:socket-closed');
  }, []);

  const emitSocketOpen = useCallback(() => {
    dispatchSafe('game:socket-open');
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

    emitSocketClosed();
  }, [emitSocketClosed]);

  const disconnect = useCallback(() => {
    cleanupSocket();
  }, [cleanupSocket]);

  const scheduleGmcpCheck = useCallback(() => {
    if (!gmcpAutoEnableRef.current) {
      console.log('[game-connection] GMCP auto-enable is disabled; not scheduling probe');
      return;
    }

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

        dispatchSafe('game:gmcp-auto-enable', {
          host: lastHostRef.current,
          port: lastPortRef.current,
        });
      },
      5 * 60 * 1000,
    );

    emitTerminalText('\x1b[38;5;67m[game-connection] GMCP probe timer created (5 minutes)\x1b[0m\r\n');
  }, [emitTerminalText, sendTelnetData]);

  /**
   * Scan a raw chunk without splitting into arrays.
   * Note: we still slice per-line for plugin routing + chat payload.
   */
  const processRawChunk = useCallback(
    (text: string) => {
      // 0) emit raw chunk (you asked for raw text from raw event)
      dispatchSafe('game:telnet-raw-chunk', { text });

      const last = lastMoveAttemptRef.current;
      if (last && Date.now() - last.ts < 1500) {
        if (
          text.includes("You can't go that way") ||
          text.includes('Alas, you cannot go that way') ||
          text.includes('You cannot go that way') ||
          text.includes('No exit that way')
        ) {
          dispatchSafe('game:movement-failed', {
            cmd: last.cmd,
            dir: last.dir,
            ts: Date.now(),
            reasonLine: text,
          });
          lastMoveAttemptRef.current = null;
        }
      }

      // 1) existing behavior: terminal display
      emitTerminalText(text);

      // 2) GMCP trigger check (cheap)
      const matchedPattern = GMCP_TRIGGER_PATTERNS.find((pattern) => text.includes(pattern));
      if (matchedPattern) {
        console.log(
          '[game-connection] GMCP trigger text detected; (re)starting GMCP watch window via pattern:',
          matchedPattern,
        );
        scheduleGmcpCheck();
      }

      // 3) scan for lines [start,end)
      let start = 0;
      const len = text.length;

      for (let i = 0; i <= len; i++) {
        const c = i < len ? text.charCodeAt(i) : 10; // sentinel newline

        if (c === 10 /* \n */ || i === len) {
          // end points at '\n' (or len). Include '\n' in rawLine when present.
          const rawEnd = i < len ? i + 1 : i;

          let end = i;
          if (end > start && text.charCodeAt(end - 1) === 13 /* \r */) end--;

          if (end > start) {
            // string allocation (needed for consumers + store)
            const lineText = text.slice(start, end);

            // raw line *as received* (includes CRLF/LF if present)
            const rawLine = text.slice(start, rawEnd);

            // plugins / other consumers
            dispatchSafe('game:telnet-raw-line', {
              text: lineText,
              rawLine,
            });

            // chat detection (no substr allocs inside probe)
            const match = probeChatRange(text, start, end);
            if (match.isChat) {
              // capture even if ChatPane isn't mounted
              appendChatRaw(lineText);

              dispatchSafe('game:chat-line', {
                text: lineText,
                rawLine,
                rawChunk: text,

                speakerStart: match.speakerStart,
                speakerEnd: match.speakerEnd,
                verbStart: match.verbStart,
                verbEnd: match.verbEnd,
                messageStart: match.messageStart,
                messageEnd: match.messageEnd,
              });
            }
          }

          start = i + 1;
        }
      }
    },
    [emitTerminalText, scheduleGmcpCheck],
  );

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
        ws.send(JSON.stringify({ type: 'connect', host, port }));

        setIsConnected(true);
        setCurrentHost(host);
        setCurrentPort(port);

        lastHostRef.current = host;
        lastPortRef.current = port;

        console.log('[game-connection] WebSocket opened; waiting for GMCP trigger text');
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
            processRawChunk(text);
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

            try {
              const raw: string = msg.data ?? '';
              const trimmed = raw.trim();
              const firstSpace = trimmed.indexOf(' ');
              if (firstSpace > 0) {
                const packageName = trimmed.slice(0, firstSpace);
                const jsonPart = trimmed.slice(firstSpace + 1).trim();

                if (jsonPart.startsWith('{')) {
                  const payload = JSON.parse(jsonPart);

                  switch (packageName) {
                    case 'char_data': {
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
                      window.dispatchEvent(new CustomEvent('game:room-data', { detail: payload }));
                      const last = lastMoveAttemptRef.current;
                      if (last && Date.now() - last.ts < 5000) {
                        dispatchSafe('game:movement-succeeded', {
                          cmd: last.cmd,
                          dir: last.dir,
                          ts: Date.now(),
                          room: payload?.room,
                        });
                        lastMoveAttemptRef.current = null;
                      }
                      break;
                    }

                    case 'tick': {
                      window.dispatchEvent(new CustomEvent('game:tick', { detail: payload }));
                      break;
                    }

                    case 'affects': {
                      const affects = Array.isArray(payload?.affects) ? payload.affects : [];
                      window.dispatchEvent(new CustomEvent('game:affects-trueup', { detail: { affects } }));
                      break;
                    }

                    case 'add_affect': {
                      const affect = payload as any;
                      if (affect?.n) {
                        window.dispatchEvent(new CustomEvent('game:affect-added', { detail: affect }));
                      }
                      break;
                    }

                    case 'remove_affect': {
                      window.dispatchEvent(new CustomEvent('game:affect-removed', { detail: payload }));
                      break;
                    }
                  }
                }
              }
            } catch (err) {
              console.error('[game-connection] failed to parse GMCP package', err);
            }

            dispatchSafe('game:gmcp', { raw: msg.data });
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
    [cleanupSocket, emitSocketClosed, emitSocketOpen, emitTerminalText, processRawChunk, scheduleGmcpCheck],
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

      if (cmdRaw === undefined || cmdRaw === null) return;

      const cmd = String(cmdRaw);

      emitTerminalText(`\x1b[38;5;244m> ${cmd}\x1b[0m\r\n`);
      sendTelnetData(cmd);
    };

    try {
      window.addEventListener('game:send-command', handler as EventListener);
    } catch {
      // ignore
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
