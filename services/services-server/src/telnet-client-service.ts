import net from 'net';
import { EventEmitter } from 'events';
import { StringDecoder } from 'string_decoder';
import { ITelnetClient, TelnetClientProps } from '@shatteredarchive/types-server';

export class TelnetClient extends EventEmitter implements ITelnetClient {
  private config: TelnetClientProps;
  private gmcpBuffer: string[] = [];
  private blockBuffer: string[] = [];
  private sendThrottle: Promise<void> | null = null;
  private decoder = new StringDecoder('utf8');
  private textBuffer = '';

  /** Telnet command */
  private static readonly IAC = 0xff;
  /** Start sub-negotiation */
  private static readonly SB = 0xfa;
  /** End sub-negotiation */
  private static readonly SE = 0xf0;
  /** GMCP Telnet Code */
  private static readonly GMCP = 0xc9;
  /** Telnet Go-Ahead */
  private static readonly GO_AHEAD_CODE = 0xf9;

  // Telnet subnegotiation state (cross-chunk safe)
  private sawIAC = false; // previous byte was IAC
  private inSubneg = false; // inside any IAC SB ... IAC SE
  private subIsGMCP = false; // the current subneg is GMCP
  private subSawIAC = false; // inside subneg: last byte was IAC (to catch IAC SE and IAC IAC)

  constructor(props: TelnetClientProps) {
    super();
    props.socket = props.socket ?? new net.Socket();
    props.promptFlushDelayMs = props.promptFlushDelayMs ?? 120;
    props.treatGoAheadAsNewline = props.treatGoAheadAsNewline ?? true;
    this.config = props;
    this.attachBaseSocketHandlers();
  }

  public get Config() {
    return this.config;
  }

