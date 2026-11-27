/**
 * The game-client renders DSL text with DSL_ANSI_COLORS; services/copilot-core converts the game's ANSI back to DSL
 * with its own mirrored table (DSL_COLOR_SGR). These tests make the two tables unable to drift apart: change one
 * without the other and a case here fails.
 */
import { ansiToDsl, DSL_COLOR_SGR } from '@shatteredarchive/copilot-core';
import { DSL_ANSI_COLORS, dslToAnsi } from './dsl-to-ansi';

const colorKeys = Object.keys(DSL_ANSI_COLORS);

describe('dsl-to-ansi round trip with copilot-core', () => {
  it('has the same set of colour keys in both tables', () => {
    expect(Object.keys(DSL_COLOR_SGR).sort()).toEqual([...colorKeys].sort());
  });

  it.each(colorKeys)('%s: ansiToDsl(client ANSI) gives the key back', (key) => {
    expect(ansiToDsl(DSL_ANSI_COLORS[key]).dsl).toBe(key);
  });

  it.each(colorKeys)('%s: the mirrored SGR parameters equal the client escape', (key) => {
    expect(`\u001b[${DSL_COLOR_SGR[key]}m`).toBe(DSL_ANSI_COLORS[key]);
  });

  it('round-trips a coloured sentence through dslToAnsi and back', () => {
    const dsl = '{rred{x and {Gbright green{x with {{braces and a {-';
    expect(ansiToDsl(dslToAnsi(dsl)).dsl).toBe(dsl);
  });
});
