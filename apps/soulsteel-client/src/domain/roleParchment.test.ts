import { roleParchmentCommands, roleRevealText } from './roleParchment.js';
import { BUILTIN_ROLES } from './roleCatalog.js';
import type { RoleDef } from './types.js';

const umbraseer = BUILTIN_ROLES.find((r) => r.id === 'umbraseer')!;

describe('roleRevealText', () => {
  it('names the role and alignment, then reuses the existing description verbatim', () => {
    expect(roleRevealText(umbraseer)).toBe(
      'You are the Umbraseer. You are aligned with the Dark Knights. ' +
        'Once per night, sees beyond the veil to reveal whether a chosen player is an Assassin.',
    );
  });

  it('works for a custom/modifier role using its own alignment and description', () => {
    const minion: RoleDef = {
      id: 'cultist-minion',
      name: 'Cultist Minion',
      alignment: 'assassin',
      builtin: false,
      description: 'Knows who the Assassins are, but they do not know you.',
      countsTowardWinTally: false,
    };
    expect(roleRevealText(minion)).toBe(
      'You are the Cultist Minion. You are aligned with the Assassins. Knows who the Assassins are, but they do not know you.',
    );
  });
});

describe('roleParchmentCommands', () => {
  it('produces the exact command sequence, one command per line', () => {
    const commands = roleParchmentCommands(umbraseer);
    expect(commands.split('\n')).toEqual([
      'dip quill ink',
      'write parch',
      roleRevealText(umbraseer),
      'Share your role with the Herald.',
      '@',
      'write parch title Umbral Cloak & Soulsteel Dagger Role',
      'read soulsteel',
    ]);
  });
});
