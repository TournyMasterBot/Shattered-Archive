import type { EstimateDeck } from './types.js';

/**
 * Deck parsing/validation. The organizer edits the deck as one comma-separated string
 * (exactly like the reference site's "Estimate Options" field), so parsing has to be
 * forgiving about whitespace and duplicates while still refusing to produce a deck the
 * UI cannot render.
 */

/** Modified-Fibonacci default, matching the reference site's stock deck. */
export const DEFAULT_DECK: EstimateDeck = ['?', '☕', '0', '0.5', '1', '2', '3', '5', '8', '13', '20', '40', '100'];

/** A card longer than this would blow out the card grid; the editor rejects it up front. */
export const MAX_CARD_LENGTH = 6;
export const MAX_DECK_SIZE = 20;

/**
 * Splits a comma-separated deck string into cards, trimming whitespace and dropping
 * blanks/duplicates (first occurrence wins, so display order is the author's order).
 */
export function parseDeck(raw: string): EstimateDeck {
  const seen = new Set<string>();
  const cards: string[] = [];
  for (const part of raw.split(',')) {
    const card = part.trim();
    if (!card || seen.has(card)) continue;
    seen.add(card);
    cards.push(card);
  }
  return cards;
}

/** Renders a deck back into the comma-separated form the settings editor shows. */
export function formatDeck(deck: EstimateDeck): string {
  return deck.join(',');
}

/**
 * Returns an error message if this deck can't be used, or undefined if it's fine.
 * Called by BOTH the settings dialog (before any network call) and the server
 * (which never trusts the client) — one rule set, one message.
 */
export function validateDeck(deck: EstimateDeck): string | undefined {
  if (deck.length < 2) return 'A deck needs at least 2 cards.';
  if (deck.length > MAX_DECK_SIZE) return `A deck can hold at most ${MAX_DECK_SIZE} cards.`;
  const tooLong = deck.find((c) => c.length > MAX_CARD_LENGTH);
  if (tooLong) return `Card "${tooLong}" is longer than ${MAX_CARD_LENGTH} characters.`;
  return undefined;
}

/**
 * The numeric value of a card, or null for a non-numeric one.
 *
 * '?' and '☕' are deliberately non-numeric: they mean "I can't estimate this" and
 * "I need a break", so averaging them in would quietly corrupt the number the team reads.
 */
export function cardValue(card: string): number | null {
  const n = Number(card);
  return Number.isFinite(n) ? n : null;
}
