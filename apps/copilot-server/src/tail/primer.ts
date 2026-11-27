import { parseLogLine } from '@shatteredarchive/copilot-core';

/** Cheap pre-filters: a line is only parsed when it contains one of these, so a backward scan over megabytes of game text stays fast. */
const CANDIDATES = ['"game:remote-server:connect"', '"game:server:connection:client-closed"', 'login_data', 'room_data', 'char_data'];
/** The game-server's own start-up record: a connection that began before it cannot have survived it. */
const SERVER_START = '"[game-server] Listening on port"';

/**
 * Finds, scanning a log NEWEST line first, what was already true when Copilot was switched on: is a connection open, which character
 * is logged in, and where it stands (room, vitals). Only those records are kept; no game text and no command is ever picked.
 *
 * `offer` the lines newest to oldest until `done`. `lines()` then gives the kept records oldest first, ready for the pipeline.
 */
export class SessionScan {
  private session?: string;
  private closed = false;
  private login?: string;
  private room?: string;
  private char?: string;
  private finished = false;

  get done(): boolean {
    return this.finished;
  }

  offer(line: string): void {
    if (this.finished) return;
    if (line.includes(SERVER_START)) {
      this.finished = true; // the server restarted after anything older: no earlier connection is still open
      return;
    }
    if (!CANDIDATES.some((marker) => line.includes(marker))) return;
    const event = parseLogLine(line);
    if (event === null) return;
    switch (event.kind) {
      case 'connect':
      case 'closed':
        this.session = line;
        this.closed = event.kind === 'closed';
        this.finished = true;
        break;
      // the first of each kind met going backwards is the latest one, and it is after the session record found last
      case 'login':
        this.login ??= line;
        break;
      case 'room':
        this.room ??= line;
        break;
      case 'char':
        this.char ??= line;
        break;
      default:
        break;
    }
  }

  /** Nothing when no connection record was reached; just the close when the newest session record is one; else connect, login, room, vitals. */
  lines(): string[] {
    if (this.session === undefined) return [];
    if (this.closed) return [this.session];
    return [this.session, this.login, this.room, this.char].filter((line): line is string => line !== undefined);
  }
}
