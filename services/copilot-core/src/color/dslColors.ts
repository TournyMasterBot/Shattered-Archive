/**
 * The DSL colour codes and the SGR parameters each one stands for.
 *
 * This table MIRRORS `DSL_ANSI_COLORS` in apps/game-client/src/features/chat/dsl-to-ansi.ts (the client renders DSL text
 * with it). A test in the game-client (`dsl-to-ansi.roundtrip.test.ts`) converts every client entry back and compares it
 * with these keys, so the two tables cannot drift apart.
 *
 * Values are the SGR parameter strings without `ESC[` and `m`.
 */
export const DSL_COLOR_SGR: Readonly<Record<string, string>> = {
  '{r': '31',
  '{R': '91',
  '{g': '32',
  '{G': '92',
  '{y': '33',
  '{Y': '93',
  '{b': '34',
  '{B': '94',
  '{m': '35',
  '{M': '95',
  '{c': '36',
  '{C': '96',
  '{D': '30',
  '{w': '37',
  '{W': '97',
  '{o': '38;5;208', // orange
  '{n': '38;5;130', // brown
  '{p': '38;5;213', // pink
  '{u': '38;5;141', // purple
};

/** Base colour letters in SGR order 0-7: black, red, green, yellow, blue, magenta, cyan, white. */
export const BASE_COLOR_LETTERS = ['D', 'r', 'g', 'y', 'b', 'm', 'c', 'w'] as const;

/** 256-colour palette numbers the DSL has a code for. */
export const EXTENDED_COLOR_CODES: Readonly<Record<number, string>> = {
  208: '{o',
  130: '{n',
  213: '{p',
  141: '{u',
};

/** Code used to clear colour (DSL has no auto-reset). */
export const DSL_RESET = '{x';
/** Reverse video. */
export const DSL_REVERSE = '{&';
