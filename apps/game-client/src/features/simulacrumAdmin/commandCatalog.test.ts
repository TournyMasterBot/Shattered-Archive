import { GENERATED_COMMANDS, type GeneratedCommand } from './commandTable.generated';
import { COMMAND_SYNTAX } from './commandSyntax';
import type { CommandSyntax } from './commandSyntaxTypes';
import {
  COMMAND_CATALOG,
  GROUP_LABELS,
  GROUP_ORDER,
  buildCatalog,
  commandsInGroup,
  findCatalogCommand,
} from './commandCatalog';

const fixtureCommand = (name: string): GeneratedCommand => ({
  name,
  aliases: [],
  hiddenAliases: [],
  handler: `do_${name}`,
  level: 52,
  levelSymbol: 'IM',
  listed: true,
});
const fixtureSyntax: CommandSyntax = { group: 'world', summary: 's', forms: [{ id: 'run', label: 'Run', fields: [] }] };

describe('the catalog joins the generated table and the syntax entries (ADMIN-01)', () => {
  it('has a syntax entry for every generated command and a command for every entry', () => {
    const { missingSyntax, orphanSyntax, commands } = buildCatalog(GENERATED_COMMANDS, COMMAND_SYNTAX);
    expect(missingSyntax).toEqual([]);
    expect(orphanSyntax).toEqual([]);
    expect(commands).toHaveLength(GENERATED_COMMANDS.length);
    expect(commands).toHaveLength(Object.keys(COMMAND_SYNTAX).length);
  });

  it('names a generated command that has no syntax entry', () => {
    const result = buildCatalog([fixtureCommand('stat'), fixtureCommand('newcmd')], { stat: fixtureSyntax });
    expect(result.missingSyntax).toEqual(['newcmd']);
    expect(result.commands.map((c) => c.name)).toEqual(['stat']);
  });

  it('names a syntax entry whose command left the table', () => {
    const result = buildCatalog([fixtureCommand('stat')], { stat: fixtureSyntax, gone: fixtureSyntax });
    expect(result.orphanSyntax).toEqual(['gone']);
  });
});

describe('every syntax entry is well formed', () => {
  const entries = COMMAND_CATALOG.flatMap((c) => c.syntax.forms.map((form) => ({ command: c, form })));

  it('has at least one form per command and unique form ids', () => {
    for (const c of COMMAND_CATALOG) {
      expect(c.syntax.forms.length).toBeGreaterThan(0);
      expect(new Set(c.syntax.forms.map((f) => f.id)).size).toBe(c.syntax.forms.length);
    }
  });

  it('has unique field ids per form, and choices for every choice field only', () => {
    for (const { command, form } of entries) {
      const ids = form.fields.map((f) => f.id);
      expect({ at: `${command.name}/${form.id}`, unique: new Set(ids).size }).toEqual({
        at: `${command.name}/${form.id}`,
        unique: ids.length,
      });
      for (const field of form.fields) {
        if (field.type === 'choice') expect((field.choices ?? []).length).toBeGreaterThan(1);
        else expect(field.choices).toBeUndefined();
        if (field.type === 'number') expect(field.min).toBeLessThan(field.max ?? Number.NaN);
      }
    }
  });

  it('lets an optional field follow only optional fields, so the built line has no gap', () => {
    for (const { command, form } of entries) {
      const firstOptional = form.fields.findIndex((f) => f.optional);
      if (firstOptional === -1) continue;
      expect({ at: `${command.name}/${form.id}`, allOptionalAfter: form.fields.slice(firstOptional).every((f) => f.optional) }).toEqual({
        at: `${command.name}/${form.id}`,
        allOptionalAfter: true,
      });
    }
  });

  it('points every bulk rule at a field of its form', () => {
    for (const { command, form } of entries) {
      for (const rule of form.bulk ?? []) {
        expect({ at: `${command.name}/${form.id}`, found: form.fields.some((f) => f.id === rule.field) }).toEqual({
          at: `${command.name}/${form.id}`,
          found: true,
        });
        if (rule.kind === 'value') expect((rule.values ?? []).length).toBeGreaterThan(0);
        expect(rule.scope.length).toBeGreaterThan(10);
      }
    }
  });

  it('writes success patterns that hold no state between matches (no g or y flag)', () => {
    for (const c of COMMAND_CATALOG) {
      for (const pattern of [...(c.syntax.success ?? []), ...c.syntax.forms.flatMap((f) => f.success ?? [])]) {
        expect({ at: c.name, flags: pattern.flags.replace(/[im]/g, '') }).toEqual({ at: c.name, flags: '' });
      }
    }
  });

  it('only lists a form on the Players tab when its first field is the player target', () => {
    // A character field, or the `target` word of the forms that also take `all` (transfer, force), which carry a bulk rule.
    for (const { command, form } of entries) {
      if (!form.category) continue;
      const first = form.fields[0];
      const isTarget = first?.type === 'character' || (first?.id === 'target' && first.type === 'word' && !!form.bulk?.length);
      expect({ at: `${command.name}/${form.id}`, isTarget }).toEqual({ at: `${command.name}/${form.id}`, isTarget: true });
    }
  });

  it('lists a form on the Players tab for every form whose first field is a character, apart from the documented exceptions', () => {
    const exceptions = new Set(['set/char', 'at/run', 'stat/mob', 'switch/run', 'stat/char', 'set/skill', 'clone/object', 'clone/mobile']);
    for (const { command, form } of entries) {
      const key = `${command.name}/${form.id}`;
      if (form.fields[0]?.type === 'character' && !form.category && !exceptions.has(key)) {
        expect({ key, listed: false }).toEqual({ key, listed: true });
      }
    }
  });

  it('puts every command in a known group, each group is used, and every group has a label', () => {
    for (const c of COMMAND_CATALOG) expect(GROUP_ORDER).toContain(c.syntax.group);
    for (const group of GROUP_ORDER) {
      expect(commandsInGroup(group).length).toBeGreaterThan(0);
      expect(GROUP_LABELS[group]).toMatch(/\w/);
    }
  });
});

