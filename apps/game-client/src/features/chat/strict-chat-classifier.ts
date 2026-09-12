// apps/game-client/src/features/chat/strict-chat-classifier.ts
import type { ChatSubtype } from './chat-settings-store';

// Strip common ANSI CSI codes (…m) + a couple of other escape patterns.
// Keeps it conservative but more robust than only /m sequences.
const ansiRe = /\u001b\[[0-9;]*[A-Za-z]/g;

function normalizeLine(rawLine: string): string {
  return rawLine
    .replace(/\x07/g, '') // bell
    .replace(ansiRe, '') // ANSI
    .replace(/\r?\n/g, '') // newline(s)
    .trimEnd();
}

function textContainsString(haystack: string, needle: string) {
  return haystack.includes(needle);
}

// Every channel line is "<speaker> <verb phrase> '<message>'" — the channel
// tag always lives in the verb phrase before the opening quote. Matching
// against the whole line let a keyword *inside* someone's quoted message
// misclassify it (an OOC message mentioning "clans" got sorted as Clan
// because ' clans ' matched the message body, not a channel tag). Restrict
// matching to the envelope up to and including the opening quote; lines with
// no quote at all (some tag formats don't use one) fall back to the full line.

// The opening quote of the spoken message is the first apostrophe that is NOT
// inside a word — i.e. not a name apostrophe (Qym'ten, Ri'gon Del'nichi,
// Z'resra — extremely common here) or a contraction (don't, y'all) — and that
// sits on a boundary. Using indexOf("'") split "Qym'ten says 'hi'" at the name
// (envelope === "Qym'") so every channel line from an apostrophe-named speaker
// went unclassified and, in strict mode, was dropped. Mirrors chat-probe's
// findMessageOpenQuote.
function messageQuoteIndex(s: string): number {
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "'") continue;
    const prev = s.charAt(i - 1);
    const next = s.charAt(i + 1);
    if (/[A-Za-z0-9]/.test(prev) && /[A-Za-z0-9]/.test(next)) continue; // inside a word
    if (i > 0 && !/[\s(]/.test(prev)) continue; // not on a boundary
    return i;
  }
  return s.indexOf("'"); // fallback: legacy behaviour
}

function envelope(s: string): string {
  const q = messageQuoteIndex(s);
  return q === -1 ? s : s.slice(0, q + 1);
}

export function classifyStrictChatSubtype(rawLine: string): ChatSubtype | undefined {
  const s = envelope(normalizeLine(rawLine));

  // TEMP DEBUG (remove after you verify it matches)
  // Debug: console.log('[chat strict] normalized=', JSON.stringify(s));

  // IMPORTANT: Don’t use the legacy outer gate as a hard requirement.
  // It’s too easy to miss valid lines with color codes/newlines/formatting variations.
  // Instead, rely on the actual subtype checks.

  // SAY — "say"/"says" accepts ANY text between the verb and the opening
  // quote: a voice-type modifier ("softly", "in a low toned manner", "in a
  // evil voice", …), a "(to Name)" / "(Language)" tag, or any combination of
  // them (all 21 DSL voice types). Match the whole verb phrase rather than
  // enumerating each phrasing — see @reference-data/CapturedPatterns_Reference.txt
  // ("Note on voice-type modifiers"). Both patterns are anchored to the start
  // and bounded by the envelope's opening quote so a quoted message that
  // itself contains "says" can't trip them. `.` not `[^']` — the speaker's
  // name may contain an apostrophe (Ri'gon Del'nichi says '…').
  if (/^\s*You say\b.*'$/.test(s)) return 'say';
  if (/^.+ says\b.*'$/.test(s)) return 'say';

  // GTELL
  if (textContainsString(s, ' tells the group ')) return 'gtell';
  if (textContainsString(s, 'You tell the group ')) return 'gtell';

  // TELL
  if (textContainsString(s, ' tells you ')) return 'tell';
  if (textContainsString(s, 'You tell ')) return 'tell';

  // YELL
  if (textContainsString(s, ' yells ')) return 'yell';
  if (textContainsString(s, 'You yell ')) return 'yell';

  // CLAN GOSSIP — must precede GOSSIP: " gossips " is a substring of
  // "clan gossips ", so the plain-gossip check would otherwise claim it.
  if (textContainsString(s, ' clan gossips ')) return 'cgossip';
  if (s.startsWith("You clan gossip '")) return 'cgossip';

  // GOSSIP
  if (textContainsString(s, ' gossips ')) return 'gossip';
  if (s.startsWith("You gossip '")) return 'gossip';

  // KINGDOM / OOC KINGDOM — the speaker prefix is optional on this channel
  // (the reference form is "(?:<name> )?(?:OOC )?Kingdom: '…'"), so also accept
  // a bare "Kingdom: '…'" at the start of the line.
  if (textContainsString(s, ' OOC Kingdom: ') || s.startsWith('OOC Kingdom: ')) return 'oking';
  if (textContainsString(s, ' Kingdom: ') || s.startsWith('Kingdom: ')) return 'king';

  // OOC CLAN / CLAN
  if (textContainsString(s, ' OOC Clan: ')) return 'oclan';
  if (s.startsWith("You OOC clan: '")) return 'oclan';

  if (textContainsString(s, ' clans ')) return 'clan';
  if (s.startsWith("You clan '")) return 'clan';

  // OOC
  if (textContainsString(s, ' OOC: ')) return 'ooc';

  // ASK / ANSWER — plain form is the player channel; the colon form
  // ("(Imm) Name answers: '…'", "(An Imm) answers: '…'", "(Imm) Name ask: '…'")
  // is the immortal channel, routed here too.
  if (textContainsString(s, ' ask ')) return 'askanswer';
  if (textContainsString(s, ' answers ')) return 'askanswer';
  if (textContainsString(s, ' answers: ')) return 'askanswer';
  if (textContainsString(s, ' ask: ')) return 'askanswer';
  if (s.startsWith("You answer '")) return 'askanswer';

  // WHISPER
  if (textContainsString(s, ' whispers ')) return 'whisper';
  if (textContainsString(s, 'You whisper ')) return 'whisper';

  // PRAY
  if (textContainsString(s, " prays '")) return 'pray';
  if (s.startsWith("You pray '")) return 'pray';

  // RADIO
  if (textContainsString(s, ' radios ')) return 'radio';
  if (s.startsWith("You radio '")) return 'radio';

  // NEWBIE
  if (textContainsString(s, ' [Newbie]: ')) return 'newbie';

  // QUEST
  if (s.startsWith("You quest '")) return 'quest';
  if (textContainsString(s, ' quests ')) return 'quest';

  // BLOODBATH — player channel ("<name> Bloodbath: '…'") plus the automated
  // "Bloodbath System: '…'" announcer (bloodbath starts, entry timers, winners).
  if (s.startsWith('You Bloodbath: ')) return 'bb';
  if (s.startsWith('Bloodbath System: ')) return 'bb';
  if (textContainsString(s, ' Bloodbath: ')) return 'bb';

  // AUCTION
  if (textContainsString(s, ' auctions: ')) return 'auction';
  if (s.startsWith('You auction: ')) return 'auction';

  // GRATS — plain form is the player channel; " grats: " is the immortal form
  // ("(Imm) Name grats: '…'").
  if (s.startsWith("You grats '")) return 'grats';
  if (textContainsString(s, ' grats ')) return 'grats';
  if (textContainsString(s, ' grats: ')) return 'grats';

  // COMMUNITY
  if (s.startsWith('(Shalonesti) ') || s.startsWith('(Thaxanos) ')) return 'community';

  return undefined;
}
