import {
  BAG_SETUP_ALIAS,
  DEFAULT_COMMAND_DELAY_MS,
  SCRIPT_LANGUAGES,
  bagSetupAliasSource,
  exampleBagSetupSource,
} from './aliasScript.js';

describe('bagSetupAliasSource', () => {
  const commands = 'dip quill ink\nwrite parch\nput parch 1.sack';

  it('returns the commands unchanged, one per line, for the text language', () => {
    expect(bagSetupAliasSource(commands, 'text')).toBe(commands);
  });

  it('drops blank lines', () => {
    expect(bagSetupAliasSource('a\n\nb', 'text')).toBe('a\nb');
  });

  it('wraps every command in a staggered doAfter call for javascript, with a semicolon, using the default delay', () => {
    expect(DEFAULT_COMMAND_DELAY_MS).toBe(350);
    const source = bagSetupAliasSource(commands, 'javascript');
    const lines = source.split('\n').filter((l) => l.startsWith('doAfter'));
    expect(lines).toEqual([
      'doAfter(0, "world", "dip quill ink");',
      'doAfter(350, "world", "write parch");',
      'doAfter(700, "world", "put parch 1.sack");',
    ]);
  });

  it('honors a custom delay when given one', () => {
    const source = bagSetupAliasSource(commands, 'javascript', 1000);
    const lines = source.split('\n').filter((l) => l.startsWith('doAfter'));
    expect(lines).toEqual([
      'doAfter(0, "world", "dip quill ink");',
      'doAfter(1000, "world", "write parch");',
      'doAfter(2000, "world", "put parch 1.sack");',
    ]);
  });

  it('a zero delay is valid — every command fires back to back', () => {
    const source = bagSetupAliasSource(commands, 'javascript', 0);
    const lines = source.split('\n').filter((l) => l.startsWith('doAfter'));
    expect(lines.every((l) => l.startsWith('doAfter(0, "world",'))).toBe(true);
  });

  it('the text language ignores the delay entirely, since it has no scripting', () => {
    expect(bagSetupAliasSource(commands, 'text', 5000)).toBe(commands);
  });

  it('uses no statement terminator for lua and python', () => {
    const lua = bagSetupAliasSource('look', 'lua');
    const python = bagSetupAliasSource('look', 'python');
    expect(lua.split('\n').at(-1)).toBe('doAfter(0, "world", "look")');
    expect(python.split('\n').at(-1)).toBe('doAfter(0, "world", "look")');
  });

  it('escapes embedded double quotes and backslashes so the generated source stays valid', () => {
    const source = bagSetupAliasSource('say She said "hi" \\ bye', 'javascript');
    expect(source).toContain('doAfter(0, "world", "say She said \\"hi\\" \\\\ bye");');
  });

  it('uses a language-appropriate comment prefix for the header, and none for text', () => {
    expect(bagSetupAliasSource('look', 'javascript').split('\n')[0]).toBe(
      '// Soulsteel bag setup — generated, one doAfter() per game command.',
    );
    expect(bagSetupAliasSource('look', 'lua').split('\n')[0]).toBe(
      '-- Soulsteel bag setup — generated, one doAfter() per game command.',
    );
    expect(bagSetupAliasSource('look', 'python').split('\n')[0]).toBe(
      '# Soulsteel bag setup — generated, one doAfter() per game command.',
    );
    expect(bagSetupAliasSource('look', 'text').split('\n')[0]).toBe('look');
  });
});

describe('exampleBagSetupSource', () => {
  it('demonstrates the real write-parchment, bag, gather-into-aggregate flow for every language, not an unrelated filler example', () => {
    for (const language of SCRIPT_LANGUAGES) {
      const source = exampleBagSetupSource(language);
      expect(source).toContain('Example Role A');
      expect(source).toContain('Example Role B');
      expect(source).toContain('chest'); // the placeholder aggregate/master container keyword
      expect(source).not.toContain('say Ready.');
    }
  });

  it('text is just the raw compiled commands — no doAfter, since text scripting has none', () => {
    const source = exampleBagSetupSource('text');
    expect(source).not.toContain('doAfter');
    const lines = source.split('\n');
    expect(lines).toContain('put 1.sack chest');
    expect(lines).toContain('put 2.sack chest');
  });

  it('scripted languages wrap each line in a staggered doAfter call', () => {
    const source = exampleBagSetupSource('javascript');
    expect(source).toMatch(/doAfter\(\d+, "world", "put 1\.sack chest"\);/);
    expect(source).toMatch(/doAfter\(\d+, "world", "put 2\.sack chest"\);/);
  });

  it('honors a custom delay when given one', () => {
    const source = exampleBagSetupSource('javascript', 1234);
    expect(source).toContain('doAfter(1234, "world",');
    expect(source).not.toContain('doAfter(350, "world",');
  });
});

describe('BAG_SETUP_ALIAS', () => {
  it('is a multi-word alias, unlikely to collide with an existing single-word alias', () => {
    expect(BAG_SETUP_ALIAS.trim().split(/\s+/).length).toBeGreaterThan(1);
  });
});
