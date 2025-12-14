// apps/game-client/src/features/chat/chat-probe.ts
export type ChatProbeMatch =
  | { isChat: false }
  | {
      isChat: true;

      // indices are within the line range [start, end)
      quoteChar: number;

      // speaker is best-effort (first token before verb phrase)
      speakerStart: number;
      speakerEnd: number;

      // verb phrase is best-effort (between speaker and message quote)
      verbStart: number;
      verbEnd: number;

      // quoted message
      messageStart: number;
      messageEnd: number;
    };

function isSpaceCode(c: number): boolean {
  return c === 32 /* space */ || c === 9 /* tab */;
}

function isAlphaCode(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

function isQuoteCode(c: number): boolean {
  return c === 34 /* " */ || c === 39 /* ' */;
}

function isBoundaryCode(c: number): boolean {
  // 0 => start/end sentinel
  if (c === 0) return true;
  if (isSpaceCode(c)) return true;

  // common “word boundary” punctuation seen around chat quotes
  switch (c) {
    case 33: // !
    case 34: // "
    case 39: // '
    case 41: // )
    case 44: // ,
    case 46: // .
    case 58: // :
    case 59: // ;
    case 63: // ?
    case 93: // ]
    case 125: // }
      return true;
    default:
      return false;
  }
}

/**
 * Skip ANSI CSI sequences like: ESC [ ... m
 * Returns next index to continue scanning from (already past the terminator) or i if not ANSI.
 */
function skipAnsiCSI(buf: string, i: number, end: number): number {
  // ESC [
  if (buf.charCodeAt(i) !== 27 /* ESC */) return i;
  if (i + 1 >= end) return i;
  if (buf.charCodeAt(i + 1) !== 91 /* [ */) return i;

  // Consume until we hit a CSI terminator byte (0x40..0x7E)
  let j = i + 2;
  while (j < end) {
    const c = buf.charCodeAt(j);
    if (c >= 64 && c <= 126) return j + 1;
    j++;
  }
  return end;
}

function prevSigCharCode(buf: string, start: number, i: number): number {
  let j = i - 1;
  while (j >= start) {
    const c = buf.charCodeAt(j);

    // Best-effort backwards ANSI skip for typical CSI ... m
    if (c === 109 /* m */) {
      let k = j - 1;
      let found = false;
      for (let steps = 0; steps < 16 && k >= start; steps++, k--) {
        if (buf.charCodeAt(k) === 91 /* [ */ && k - 1 >= start && buf.charCodeAt(k - 1) === 27 /* ESC */) {
          j = k - 2;
          found = true;
          break;
        }
      }
      if (found) continue;
    }

    return c;
  }
  return 0;
}

function nextSigCharCode(buf: string, end: number, i: number): number {
  let j = i + 1;
  while (j < end) {
    const c = buf.charCodeAt(j);
    if (c === 27 /* ESC */) {
      const next = skipAnsiCSI(buf, j, end);
      if (next === j) return c;
      j = next;
      continue;
    }
    return c;
  }
  return 0;
}

function isClearlyNotChatPrefix(buf: string, start: number, end: number): boolean {
  // skip leading whitespace + ANSI
  let i = start;
  while (i < end) {
    const c = buf.charCodeAt(i);
    if (c === 27 /* ESC */) {
      const next = skipAnsiCSI(buf, i, end);
      if (next !== i) {
        i = next;
        continue;
      }
    }
    if (!isSpaceCode(c)) break;
    i++;
  }

  // fast reject for common non-chat stat blocks
  if (i + 5 < end) {
    // [Str: ...
    if (buf.charCodeAt(i) === 91 /* [ */ && buf.charCodeAt(i + 1) === 83 /* S */) return true;
  }

  return false;
}

/**
 * Finds an opening quote that looks like a message quote:
 * - quote must be ' or "
 * - NOT an apostrophe inside a word (alpha ' alpha)
 * - opening quote must be preceded by a boundary (space/punct/start)
 * - closing quote must be followed by a boundary (space/punct/end)
 * - must have a matching close quote later
 */
function findMessageOpenQuote(buf: string, start: number, end: number): { open: number; close: number; q: number } | null {
  for (let i = start; i < end; i++) {
    const c = buf.charCodeAt(i);

    if (c === 27 /* ESC */) {
      const next = skipAnsiCSI(buf, i, end);
      if (next !== i) {
        i = next - 1;
        continue;
      }
    }

    if (!isQuoteCode(c)) continue;

    // Reject apostrophes inside words: Brah'men's
    const prev = prevSigCharCode(buf, start, i);
    const next = nextSigCharCode(buf, end, i);
    if (isAlphaCode(prev) && isAlphaCode(next)) continue;

    // Opening quote must be preceded by a boundary
    if (!isBoundaryCode(prev)) continue;

    // Find a matching close quote, and require boundary after it
    for (let j = i + 1; j < end; j++) {
      const cj = buf.charCodeAt(j);

      if (cj === 27 /* ESC */) {
        const nextJ = skipAnsiCSI(buf, j, end);
        if (nextJ !== j) {
          j = nextJ - 1;
          continue;
        }
      }

      if (cj !== c) continue;

      const after = nextSigCharCode(buf, end, j);
      if (!isBoundaryCode(after)) continue;

      return { open: i, close: j, q: c };
    }
  }

  return null;
}

/**
 * Stage 1: cheap "maybe chat" gate.
 */
export function maybeChatFastRange(buf: string, start: number, end: number): boolean {
  if (end - start < 8) return false;
  if (isClearlyNotChatPrefix(buf, start, end)) return false;
  return !!findMessageOpenQuote(buf, start, end);
}

/**
 * Stage 2: parse with indices; no substring allocations here.
 */
export function probeChatRange(buf: string, start: number, end: number): ChatProbeMatch {
  const openInfo = findMessageOpenQuote(buf, start, end);
  if (!openInfo) return { isChat: false };

  const open = openInfo.open;
  const close = openInfo.close;
  const quoteChar = openInfo.q;

  // message inside quotes, trimmed of leading/trailing spaces
  let messageStart = open + 1;
  let messageEnd = close;

  while (messageStart < messageEnd) {
    const c = buf.charCodeAt(messageStart);
    if (c === 27 /* ESC */) {
      const next = skipAnsiCSI(buf, messageStart, end);
      if (next !== messageStart) {
        messageStart = next;
        continue;
      }
    }
    if (!isSpaceCode(c)) break;
    messageStart++;
  }

  while (messageEnd > messageStart && isSpaceCode(buf.charCodeAt(messageEnd - 1))) messageEnd--;

  if (messageEnd <= messageStart) return { isChat: false };

  // Ensure at least one alpha in the message (cheap sanity)
  let msgHasAlpha = false;
  for (let i = messageStart; i < messageEnd; i++) {
    const c = buf.charCodeAt(i);
    if (c === 27 /* ESC */) {
      const next = skipAnsiCSI(buf, i, messageEnd);
      if (next !== i) {
        i = next - 1;
        continue;
      }
    }
    if (isAlphaCode(c)) {
      msgHasAlpha = true;
      break;
    }
  }
  if (!msgHasAlpha) return { isChat: false };

  // Speaker token: first non-space, non-ANSI chunk up to whitespace
  let speakerStart = start;
  while (speakerStart < end) {
    const c = buf.charCodeAt(speakerStart);
    if (c === 27 /* ESC */) {
      const next = skipAnsiCSI(buf, speakerStart, end);
      if (next !== speakerStart) {
        speakerStart = next;
        continue;
      }
    }
    if (!isSpaceCode(c)) break;
    speakerStart++;
  }

  let speakerEnd = speakerStart;
  while (speakerEnd < end) {
    const c = buf.charCodeAt(speakerEnd);
    if (c === 27 /* ESC */) {
      const next = skipAnsiCSI(buf, speakerEnd, end);
      if (next !== speakerEnd) {
        speakerEnd = next;
        continue;
      }
    }
    if (isSpaceCode(c)) break;
    speakerEnd++;
  }
  if (speakerEnd <= speakerStart) return { isChat: false };

  // verb phrase is between speakerEnd..open (trimmed) (best-effort only; NOT required)
  let verbStart = speakerEnd;
  while (verbStart < open) {
    const c = buf.charCodeAt(verbStart);
    if (c === 27 /* ESC */) {
      const next = skipAnsiCSI(buf, verbStart, open);
      if (next !== verbStart) {
        verbStart = next;
        continue;
      }
    }
    if (!isSpaceCode(c)) break;
    verbStart++;
  }

  let verbEnd = open;
  while (verbEnd > verbStart && isSpaceCode(buf.charCodeAt(verbEnd - 1))) verbEnd--;

  return {
    isChat: true,
    quoteChar,
    speakerStart: speakerStart - start,
    speakerEnd: speakerEnd - start,
    verbStart: verbStart - start,
    verbEnd: verbEnd - start,
    messageStart: messageStart - start,
    messageEnd: messageEnd - start,
  };
}
