import { buildCommand, MAX_LINE, type BuildResult, type FieldValues } from './commandBuilder';
import { findCatalogCommand, type CatalogCommand } from './commandCatalog';
import type { FormSpec } from './commandSyntaxTypes';

const cmd = (name: string): CatalogCommand => {
  const found = findCatalogCommand(name);
  if (!found) throw new Error(`no command ${name}`);
  return found;
};
const formOf = (command: CatalogCommand, id: string): FormSpec => {
  const found = command.syntax.forms.find((f) => f.id === id);
  if (!found) throw new Error(`no form ${id}`);
  return found;
};
const build = (name: string, formId: string, values: FieldValues): BuildResult => {
  const command = cmd(name);
  return buildCommand(command, formOf(command, formId), values);
};
const errorOf = (result: BuildResult) => ('error' in result ? result.error : undefined);

describe('buildCommand: exact lines (E4)', () => {
  it.each([
    ['transfer', 'run', { target: 'Testchar', where: '3001' }, 'transfer Testchar 3001'],
    ['transfer', 'run', { target: 'Testchar', where: '' }, 'transfer Testchar'],
    ['copyover', 'run', {}, 'copyover confirm'],
    ['copyover', 'info', {}, 'copyover'],
    ['areload', 'run', { file: 'midgaard.are' }, 'areload midgaard.are'],
    ['vnum', 'obj', { name: 'rusty sword' }, 'vnum obj rusty sword'],
    ['load', 'mob', { vnum: '3000' }, 'load mob 3000'],
    ['load', 'obj', { vnum: '3001', level: '5' }, 'load obj 3001 5'],
    ['wiznet', 'status', {}, 'wiznet status'],
    ['wiznet', 'toggle', {}, 'wiznet'],
    ['reboot', 'run', {}, 'reboot'],
    ['shutdown', 'run', {}, 'shutdown'],
    ['qpoints', 'run', { target: 'Testchar', mode: 'add', amount: '5' }, 'qpoints Testchar add 5'],
    ['flag', 'char', { name: 'Testchar', field: 'plr', flags: '+holylight   -nosummon' }, 'flag char Testchar plr +holylight -nosummon'],
    ['at', 'run', { where: '3001', command: 'look' }, 'at 3001 look'],
  ])('%s %s builds the exact line', (name, formId, values, expected) => {
    expect(build(name, formId, values)).toEqual({ line: expected });
  });

  it('sends the shown name when the alias was typed, never an abbreviation', () => {
    expect(build('transfer', 'run', { target: 'Testchar' })).toEqual({ line: 'transfer Testchar' });
    expect(findCatalogCommand('teleport')?.name).toBe('transfer');
  });

  it('trims values, normalises numbers and matches a choice case-insensitively to its listed spelling', () => {
    expect(build('load', 'obj', { vnum: ' 0003001 ', level: ' 07 ' })).toEqual({ line: 'load obj 3001 7' });
    expect(build('pardon', 'run', { target: ' Testchar ', flag: 'KILLER' })).toEqual({ line: 'pardon Testchar killer' });
  });
});

describe('buildCommand: required, optional and gaps', () => {
  it('names a missing required field', () => {
    expect(errorOf(build('areload', 'run', {}))).toEqual({ field: 'file', message: 'Area file is required.' });
    expect(errorOf(build('areload', 'run', { file: '   ' }))?.field).toBe('file');
  });

  it('skips an empty optional field', () => {
    expect(build('sockets', 'run', { name: '' })).toEqual({ line: 'sockets' });
    expect(build('sockets', 'run', {})).toEqual({ line: 'sockets' });
  });

  it('refuses a filled optional field after an empty one', () => {
    // synthetic: the catalog has no such form, the rule still has to hold for the next one that does
    const command = cmd('transfer');
    const form: FormSpec = {
      id: 'gap',
      label: 'gap',
      fields: [
        { id: 'a', label: 'First', type: 'word', optional: true },
        { id: 'b', label: 'Second', type: 'word', optional: true },
      ],
    };
    expect(errorOf(buildCommand(command, form, { b: 'x' }))).toEqual({ field: 'b', message: 'Fill First first, or clear this.' });
    expect(buildCommand(command, form, { a: 'x', b: 'y' })).toEqual({ line: 'transfer x y' });
  });
});

