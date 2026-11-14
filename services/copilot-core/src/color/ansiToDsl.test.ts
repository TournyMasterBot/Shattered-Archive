import { ESC } from './ansi';
import { ansiToDsl } from './ansiToDsl';
import { DSL_COLOR_SGR } from './dslColors';

const sgr = (params: string): string => `${ESC}[${params}m`;

describe('ansiToDsl: the mirrored colour table (C1)', () => {
  const entries = Object.entries(DSL_COLOR_SGR);

  it('has the 19 colour codes of the game-client table ({x reset and the other symbols are separate)', () => {
    expect(Object.keys(DSL_COLOR_SGR).sort()).toEqual(
      ['{r', '{R', '{g', '{G', '{y', '{Y', '{b', '{B', '{m', '{M', '{c', '{C', '{D', '{w', '{W', '{o', '{n', '{p', '{u'].sort(),
    );
  });

  it('writes {x when a colour is cleared', () => {
    expect(ansiToDsl(`${sgr('31')}a${sgr('0')}`).dsl).toBe('{ra{x');
  });

  it.each(entries)('%s: the short SGR form converts back', (dslKey, params) => {
    expect(ansiToDsl(sgr(params)).dsl).toBe(dslKey);
  });

  it.each(entries.filter(([, p]) => /^3[0-7]$/.test(p)))('%s: the long form with an explicit reset (0;3x) converts back', (dslKey, params) => {
    expect(ansiToDsl(sgr(`0;${params}`)).dsl).toBe(dslKey);
  });

  it.each(entries.filter(([, p]) => /^9[0-7]$/.test(p)))('%s: the long form with a bold flag (1;3x) converts back', (dslKey, params) => {
    expect(ansiToDsl(sgr(`1;${Number(params) - 60}`)).dsl).toBe(dslKey);
  });
});

describe('ansiToDsl: the forms the game really sends (C1)', () => {
  it('maps bold black 1;30 to {D and plain grey 0;37 to {w', () => {
    expect(ansiToDsl(`${sgr('1;30')}dark${sgr('0')}`).dsl).toBe('{Ddark{x');
    expect(ansiToDsl(`${sgr('0;37')}grey${sgr('0')}`).dsl).toBe('{wgrey{x');
  });

  it('maps bold white 1;37 to {W and 0;3x / 1;3x to lower and upper case', () => {
    expect(ansiToDsl(sgr('1;37')).dsl).toBe('{W');
    expect(ansiToDsl(sgr('0;35')).dsl).toBe('{m');
    expect(ansiToDsl(sgr('1;35')).dsl).toBe('{M');
  });

  it('keeps bold across sequences until a reset, as a terminal does', () => {
    expect(ansiToDsl(`${sgr('1')}${sgr('31')}a${sgr('0')}${sgr('31')}b`).dsl).toBe('{Ra{x{rb');
  });

  it('turns bold off with 22', () => {
    expect(ansiToDsl(`${sgr('1;31')}a${sgr('22')}b`).dsl).toBe('{Ra{rb');
  });

  it('maps standard 256-colour numbers 0-7 and 8-15 to the base and bright codes', () => {
    expect(ansiToDsl(sgr('38;5;1')).dsl).toBe('{r');
    expect(ansiToDsl(sgr('38;5;9')).dsl).toBe('{R');
  });

  it('collapses repeated resets and repeated identical colours', () => {
    expect(ansiToDsl(`${sgr('0')}${sgr('0')}a${sgr('1;30')}b${sgr('1;30')}c${sgr('0')}${sgr('0')}`).dsl).toBe('a{Dbc{x');
  });

  it('does not emit anything for a reset at the start of the text', () => {
    expect(ansiToDsl(`${sgr('0')}hello`).dsl).toBe('hello');
  });

  it('understands a wrapped sequence', () => {
    expect(ansiToDsl(`${ESC}[1;31\r\nmred`).dsl).toBe('{Rred');
  });

  it('maps reverse video to {&', () => {
    expect(ansiToDsl(`${sgr('7')}x`).dsl).toBe('{&x');
  });

  it('resets with 39 (default foreground)', () => {
    expect(ansiToDsl(`${sgr('31')}a${sgr('39')}b`).dsl).toBe('{ra{xb');
  });
});

describe('ansiToDsl: literal characters', () => {
  it('doubles a literal brace and writes a tilde as {-', () => {
    expect(ansiToDsl('a {x b ~ c {{').dsl).toBe('a {{x b {- c {{{{');
  });

  it('returns plain text unchanged with nothing unmapped', () => {
    expect(ansiToDsl('plain')).toEqual({ dsl: 'plain', unmapped: [] });
  });

  it('returns an empty result for empty input', () => {
    expect(ansiToDsl('')).toEqual({ dsl: '', unmapped: [] });
  });
});

describe('ansiToDsl: what has no DSL equivalent is flagged, not guessed (C1)', () => {
  it('flags an unknown 256-colour number once, clears to default, and keeps the text', () => {
    const result = ansiToDsl(`${sgr('38;5;61')}A${sgr('1;30')}cheron${sgr('38;5;61')}A${sgr('0')}`);
    // nothing is active at the start, so the unmapped colour needs no clear; after {D it clears to default
    expect(result.dsl).toBe('A{Dcheron{xA');
    expect(result.unmapped).toEqual(['38;5;61']);
  });

  it('flags a true-colour group and a background colour group', () => {
    const result = ansiToDsl(`${sgr('38;2;10;20;30')}a${sgr('48;5;17')}b${sgr('41')}c`);
    expect(result.unmapped).toEqual(['38;2;10;20;30', '48;5;17', '41']);
    expect(result.dsl).toBe('abc');
  });

  it('flags underline and other attributes without changing the colour', () => {
    const result = ansiToDsl(`${sgr('31')}a${sgr('4')}b`);
    expect(result.dsl).toBe('{rab');
    expect(result.unmapped).toEqual(['4']);
  });

  it('flags a non-colour sequence and drops it', () => {
    const result = ansiToDsl(`a${ESC}[2Kb`);
    expect(result).toEqual({ dsl: 'ab', unmapped: ['CSI 2K'] });
  });

  it('flags a colour list with a non-numeric parameter and drops it', () => {
    expect(ansiToDsl(`a${ESC}[?1mb`)).toEqual({ dsl: 'ab', unmapped: ['SGR ?1'] });
  });

  it('flags a sequence whose final byte is not m and keeps the text after it', () => {
    expect(ansiToDsl(`a${ESC}[1;xmb`)).toEqual({ dsl: 'amb', unmapped: ['CSI 1;x'] });
  });

  it('handles a truncated extended-colour group at the end of the list', () => {
    expect(ansiToDsl(sgr('38')).unmapped).toEqual(['38']);
  });
});
