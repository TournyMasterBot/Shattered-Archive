import { COMMAND_CATALOG, findCatalogCommand, type CatalogCommand } from './commandCatalog';
import type { FormSpec } from './commandSyntaxTypes';
import { needsConfirmation } from './confirmPolicy';

const cmd = (name: string): CatalogCommand => {
  const found = findCatalogCommand(name);
  if (!found) throw new Error(`no command ${name}`);
  return found;
};
const ask = (name: string, formId: string, values: Record<string, string> = {}) => {
  const command = cmd(name);
  const form = command.syntax.forms.find((f) => f.id === formId);
  if (!form) throw new Error(`no form ${formId}`);
  return needsConfirmation(command, form, values);
};

describe('needsConfirmation: the approved destructive set (S11)', () => {
  it('asks for every form of every command marked destructive, naming the command', () => {
    const marked = COMMAND_CATALOG.filter((c) => c.syntax.destructive);
    expect(marked.length).toBe(28);
    for (const command of marked) {
      for (const form of command.syntax.forms.filter((f) => !f.safe)) {
        const result = needsConfirmation(command, form, {});
        expect({ at: `${command.name}/${form.id}`, required: result.required }).toEqual({ at: `${command.name}/${form.id}`, required: true });
      }
    }
  });

  it('says what is at stake in words, using the form text where there is one', () => {
    expect(ask('copyover', 'run')).toEqual({
      required: true,
      scope: 'Every connected player sees a pause while the world reloads from disk.',
    });
    expect(ask('freeze', 'run', { target: 'Testchar' })).toEqual({
      required: true,
      scope: '"freeze" changes a player or the server and cannot be undone from this panel.',
    });
  });

  it('does not ask for the read-only and single-target commands that are not in the set', () => {
    expect(ask('stat', 'char', { target: 'Testchar' })).toEqual({ required: false });
    expect(ask('goto', 'run', { where: '3001' })).toEqual({ required: false });
    expect(ask('restore', 'target', { target: 'Testchar' })).toEqual({ required: false });
    expect(ask('transfer', 'run', { target: 'Testchar', where: '3001' })).toEqual({ required: false });
    expect(ask('copyover', 'info')).toEqual({ required: false });
    expect(ask('ban', 'list')).toEqual({ required: false });
    expect(ask('wizhelp', 'run')).toEqual({ required: false });
  });
});

describe('needsConfirmation: bulk forms (E21, ADMIN-02)', () => {
  it('asks for `transfer all` typed in a free-text field, in any case and with spaces around it', () => {
    for (const typed of ['all', 'ALL', '  All  ']) {
      const result = ask('transfer', 'run', { target: typed, where: '3001' });
      expect(result.required).toBe(true);
      expect(result).toEqual(expect.objectContaining({ scope: expect.stringContaining('every player on the server') }));
    }
  });

  it('asks for `transfer all` when the value comes from a list pick (the same value)', () => {
    expect(ask('transfer', 'run', { target: 'all' }).required).toBe(true);
  });

  it('asks for force players, force gods, log all and a wildcard ban', () => {
    expect(ask('force', 'run', { target: 'players', command: 'save' }).required).toBe(true);
    expect(ask('force', 'run', { target: 'gods', command: 'save' }).required).toBe(true);
    expect(ask('log', 'run', { target: 'all' }).required).toBe(true);
    expect(ask('log', 'run', { target: 'Testchar' }).required).toBe(false);
    const wildcard = ask('ban', 'add', { site: '*.example.org' });
    expect(wildcard).toEqual(expect.objectContaining({ required: true, scope: expect.stringContaining('matches the wildcard') }));
  });

  it('asks for purge with no argument (the whole room) and for restore all', () => {
    expect(ask('purge', 'room')).toEqual({ required: true, scope: 'Every mobile and object in your current room is removed.' });
    expect(ask('restore', 'all')).toEqual({ required: true, scope: 'Every active player is restored.' });
  });

  it('adds the bulk scope to the destructive text instead of replacing it', () => {
    const result = ask('force', 'run', { target: 'all', command: 'save' });
    expect(result).toEqual(expect.objectContaining({ required: true }));
    expect(result.required && result.scope).toContain('widens this to every player of lower trust');
  });

  it('asks for gecho, which reaches every player', () => {
    expect(ask('gecho', 'run', { message: 'hello' }).required).toBe(true);
    expect(ask('echo', 'run', { message: 'hello' }).required).toBe(false);
  });
});

describe('needsConfirmation: a destructive command hidden inside another', () => {
  it('asks when `at` is given a destructive inner command, also abbreviated', () => {
    for (const inner of ['purge', 'purg', 'copyover confirm', 'shutdow', 'freeze Testchar']) {
      const result = ask('at', 'run', { where: '3001', command: inner });
      expect({ inner, required: result.required }).toEqual({ inner, required: true });
    }
    const result = ask('at', 'run', { where: '3001', command: 'purge' });
    expect(result.required && result.scope).toContain('which is a destructive command');
  });

  it('does not ask for a harmless inner command, and ignores an empty one', () => {
    expect(ask('at', 'run', { where: '3001', command: 'look' }).required).toBe(false);
    expect(ask('at', 'run', { where: '3001', command: 'say hello' }).required).toBe(false);
    expect(ask('at', 'run', { where: '3001', command: '' }).required).toBe(false);
    expect(ask('at', 'run', { where: '3001' }).required).toBe(false);
  });
});

describe('needsConfirmation: a form that always asks', () => {
  it('falls back to a general text when the form gives none', () => {
    const command = cmd('stat');
    const form: FormSpec = { id: 'x', label: 'x', fields: [], confirm: true };
    expect(needsConfirmation(command, form, {})).toEqual({ required: true, scope: '"stat" changes the game.' });
  });

  it('ignores a bulk rule whose value is not present and an unset field', () => {
    const command = cmd('stat');
    const form: FormSpec = {
      id: 'x',
      label: 'x',
      fields: [{ id: 'who', label: 'Who', type: 'word' }],
      bulk: [{ field: 'who', kind: 'value', values: ['all'], scope: 'everyone' }],
    };
    expect(needsConfirmation(command, form, { who: 'Testchar' })).toEqual({ required: false });
    expect(needsConfirmation(command, form, {})).toEqual({ required: false });
  });

  it('treats a value rule with no values as never matching', () => {
    const command = cmd('stat');
    const form: FormSpec = {
      id: 'x',
      label: 'x',
      fields: [{ id: 'who', label: 'Who', type: 'word' }],
      bulk: [{ field: 'who', kind: 'value', scope: 'everyone' }],
    };
    expect(needsConfirmation(command, form, { who: 'all' })).toEqual({ required: false });
  });
});
