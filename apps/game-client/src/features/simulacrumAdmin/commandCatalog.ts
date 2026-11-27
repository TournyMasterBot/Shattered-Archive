import { GENERATED_COMMANDS, type GeneratedCommand } from './commandTable.generated';
import { COMMAND_SYNTAX } from './commandSyntax';
import type { CommandGroup, CommandSyntax } from './commandSyntaxTypes';

export interface CatalogCommand extends GeneratedCommand {
  syntax: CommandSyntax;
}

export interface CatalogBuild {
  commands: CatalogCommand[];
  /** Generated commands with no syntax entry (ADMIN-01: the catalog test fails on any). */
  missingSyntax: string[];
  /** Syntax entries with no generated command. */
  orphanSyntax: string[];
}

/** Joins the generated table with the hand-written syntax. Pure so the drift cases can be tested with fixtures. */
export function buildCatalog(
  generated: readonly GeneratedCommand[],
  syntax: Readonly<Record<string, CommandSyntax>>,
): CatalogBuild {
  const commands: CatalogCommand[] = [];
  const missingSyntax: string[] = [];
  for (const command of generated) {
    const entry = syntax[command.name];
    if (entry) commands.push({ ...command, syntax: entry });
    else missingSyntax.push(command.name);
  }
  const known = new Set(generated.map((c) => c.name));
  const orphanSyntax = Object.keys(syntax).filter((name) => !known.has(name));
  return { commands, missingSyntax, orphanSyntax };
}

export const COMMAND_CATALOG: readonly CatalogCommand[] = buildCatalog(GENERATED_COMMANDS, COMMAND_SYNTAX).commands;

/** Looks a command up by its name or one of its listed aliases (`teleport` finds `transfer`). Hidden aliases are not found. */
export function findCatalogCommand(name: string): CatalogCommand | undefined {
  const wanted = name.toLowerCase();
  return COMMAND_CATALOG.find((c) => c.name === wanted || c.aliases.includes(wanted));
}

export const GROUP_ORDER: readonly CommandGroup[] = ['players', 'world', 'server', 'communication', 'inspection', 'settings'];

export const GROUP_LABELS: Readonly<Record<CommandGroup, string>> = {
  players: 'Players',
  world: 'World',
  server: 'Server',
  communication: 'Communication',
  inspection: 'Inspection',
  settings: 'My settings',
};

/** Commands of one group in name order. */
export function commandsInGroup(group: CommandGroup): CatalogCommand[] {
  return COMMAND_CATALOG.filter((c) => c.syntax.group === group);
}
