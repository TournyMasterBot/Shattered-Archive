/**
 * Invented `whoisic` output for tests (a real description is Personal data and never goes into a fixture). Test helper: excluded from
 * the build. The names passed in are placeholders chosen by the test.
 */

const RULE = '-'.repeat(76);

export interface BlockOptions {
  sex?: string;
  /** Description lines, ANSI allowed. An empty list is a character with no description (E7). */
  description?: string[];
}

/** The lines of one block, in the order the game sends them. */
export function whoisicBlock(name: string, { sex = 'Male', description = ['The first line of the description.', 'The \x1b[1;31mred\x1b[0m second line.'] }: BlockOptions = {}): string[] {
  return [
    `IC Information for ${name}.`,
    RULE,
    'Eyes: green                           Hair: auburn',
    'Skin: tan                             Hair Length: Long',
    'Feature: A pale mark across the brow',
    RULE,
    `Profession: Scribe       Age: 38                       Sex: ${sex}`,
    RULE,
    ...description,
  ];
}

/** The prompt line that ends a block. */
export const PROMPT = '<1645/1645hp 1240/1240m 406/406mv 473558tnl> [Somewhere] [A] [12:00pm]';
