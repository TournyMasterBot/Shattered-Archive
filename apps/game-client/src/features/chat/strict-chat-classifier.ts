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

export function classifyStrictChatSubtype(rawLine: string): ChatSubtype | undefined {
  const s = normalizeLine(rawLine);

  // TEMP DEBUG (remove after you verify it matches)
  console.log('[chat strict] normalized=', JSON.stringify(s));

  // IMPORTANT: Don’t use the legacy outer gate as a hard requirement.
  // It’s too easy to miss valid lines with color codes/newlines/formatting variations.
  // Instead, rely on the actual subtype checks.

  // SAY
  if (textContainsString(s, " says '")) return 'say';
  if (textContainsString(s, ' says (to ')) return 'say';
  if (textContainsString(s, "You say '")) return 'say';
  if (textContainsString(s, 'You say (')) return 'say';
  if (textContainsString(s, ' says in ')) return 'say';

  // GTELL
  if (textContainsString(s, ' tells the group ')) return 'gtell';
  if (textContainsString(s, 'You tell the group ')) return 'gtell';

  // TELL
  if (textContainsString(s, ' tells you ')) return 'tell';
  if (textContainsString(s, 'You tell ')) return 'tell';

  // YELL
  if (textContainsString(s, ' yells ')) return 'yell';
  if (textContainsString(s, 'You yell ')) return 'yell';

  // GOSSIP
  if (textContainsString(s, ' gossips ')) return 'gossip';
  if (s.startsWith("You gossip '")) return 'gossip';

  // CLAN GOSSIP
  if (textContainsString(s, ' clan gossips ')) return 'cgossip';
  if (s.startsWith("You clan gossip '")) return 'cgossip';

  // KINGDOM / OOC KINGDOM
  if (textContainsString(s, ' OOC Kingdom: ')) return 'oking';
  if (textContainsString(s, ' Kingdom: ')) return 'king';

  // OOC CLAN / CLAN
  if (textContainsString(s, ' OOC Clan: ')) return 'oclan';
  if (s.startsWith("You OOC clan: '")) return 'oclan';

  if (textContainsString(s, ' clans ')) return 'clan';
  if (s.startsWith("You clan '")) return 'clan';

  // OOC
  if (textContainsString(s, ' OOC: ')) return 'ooc';

  // ASK / ANSWER
  if (textContainsString(s, ' ask ')) return 'askanswer';
  if (textContainsString(s, ' answers ')) return 'askanswer';
  if (s.startsWith("You answer '")) return 'askanswer';

  // WHISPER
  if (textContainsString(s, ' whispers ')) return 'whisper';
  if (textContainsString(s, 'You whisper ')) return 'whisper';

  // RADIO
  if (textContainsString(s, ' radios ')) return 'radio';

  // NEWBIE
  if (textContainsString(s, ' [Newbie]: ')) return 'newbie';

  // QUEST
  if (s.startsWith("You quest '")) return 'quest';
  if (textContainsString(s, ' quests ')) return 'quest';

  // BLOODBATH
  if (s.startsWith('You Bloodbath: ')) return 'bb';
  if (textContainsString(s, ' Bloodbath: ')) return 'bb';

  // AUCTION
  if (textContainsString(s, ' auctions: ')) return 'auction';
  if (s.startsWith('You auction: ')) return 'auction';

  // GRATS
  if (s.startsWith("You grats '")) return 'grats';
  if (textContainsString(s, ' grats ')) return 'grats';

  // COMMUNITY
  if (s.startsWith('(Shalonesti) ') || s.startsWith('(Thaxanos) ')) return 'community';

  return undefined;
}
