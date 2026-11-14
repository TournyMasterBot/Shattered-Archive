import type { Direction } from '@shatteredarchive/shattered-maps-core';

const WORDS: Readonly<Record<string, Direction>> = {
  n: 'N',
  north: 'N',
  ne: 'NE',
  northeast: 'NE',
  e: 'E',
  east: 'E',
  se: 'SE',
  southeast: 'SE',
  s: 'S',
  south: 'S',
  sw: 'SW',
  southwest: 'SW',
  w: 'W',
  west: 'W',
  nw: 'NW',
  northwest: 'NW',
  u: 'U',
  up: 'U',
  d: 'D',
  down: 'D',
};

/**
 * The exit a command takes, or undefined when the command is not a plain movement. Only the bare direction counts (`n`, `north`):
 * `flee`, `follow`, `enter portal` or `recall` may move the character too, but not along a named exit, so they never create a link.
 */
export function commandDirection(command: string): Direction | undefined {
  const word = command.trim().toLowerCase();
  return Object.hasOwn(WORDS, word) ? WORDS[word] : undefined;
}
