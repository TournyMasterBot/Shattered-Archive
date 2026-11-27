import { COMMAND_CATALOG, type CatalogCommand } from './commandCatalog';
import type { FormSpec } from './commandSyntaxTypes';
import type { FieldValues } from './commandBuilder';

export type Confirmation = { required: false } | { required: true; scope: string };

/** Fields that hold a whole command line for the game to run on the owner's behalf (`at`, `force`). */
const INNER_COMMAND_FIELD = 'command';

/**
 * The first word of an inner command can be an abbreviation (the game runs the first table row the word is a prefix of), so a
 * word counts as a destructive command when it is a prefix of any destructive command name or hidden alias.
 */
function innerDestructive(word: string): CatalogCommand | undefined {
  const w = word.toLowerCase();
  if (w === '') return undefined;
  return COMMAND_CATALOG.find(
    (c) => c.syntax.destructive && [c.name, ...c.aliases, ...c.hiddenAliases].some((name) => name.startsWith(w)),
  );
}

/**
 * Whether sending this form needs the owner's confirmation, and the text that names what is at stake (S11, E21, ADMIN-02).
 * A form marked `safe` (it only reads or explains) never asks. Otherwise it asks for: a command marked destructive, a form marked always-confirm, a bulk value (`all`) or wildcard in any argument,
 * and an inner command (`at ... purge`) that is itself destructive. A value typed into a free-text field and one picked from a list
 * are the same value, so both ask.
 */
export function needsConfirmation(command: CatalogCommand, form: FormSpec, values: FieldValues): Confirmation {
  if (form.safe) return { required: false };
  const scope: string[] = [];
  if (form.confirm) scope.push(form.confirmText ?? `"${command.name}" changes the game.`);
  for (const rule of form.bulk ?? []) {
    const value = (values[rule.field] ?? '').trim().toLowerCase();
    const hit = rule.kind === 'wildcard' ? value.includes('*') : (rule.values ?? []).includes(value);
    if (hit) scope.push(`"${value}" widens this to ${rule.scope}.`);
  }
  const inner = form.fields.some((f) => f.id === INNER_COMMAND_FIELD)
    ? innerDestructive((values[INNER_COMMAND_FIELD] ?? '').trim().split(/\s+/)[0])
    : undefined;
  if (inner) scope.push(`It runs "${inner.name}", which is a destructive command.`);
  if (command.syntax.destructive && scope.length === 0) {
    scope.push(`"${command.name}" changes a player or the server and cannot be undone from this panel.`);
  }
  return scope.length > 0 ? { required: true, scope: scope.join(' ') } : { required: false };
}
