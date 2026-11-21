import { expandCommand, findUnresolvedPlaceholder, isItemAction } from './autoleveling-command-text';

describe('expandCommand', () => {
  it('fills {name}, {target} and {keyword} with the keyword', () => {
    expect(expandCommand('kill {name}', 'elf')).toBe('kill elf');
    expect(expandCommand("cast 'fire' {target}", 'half')).toBe("cast 'fire' half");
    expect(expandCommand('k {keyword}', 'wren')).toBe('k wren');
  });

  it('removes the placeholder and the space before it when there is no keyword (L1)', () => {
    expect(expandCommand("cast 'dark heal' {name}", null)).toBe("cast 'dark heal'");
    expect(expandCommand("cast 'dark heal' {name}", undefined)).toBe("cast 'dark heal'");
    expect(expandCommand("cast 'dark heal' {name}", '   ')).toBe("cast 'dark heal'");
  });

  it('leaves a command without a placeholder unchanged', () => {
    expect(expandCommand('kick', 'elf')).toBe('kick');
    expect(expandCommand("cast 'sanctuary'", null)).toBe("cast 'sanctuary'");
  });

  it('inserts the keyword verbatim: replacement patterns in it are not interpreted (L2)', () => {
    expect(expandCommand('kill {name}', '$&')).toBe('kill $&');
    expect(expandCommand('kill {name}', '$1x')).toBe('kill $1x');
    expect(expandCommand('kill {name}', 'a{b}')).toBe('kill a{b}');
  });

  it('fills every occurrence', () => {
    expect(expandCommand('say {name} {name}', 'elf')).toBe('say elf elf');
  });

  it('does not touch a colour code that has no closing brace', () => {
    expect(expandCommand('say {Rhello', 'elf')).toBe('say {Rhello');
  });
});

describe('findUnresolvedPlaceholder (L3)', () => {
  it('finds a leftover {word} or <words>', () => {
    expect(findUnresolvedPlaceholder('quaff <potion>')).toBe('<potion>');
    expect(findUnresolvedPlaceholder('cast x {typo}')).toBe('{typo}');
    expect(findUnresolvedPlaceholder('brandish <magic staff>')).toBe('<magic staff>');
  });

  it('is null for a ready command, a colour code and a lone bracket', () => {
    expect(findUnresolvedPlaceholder("cast 'sanctuary'")).toBeNull();
    expect(findUnresolvedPlaceholder('say {Rred and {Gred')).toBeNull();
    expect(findUnresolvedPlaceholder('say 1 < 2 and 3 > 2')).toBeNull();
    expect(findUnresolvedPlaceholder('')).toBeNull();
  });
});

describe('bad input (a record from the cloud can hold anything)', () => {
  it('treats a missing command as an empty one and never throws', () => {
    expect(expandCommand(undefined as unknown as string, 'elf')).toBe('');
    expect(findUnresolvedPlaceholder(null as unknown as string)).toBeNull();
    expect(isItemAction(undefined as unknown as string)).toBe(false);
  });
});

describe('isItemAction', () => {
  it.each(['quaff haste', 'brandish staff', 'zap wand', 'recite scroll', 'eat bread', 'drink water', 'QUAFF x', '  quaff x'])(
    '%s is an item action',
    (cmd) => expect(isItemAction(cmd)).toBe(true),
  );

  it.each(["cast 'haste'", 'kick', '', 'quaffle'])('%s is not', (cmd) => expect(isItemAction(cmd)).toBe(false));
});
