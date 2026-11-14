import type { CatalogCommand } from './commandCatalog';
import type { FieldSpec, FormSpec } from './commandSyntaxTypes';

/** What the game reads of one input line (MAX_INPUT_LENGTH); a longer line is cut by the server mid-word. */
export const MAX_LINE = 255;

export type FieldValues = Readonly<Record<string, string | undefined>>;

export interface BuildError {
  /** The field id, or `line` when the whole line is the problem. */
  field: string;
  message: string;
}

export type BuildResult = { line: string } | { error: BuildError };

// Any C0 control character (a newline would send a second command, an escape could drive the terminal) and DEL (E4).
const CONTROL = /[\u0000-\u001f\u007f]/;
const AREA_FILE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\.are$/;
const FLAG_WORD = /^[+=-]?[A-Za-z0-9_]+$/;

/** The values a `choice` field offers; an entry with none offers nothing. */
export const choicesOf = (spec: FieldSpec): readonly string[] => spec.choices ?? [];

function checkField(spec: FieldSpec, value: string): string | { error: string } {
  if (CONTROL.test(value)) return { error: 'Control characters are not allowed.' };
  switch (spec.type) {
    case 'character':
    case 'word':
      return /\s/.test(value) ? { error: 'One word only, no spaces.' } : value;
    case 'text':
      return value;
    case 'number': {
      if (!/^-?\d+$/.test(value)) return { error: 'A whole number.' };
      const n = Number(value);
      const min = spec.min ?? Number.NEGATIVE_INFINITY;
      const max = spec.max ?? Number.POSITIVE_INFINITY;
      return n < min || n > max ? { error: `A number from ${min} to ${max}.` } : String(n);
    }
    case 'vnum':
      return /^\d{1,9}$/.test(value) && Number(value) > 0 ? String(Number(value)) : { error: 'A positive vnum.' };
    case 'areaFile':
      return AREA_FILE.test(value) ? value : { error: 'An area file name ending in .are, such as midgaard.are.' };
    case 'choice': {
      const found = choicesOf(spec).find((c) => c.toLowerCase() === value.toLowerCase());
      return found ?? { error: `One of: ${choicesOf(spec).join(', ')}.` };
    }
    case 'flags':
      return value.split(/\s+/).every((w) => FLAG_WORD.test(w))
        ? value.split(/\s+/).join(' ')
        : { error: 'Flag words, each optionally starting with +, - or =.' };
  }
}

/**
 * Builds the exact line to send: the full command name, the form's literal words, then each field in order.
 * Values are trimmed and checked by field type; a control character, a space inside a one-word field, an empty required field or a line
 * over 255 characters is an error naming the field (E4). Nothing here talks to the game.
 */
export function buildCommand(command: CatalogCommand, form: FormSpec, values: FieldValues): BuildResult {
  const parts: string[] = [command.name, ...(form.literal ?? [])];
  const sizes: { field: string; size: number }[] = [];
  let skipped: FieldSpec | undefined;
  for (const spec of form.fields) {
    const value = (values[spec.id] ?? '').trim();
    if (value === '') {
      if (!spec.optional) return { error: { field: spec.id, message: `${spec.label} is required.` } };
      skipped ??= spec;
      continue;
    }
    if (skipped) return { error: { field: spec.id, message: `Fill ${skipped.label} first, or clear this.` } };
    const checked = checkField(spec, value);
    if (typeof checked !== 'string') return { error: { field: spec.id, message: checked.error } };
    parts.push(checked);
    sizes.push({ field: spec.id, size: checked.length });
  }
  const line = parts.join(' ');
  if (line.length > MAX_LINE) {
    // a line over the limit has at least one field: the command name and literal words are a few characters
    const longest = sizes.reduce((a, b) => (b.size > a.size ? b : a));
    return {
      error: { field: longest.field, message: `Too long: the line would be ${line.length} characters and the game keeps ${MAX_LINE}.` },
    };
  }
  return { line };
}
