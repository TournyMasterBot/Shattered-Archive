import { ESC } from '../color/ansi';
import { parseWhoisic, pickNewestWhoisic } from './whoisic';

const c = (params: string, text: string): string => `${ESC}[${params}m${text}${ESC}[0m`;
const RULE = '-'.repeat(76);

/** A scrubbed block shaped like the game's output: invented character, invented description. */
function block(name = 'Agate', description: string[] | null = null): string[] {
  const desc = description ?? [
    `Before you is a tall figure wearing a ${c('1;30', 'pitch black')} cloak with`,
    `${c('38;5;61', 'runes')} and a ${c('38;5;208', 'copper')} clasp.  `,
    '',
    `A ${c('0;37', 'grey')} scarf, {braces} and a ~ tilde.  `,
    '',
  ];
  return [
    `IC Information for ${name}.\r`,
    `${RULE}\r`,
    `Eyes: hazel                           Hair: ${c('1;30', 'jet-black')}                     \r`,
    `Skin: tan                             Hair Length: Long                   \r`,
    `Build: Large                          Hair Texture: Wavy                  \r`,
    `Face: Rugged                          Facial Hair: Clean-shaven           \r`,
    `Feature: ${c('38;5;61', 'A pale mark across the brow, seen at a glance')}\r`,
    `${RULE}\r`,
    `Profession: ${c('1;36', 'Scribe')}       Age: ${c('1;36', '38')}                       Sex: ${c('1;36', 'Male')}\r`,
    `${RULE}\r`,
    ...desc,
  ];
}

describe('parseWhoisic', () => {
  it('reads the header name and every field of the block (C1)', () => {
    const record = parseWhoisic(block('Agate'));
    expect(record?.name).toBe('Agate');
    expect(record?.fields).toEqual({
      Eyes: 'hazel',
      Hair: 'jet-black',
      Skin: 'tan',
      'Hair Length': 'Long',
      Build: 'Large',
      'Hair Texture': 'Wavy',
      Face: 'Rugged',
      'Facial Hair': 'Clean-shaven',
      Feature: 'A pale mark across the brow, seen at a glance',
      Profession: 'Scribe',
      Age: '38',
      Sex: 'Male',
    });
  });

  it('keeps the description verbatim with its ANSI, and writes the DSL version beside it (C1)', () => {
    const record = parseWhoisic(block());
    expect(record?.rawAnsi).toBe(
      [
        `Before you is a tall figure wearing a ${c('1;30', 'pitch black')} cloak with`,
        `${c('38;5;61', 'runes')} and a ${c('38;5;208', 'copper')} clasp.  `,
        '',
        `A ${c('0;37', 'grey')} scarf, {braces} and a ~ tilde.  `,
      ].join('\n'),
    );
    expect(record?.dsl).toBe(
      [
        'Before you is a tall figure wearing a {Dpitch black{x cloak with',
        'runes and a {ocopper{x clasp.  ',
        '',
        'A {wgrey{x scarf, {{braces} and a {- tilde.  ',
      ].join('\n'),
    );
  });

  it('removes the colour from the plain text and flags the colour the DSL has no code for', () => {
    const record = parseWhoisic(block());
    expect(record?.text).toContain('pitch black cloak with');
    expect(record?.text).not.toContain(ESC);
    expect(record?.unmapped).toEqual(['38;5;61']);
    expect(record?.hasDescription).toBe(true);
  });

  it('rejoins an escape sequence that a line break cut inside the description (C1)', () => {
    const lines = block('Agate', [`wearing a ${ESC}[1;30\r`, `mpitch black${ESC}[0m cloak.\r`]);
    const record = parseWhoisic(lines);
    expect(record?.dsl).toBe('wearing a {Dpitch black{x cloak.');
  });

  it('records a block with no description as empty text and hasDescription false (E7)', () => {
    const lines = block('Agate', []);
    const record = parseWhoisic(lines);
    expect(record).toMatchObject({ hasDescription: false, rawAnsi: '', dsl: '', text: '', unmapped: [] });
    expect(record?.fields.Profession).toBe('Scribe');
  });

  it('treats a description that is only colour codes as empty (E7)', () => {
    const record = parseWhoisic(block('Agate', [`${ESC}[0m\r`, '\r']));
    expect(record?.hasDescription).toBe(false);
    expect(record?.rawAnsi).toBe('');
  });

  it('handles a block cut before the third rule: fields only, no description', () => {
    const cut = block().slice(0, 9); // header, rule, 4 field rows, Feature, rule, profession row
    const record = parseWhoisic(cut);
    expect(record?.hasDescription).toBe(false);
    expect(record?.fields.Age).toBe('38');
  });

  it('finds the header when other lines (the echoed command) come before it', () => {
    const record = parseWhoisic(['whoisic agat\r', ...block('Agate')]);
    expect(record?.name).toBe('Agate');
  });

  it('returns null when there is no header', () => {
    expect(parseWhoisic(['You see nothing special.', RULE])).toBeNull();
    expect(parseWhoisic([])).toBeNull();
  });

  it('stores the log time when given', () => {
    expect(parseWhoisic(block(), 1234)?.at).toBe(1234);
    expect(parseWhoisic(block())?.at).toBeUndefined();
  });

  it('accepts lines without the trailing carriage return', () => {
    const record = parseWhoisic(block().map((l) => l.replace(/\r$/, '')));
    expect(record?.fields.Eyes).toBe('hazel');
  });
});

describe('pickNewestWhoisic', () => {
  const older = parseWhoisic(block('Agate', ['old text.']), 1000)!;
  const newer = parseWhoisic(block('Agate', ['new text.']), 2000)!;

  it('prefers the later timestamp whichever order they are given in', () => {
    expect(pickNewestWhoisic(older, newer).text).toBe('new text.');
    expect(pickNewestWhoisic(newer, older).text).toBe('new text.');
  });

  it('lets the second argument win on equal times (it was read later from the same log)', () => {
    const a = parseWhoisic(block('Agate', ['first.']), 5)!;
    const b = parseWhoisic(block('Agate', ['second.']), 5)!;
    expect(pickNewestWhoisic(a, b).text).toBe('second.');
  });

  it('lets a record with a time beat one without', () => {
    const untimed = parseWhoisic(block('Agate', ['untimed.']))!;
    expect(pickNewestWhoisic(untimed, older).text).toBe('old text.');
    expect(pickNewestWhoisic(older, untimed).text).toBe('old text.');
  });
});