describe('lookups', () => {
  it('finds a command by name or listed alias, case-insensitively, and never by a hidden alias (E25)', () => {
    expect(findCatalogCommand('transfer')?.name).toBe('transfer');
    expect(findCatalogCommand('Teleport')?.name).toBe('transfer');
    expect(findCatalogCommand('reboo')).toBeUndefined();
    expect(findCatalogCommand('shutdow')).toBeUndefined();
    expect(findCatalogCommand('invis')).toBeUndefined();
    expect(findCatalogCommand('nonesuch')).toBeUndefined();
  });

  it('offers reboot and shutdown only as full words with no arguments (E25)', () => {
    for (const name of ['reboot', 'shutdown']) {
      const command = findCatalogCommand(name);
      expect(command?.syntax.forms).toHaveLength(1);
      expect(command?.syntax.forms[0].fields).toEqual([]);
      expect(command?.syntax.forms[0].literal).toBeUndefined();
      expect(command?.syntax.forms[0].confirm).toBe(true);
    }
    expect(COMMAND_CATALOG.map((c) => c.name)).not.toEqual(expect.arrayContaining(['reboo']));
  });

  it('keeps copyover behind its own word and the panel confirmation (E25)', () => {
    const forms = findCatalogCommand('copyover')?.syntax.forms ?? [];
    const info = forms.find((f) => f.id === 'info');
    const run = forms.find((f) => f.id === 'run');
    expect(info?.literal).toBeUndefined();
    expect(info?.confirm).toBeUndefined();
    expect(info?.safe).toBe(true);
    expect(run?.literal).toEqual(['confirm']);
    expect(run?.confirm).toBe(true);
  });
});

describe('the destructive set the owner approved (S11, Phase 6)', () => {
  const approved = [
    'shutdown', 'reboot', 'copyover', 'areload', 'purge', 'deny', 'ban', 'permban', 'disconnect', 'freeze', 'force',
    'slay', 'advance', 'trust', 'dump', 'wizlock', 'newlock', 'qpoints',
    // The owner widened the set on 2026-11-07: every command that writes to a player asks first.
    'nochannels', 'noemote', 'noshout', 'notell', 'pardon', 'guild', 'flag', 'protect', 'set', 'string',
  ];

  it('marks exactly the approved commands destructive, and every one exists', () => {
    for (const name of approved) expect(findCatalogCommand(name)).toBeDefined();
    const marked = COMMAND_CATALOG.filter((c) => c.syntax.destructive).map((c) => c.name).sort();
    expect(marked).toEqual([...approved].sort());
  });

  it('marks the always-wide forms and the all-values as bulk (E21)', () => {
    expect(findCatalogCommand('restore')?.syntax.forms.find((f) => f.id === 'all')?.confirm).toBe(true);
    expect(findCatalogCommand('purge')?.syntax.forms.find((f) => f.id === 'room')?.confirm).toBe(true);
    const transfer = findCatalogCommand('transfer')?.syntax.forms[0];
    expect(transfer?.bulk).toEqual([expect.objectContaining({ field: 'target', kind: 'value', values: ['all'] })]);
    const force = findCatalogCommand('force')?.syntax.forms[0];
    expect(force?.bulk?.[0].values).toEqual(['all', 'players', 'gods']);
    expect(findCatalogCommand('log')?.syntax.forms[0].bulk?.[0].values).toEqual(['all']);
    expect(findCatalogCommand('ban')?.syntax.forms.find((f) => f.id === 'add')?.bulk?.[0].kind).toBe('wildcard');
  });
});