describe('buildCommand: characters that must never reach the game (E4)', () => {
  it.each([
    ['newline', 'look\nshutdown'],
    ['carriage return', 'look\rshutdown'],
    ['tab', 'look\tnow'],
    ['NUL', 'look\u0000'],
    ['escape', 'look\u001b[31m'],
    ['DEL', 'look\u007f'],
  ])('rejects a %s in a text field and names the field', (_what, text) => {
    expect(errorOf(build('gecho', 'run', { message: text }))).toEqual({ field: 'message', message: 'Control characters are not allowed.' });
  });

  it('rejects a control character in a one-word field before the space check', () => {
    expect(errorOf(build('stat', 'char', { target: 'Test\nchar' }))?.message).toBe('Control characters are not allowed.');
  });

  it('rejects a space in a one-word field', () => {
    expect(errorOf(build('stat', 'char', { target: 'Test char' }))).toEqual({ field: 'target', message: 'One word only, no spaces.' });
    expect(errorOf(build('ban', 'add', { site: 'a b' }))?.field).toBe('site');
  });

  it('rejects a text of 300 characters and names the field that is too long', () => {
    const result = errorOf(build('gecho', 'run', { message: 'x'.repeat(300) }));
    expect(result?.field).toBe('message');
    expect(result?.message).toContain('Too long');
    expect(result?.message).toContain(String(MAX_LINE));
  });

  it('names the longest field when two fields share the line', () => {
    const result = errorOf(build('force', 'run', { target: 'a'.repeat(60), command: 'b'.repeat(200) }));
    expect(result?.field).toBe('command');
  });

  it('keeps the first field as the longest when a later one is shorter', () => {
    const result = errorOf(build('force', 'run', { target: 'a'.repeat(200), command: 'b'.repeat(60) }));
    expect(result?.field).toBe('target');
  });

  it('treats a choice field with no choices as having nothing valid', () => {
    const command = cmd('advance');
    const form: FormSpec = { id: 'bare', label: 'bare', fields: [{ id: 'c', label: 'C', type: 'choice' }] };
    expect(errorOf(buildCommand(command, form, { c: 'x' }))).toEqual({ field: 'c', message: 'One of: .' });
  });

  it('accepts a line of exactly the limit', () => {
    const prefix = 'gecho '.length;
    const ok = build('gecho', 'run', { message: 'x'.repeat(MAX_LINE - prefix) });
    expect('line' in ok && ok.line.length).toBe(MAX_LINE);
  });
});

describe('buildCommand: typed values', () => {
  it.each([
    ['number', 'advance', 'run', { target: 'Testchar', level: 'ten' }, 'A whole number.'],
    ['number', 'advance', 'run', { target: 'Testchar', level: '1.5' }, 'A whole number.'],
    ['number below the range', 'advance', 'run', { target: 'Testchar', level: '0' }, 'A number from 1 to 60.'],
    ['number above the range', 'advance', 'run', { target: 'Testchar', level: '61' }, 'A number from 1 to 60.'],
    ['vnum that is not a number', 'load', 'mob', { vnum: 'abc' }, 'A positive vnum.'],
    ['vnum of zero', 'load', 'mob', { vnum: '0' }, 'A positive vnum.'],
    ['vnum that is negative', 'load', 'mob', { vnum: '-3' }, 'A positive vnum.'],
    ['vnum that is too long', 'load', 'mob', { vnum: '1234567890' }, 'A positive vnum.'],
    ['area file without .are', 'areload', 'run', { file: 'midgaard' }, 'An area file name ending in .are, such as midgaard.are.'],
    ['area file with a path', 'areload', 'run', { file: '../etc/passwd.are' }, 'An area file name ending in .are, such as midgaard.are.'],
    ['choice not offered', 'pardon', 'run', { target: 'Testchar', flag: 'jaywalker' }, 'One of: killer, thief.'],
    ['flag word with a symbol', 'flag', 'char', { name: 'Testchar', field: 'plr', flags: '+hol;ylight' }, 'Flag words, each optionally starting with +, - or =.'],
  ])('rejects a %s', (_what, name, formId, values, message) => {
    expect(errorOf(build(name, formId, values))?.message).toBe(message);
  });

  it('accepts a negative number where the range allows it', () => {
    expect(build('qpoints', 'run', { target: 'Testchar', mode: 'add', amount: '-5' })).toEqual({ line: 'qpoints Testchar add -5' });
  });

  it('accepts a number field with no range', () => {
    const command = cmd('advance');
    const form: FormSpec = { id: 'free', label: 'free', fields: [{ id: 'n', label: 'N', type: 'number' }] };
    expect(buildCommand(command, form, { n: '-999999' })).toEqual({ line: 'advance -999999' });
  });
});
