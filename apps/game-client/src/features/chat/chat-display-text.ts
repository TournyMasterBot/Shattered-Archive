// apps/game-client/src/features/chat/chat-display-text.ts
//
// Display-side cleanup of a raw chat line. The raw line itself is never changed: the audio "beep on bell"
// feature (features/audio/audio-beep.ts) and the chat classifiers read the BEL character from it.

// An OSC sequence (ESC ] ... ) ends with BEL or with ST (ESC \). It goes first, whole, because BEL is also its
// terminator: removing BEL alone would leave a half sequence that the HTML converter prints as garbage.
const OSC_RE = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
const BEL_RE = /\u0007/g;
// Colour (SGR) and other CSI sequences, the same shape the chat classifier strips.
const CSI_RE = /\u001b\[[0-9;]*[A-Za-z]/g;
const YOU_RE = /^\s*You\b/;

/**
 * The text a chat bubble should show: complete OSC sequences removed first, then every remaining BEL.
 * Colour codes are left alone so the converter still colours the text. A line with neither is returned as is.
 * An OSC sequence with no terminator is left alone (there is nothing to tell where it ends).
 */
export function stripChatDisplayText(raw: string): string {
  if (raw.indexOf('\u0007') === -1 && raw.indexOf('\u001b]') === -1) return raw;
  return raw.replace(OSC_RE, '').replace(BEL_RE, '');
}

/**
 * True for a line the player said or sent themselves ("You tell ...", "You gossip ..."). The chat classifier
 * files these into the same pane as incoming lines; an unread indicator must not count them as new messages.
 */
export function isOwnChatLine(raw: string): boolean {
  return YOU_RE.test(stripChatDisplayText(raw).replace(CSI_RE, ''));
}