  public Connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.config.socket) {
        return;
      }
      const onConnect = () => {
        if (!this.config.socket) {
          return;
        }
        this.config.socket.off('error', onError);
        resolve();
      };

      const onError = (err: Error) => {
        if (!this.config.socket) {
          return;
        }
        this.config.socket.off('connect', onConnect);
        reject(err);
      };

      this.config.socket.once('connect', onConnect);
      this.config.socket.once('error', onError);
      this.config.socket.connect(this.config.port, this.config.host);
    });
  }

  public async Send(message: string): Promise<void> {
    if (!this.config.socket) {
      return;
    }
    if (this.sendThrottle) {
      await this.sendThrottle;
    }
    if (!this.config.socket.closed && !this.config.socket.connecting) {
      this.sendThrottle = new Promise((resolve) => {
        if (!this.config.socket) {
          return;
        }
        this.config.socket.write(`${message}\n`, () => {
          setTimeout(resolve, this.config.sendRate);
        });
      });
    }
  }

  public Disconnect(): void {
    if (this.config.promptTimer) {
      clearTimeout(this.config.promptTimer);
      this.config.promptTimer = undefined;
    }
    this.config.socket?.end();
    this.config.socket?.destroy();
    // eslint-disable-next-line no-console
    this.emit('disconnect');
  }

  private attachBaseSocketHandlers(): void {
    if (!this.config.socket) {
      return;
    }
    this.config.socket.on('data', (data: Buffer) => {
      this.processIncomingData(data);
    });

    this.config.socket.on('error', (err) => {
      this.emit('error', err);
    });

    this.config.socket.on('close', () => {
      // finish any partial utf-8 on close only
      const tail = this.decoder.end();
      if (tail) {
        this.textBuffer += tail;
        this.flushLine('\n');
      }
      this.emit('connectionClosed');
    });
  }

  private processIncomingData(data: Buffer): void {
    // Cancel any prior pending prompt flush; we'll reschedule at the end
    if (this.config.promptTimer) {
      clearTimeout(this.config.promptTimer);
      this.config.promptTimer = undefined;
    }

    for (let i = 0; i < data.length; i++) {
      const b = data[i];

      // ===== Inside subnegotiation (GMCP or other) =====
      if (this.inSubneg) {
        // Inside subneg we watch for IAC SE and IAC IAC
        if (this.subSawIAC) {
          this.subSawIAC = false;
          if (b === TelnetClient.SE) {
            // End of subnegotiation
            if (this.subIsGMCP) {
              const gmcpMessage = this.gmcpBuffer.join('');
              this.gmcpBuffer = [];
              this.emit('gmcpReceived', gmcpMessage);
            }
            this.inSubneg = false;
            this.subIsGMCP = false;
            continue;
          }
          if (b === TelnetClient.IAC) {
            // IAC IAC => literal 0xff inside subneg
            if (this.subIsGMCP) this.gmcpBuffer.push('\xFF');
            continue;
          }
          // Any other byte after IAC inside subneg: ignore (protocol noise)
          continue;
        }

        if (b === TelnetClient.IAC) {
          this.subSawIAC = true;
          continue;
        }

        if (this.subIsGMCP) {
          if (b !== 0) this.gmcpBuffer.push(String.fromCharCode(b));
        }
        // If subIsGMCP is false, we are in some other subneg; just consume bytes.
        continue;
      }

      // ===== Not inside subnegotiation =====
      if (this.sawIAC) {
        this.sawIAC = false;

        if (b === TelnetClient.SB) {
          // Start subnegotiation; next byte is option (may be in next chunk)
          this.inSubneg = true;
          this.subIsGMCP = false;
          this.subSawIAC = false;

          // Try to read the option code if it’s already in-buffer
          if (i + 1 < data.length) {
            const opt = data[++i];
            this.subIsGMCP = opt === TelnetClient.GMCP;
          } else {
            (this as any)._awaitingSubOption = true;
          }
          continue;
        }

        // Other command (WILL/WONT/DO/DONT, etc). Ignore for now.
        continue;
      }

      // If we began a subneg last byte but didn’t get the option yet (split across chunks),
      // treat the first non-IAC byte we see as the option now.
      if (this.inSubneg && (this as any)._awaitingSubOption) {
        delete (this as any)._awaitingSubOption;
        this.subIsGMCP = b === TelnetClient.GMCP;
        continue;
      }

      // IAC entering
      if (b === TelnetClient.IAC) {
        this.sawIAC = true;
        continue;
      }

      // ---- Normal text / control handling ----
      // GA as newline? (optional)
      if (b === TelnetClient.GO_AHEAD_CODE) {
        if (this.config.treatGoAheadAsNewline) {
          this.flushLine('\n');
        }
        // Even if not treating it as newline, don't put GA in text.
        continue;
      }

      // CRLF normalization
      if (b === 13 /* \r */) {
        if (i + 1 < data.length && data[i + 1] === 10 /* \n */) {
          i++;
          this.flushLine('\r\n');
        } else {
          // bare CR: ignore for line semantics (optional: emit to UI)
        }
        continue;
      }

      if (b === 10 /* \n */) {
        this.flushLine('\n');
        continue;
      }

      // regular byte -> text decoder
      this.textBuffer += this.decoder.write(Buffer.of(b));
    }

    // --- Idle/debounce flush for prompt-without-newline cases ---
    if (!this.inSubneg && this.textBuffer.length > 0) {
      this.config.promptTimer = setTimeout(() => {
        if (!this.inSubneg && this.textBuffer.length > 0) {
          this.flushLine('\n');
        }
      }, this.config.promptFlushDelayMs);
    }
  }

  private flushLine(newline: '\n' | '\r\n'): void {
    const line = this.textBuffer;
    this.textBuffer = '';

    // UI stream: echo the line + the exact newline sequence
    this.emit('dataReceived', line + newline);

    // Processor/persistence stream: CR-free logical line (no trailing newline)
    const clean = line.replace(/\r/g, '');
    this.emit('lineReceived', clean);

    // Optional: keep for future block logic
    this.blockBuffer.push(clean + '\n');
  }
}
