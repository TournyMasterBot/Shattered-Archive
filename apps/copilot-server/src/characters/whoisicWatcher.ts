import { parseWhoisic, stripAnsi, type FeedEvent, type WhoisicRecord } from '@shatteredarchive/copilot-core';

/** The first line of a `whoisic` block. */
const HEADER = /^IC Information for .+\.\s*$/;
/**
 * The game's prompt line (`<1645/1645hp 1240/1240m 406/406mv 473558tnl> ...`) ends the block: the output is followed by the GMCP
 * records and then the prompt. A customised prompt that does not match still ends the block through the other three ways below.
 */
export const PROMPT_LINE = /^<\d+\/\d+hp\b/;
/** A block longer than this many lines is cut (a description is at most about 60 lines). */
export const MAX_BLOCK_LINES = 200;
/** An open block that has had no new line for this long (ms) is taken as finished. */
export const SETTLE_MS = 3000;

interface OpenBlock {
  lines: string[];
  /** Log time of the header: the block's own time, used to decide which description is newer. */
  at: number;
  /** Log time of the latest line added. */
  lastAt: number;
}

/**
 * Finds `whoisic` output in the feed and parses each finished block. A block starts at its "IC Information for X." line and ends at
 * the first of: the prompt line, any feed event that is not text (a room, vitals, command, login or session event), a second header,
 * MAX_BLOCK_LINES, or `settle()` after SETTLE_MS of silence. The open block is kept between calls, because a poll can cut a block in
 * two. The records carry the REAL name from the header: hand them to the registry at once.
 */
export class WhoisicWatcher {
  private open: OpenBlock | undefined;

  feed(events: readonly FeedEvent[]): WhoisicRecord[] {
    const done: WhoisicRecord[] = [];
    for (const event of events) {
      if (event.type !== 'lines') {
        this.close(done);
        continue;
      }
      for (const line of event.lines) this.line(line, event.at, done);
    }
    return done;
  }

  /** Close a block that has been quiet for SETTLE_MS (call when a poll ends, with the current time). */
  settle(now: number): WhoisicRecord[] {
    const done: WhoisicRecord[] = [];
    if (this.open !== undefined && now - this.open.lastAt >= SETTLE_MS) this.close(done);
    return done;
  }

  private line(line: string, at: number, done: WhoisicRecord[]): void {
    const visible = stripAnsi(line);
    if (HEADER.test(visible)) {
      this.close(done);
      this.open = { lines: [line], at, lastAt: at };
      return;
    }
    if (this.open === undefined) return;
    if (PROMPT_LINE.test(visible)) {
      this.close(done);
      return;
    }
    this.open.lines.push(line);
    this.open.lastAt = at;
    if (this.open.lines.length >= MAX_BLOCK_LINES) this.close(done);
  }

  private close(done: WhoisicRecord[]): void {
    const block = this.open;
    this.open = undefined;
    if (block === undefined) return;
    const record = parseWhoisic(block.lines, block.at);
    if (record !== null) done.push(record);
  }
}
