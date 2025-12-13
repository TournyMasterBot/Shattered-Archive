import net from 'net';
export interface TelnetClientProps {
  /** MUD host */
  host: string;
  /** MUD port */
  port: number;
  /** Rate to send messages */
  sendRate: number;
  /** When the server sends a prompt that does not have CR / LF */
  promptFlushDelayMs: number;
  /** Defines if telnet GA acts as a newline */
  treatGoAheadAsNewline: boolean;
  /** Flush lines when prompts are received */
  promptTimer?: NodeJS.Timeout;
  /** Injectable socket, mostly for unit testing */
  socket?: net.Socket;
}
export interface ITelnetClient {
  Config: TelnetClientProps;
  Connect(): void;
  Send(message: string): void;
  Disconnect(): void;
}
//# sourceMappingURL=telnet-client.d.ts.map
