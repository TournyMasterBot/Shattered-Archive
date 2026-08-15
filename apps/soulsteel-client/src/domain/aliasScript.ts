import { compiledBagSetupCommands } from './bagPlan.js';
import type { BagEntry, RoleDef } from './types.js';

/**
 * Mirrors `apps/game-client/src/features/userScripts`' `UserScriptLanguage` — kept as a local
 * copy rather than a cross-app import since soulsteel-client has no dependency on game-client and
 * this is the only shape it needs from it. Verified against that app's `types.ts`/`runtime.ts`/
 * `luaRuntime.ts`/`pythonRuntime.ts`: all four scripting languages bridge the same camelCase
 * `doAfter(delayMs, 'world' | 'alias', command)` call (Lua and Python register it as a bare
 * global, same name, no snake_case renaming); `text` has no scripting at all — it just sends
 * every non-empty line as a command, with no delay between them.
 */
export type UserScriptLanguage = 'text' | 'javascript' | 'typescript' | 'lua' | 'python';

export const SCRIPT_LANGUAGES: readonly UserScriptLanguage[] = ['text', 'javascript', 'typescript', 'lua', 'python'];

export const LANGUAGE_LABELS: Record<UserScriptLanguage, string> = {
  text: 'Text',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  lua: 'Lua',
  python: 'Python',
};

/** Default milliseconds between staggered `doAfter` calls — a Herald can override this per room
 * (`RoomState.commandDelayMs`) if the real server needs more (or can tolerate less) breathing
 * room between commands. */
export const DEFAULT_COMMAND_DELAY_MS = 350;

const COMMENT_PREFIX: Record<Exclude<UserScriptLanguage, 'text'>, string> = {
  javascript: '//',
  typescript: '//',
  lua: '--',
  python: '#',
};

function escapeStringLiteral(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/**
 * Converts a flat list of in-game commands (one per line, e.g. from `compiledBagSetupCommands`)
 * into the source for an alias userscript that sends them via `doAfter`, staggered by
 * `delayMs` per line — scripts here run as a plain non-async function with no blocking sleep, so
 * a staggered `doAfter` chain is the only way to space commands out. `text`-language scripts have
 * no scripting surface at all (no delay to configure): every non-empty line is just sent as-is,
 * back to back, matching this engine's plain-text runner (`runPlainText`).
 */
export function bagSetupAliasSource(
  commands: string,
  language: UserScriptLanguage,
  delayMs: number = DEFAULT_COMMAND_DELAY_MS,
): string {
  const lines = commands.split('\n').filter((line) => line.length > 0);
  if (language === 'text') return lines.join('\n');

  const header = `${COMMENT_PREFIX[language]} Soulsteel bag setup — generated, one doAfter() per game command.`;
  const statementEnd = language === 'javascript' || language === 'typescript' ? ';' : '';
  const calls = lines.map(
    (line, i) => `doAfter(${i * delayMs}, "world", "${escapeStringLiteral(line)}")${statementEnd}`,
  );

  return [header, '', ...calls].join('\n');
}

/** Suggested alias word for the generated bag-setup script — deliberately two words to make an
 * accidental collision with a player's existing single-word alias unlikely. */
export const BAG_SETUP_ALIAS = 'setup soulsteel';

/**
 * A small placeholder role/bag plan, used only to generate the userscript TEMPLATE below — a
 * worked example of the actual "write a parchment, bag it, then gather every bag into the
 * aggregate container" flow (`compiledBagSetupCommands`), fed illustrative roles instead of a
 * real room's. Running the real generator against placeholder data (rather than hand-authoring a
 * separate, unrelated example) means the template can never drift out of sync with what the
 * populated alias script actually produces — it's the same function either way.
 */
const EXAMPLE_ROLES: readonly RoleDef[] = [
  {
    id: 'example-role-a',
    name: 'Example Role A',
    alignment: 'neutral',
    builtin: false,
    description: 'Whatever text this role should reveal to the player who draws it.',
  },
  {
    id: 'example-role-b',
    name: 'Example Role B',
    alignment: 'neutral',
    builtin: false,
    description: 'A second example role, revealing different text.',
  },
];
const EXAMPLE_BAGS: readonly BagEntry[] = [
  { number: 1, roleId: 'example-role-a' },
  { number: 2, roleId: 'example-role-b' },
];
const EXAMPLE_BAG_KEYWORD = 'sack';
const EXAMPLE_MASTER_BAG_KEYWORD = 'chest';

/**
 * The userscript template shown for any language: the real bag-setup pipeline, run against the
 * placeholder roles/bags above instead of a real room, so it stays useful as portable reference
 * material (for this room later, or for any other MUD client with a similar scripting engine)
 * without being generic filler unrelated to what the feature actually does.
 */
export function exampleBagSetupSource(
  language: UserScriptLanguage,
  delayMs: number = DEFAULT_COMMAND_DELAY_MS,
): string {
  const commands = compiledBagSetupCommands(EXAMPLE_ROLES, EXAMPLE_BAGS, EXAMPLE_BAG_KEYWORD, EXAMPLE_MASTER_BAG_KEYWORD);
  return bagSetupAliasSource(commands, language, delayMs);
}
