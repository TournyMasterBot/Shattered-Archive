// apps\game-client\src\features\plugins\core-plugins\brew.plugin.ts
import type { IPluginModule, PluginRuntimeApi } from '@shatteredarchive/types-client';

/**
 * Letter map (config textarea): one mapping per line.
 *   <LETTER> = <item name>
 * Example:
 *   C = cologne
 *   S = ill shard
 *
 * Recipe list (config textarea): one recipe per line.
 *   <name> = <token> <token> ...
 * Tokens can be:
 *   - A single letter (A-Z) → resolved via letter map
 *   - A literal item name in single quotes: 'ill shard'
 *   - Quantity prefix: 2xC  or  3x'ill shard'
 *   - Trailing *: cast the spell mapped to * in Symbol shortcuts, on the item, between get and put
 * Example:
 *   health = 2xS C P V
 *   light  = 2x'ill shard'* K
 *
 * Symbol map (config textarea): one mapping per line.
 *   <symbol> = <spell name>
 * Supported symbols: ! @ $ % ^ & *  (# is reserved as the comment character)
 * Append a symbol to any recipe token to cast that spell on the item before putting it in.
 * Example:
 *   * = continual light   →  K K*  casts continual light on the 2nd K item
 *   % = invis             →  K K%  casts invis on the 2nd K item
 *
 * Storage container (config string): where items are fetched from.
 *   shelf  (default)
 *
 * Aliases registered:
 *   brew <name>           — execute a saved recipe
 *   showbrews             — list all recipes
 *   showletters           — list all letter mappings
 *   showsymbols           — list configured symbol → spell mappings
 */

// ── Types ─────────────────────────────────────────────────────────────────

interface LetterMap {
  [letter: string]: string; // uppercase letter → item name
}

interface RecipeMap {
  [name: string]: string[]; // recipe name → token array
}

interface SymbolMap {
  [symbol: string]: string; // symbol character → spell name
}

const SUPPORTED_SYMBOLS = new Set(['!', '@', '$', '%', '^', '&', '*']); // # reserved as comment char

// ── Storage keys ───────────────────────────────────────────────────────────

function letterMapKey(connectionId: string) {
  return `brew.plugin.letterMap.${connectionId}`;
}

function recipesKey(connectionId: string) {
  return `brew.plugin.recipes.${connectionId}`;
}

// ── Persistence ────────────────────────────────────────────────────────────

function loadLetterMap(connectionId: string): LetterMap {
  try {
    const raw = localStorage.getItem(letterMapKey(connectionId));
    return raw ? (JSON.parse(raw) as LetterMap) : {};
  } catch {
    return {};
  }
}

function saveLetterMap(connectionId: string, map: LetterMap) {
  localStorage.setItem(letterMapKey(connectionId), JSON.stringify(map));
}

function loadRecipes(connectionId: string): RecipeMap {
  try {
    const raw = localStorage.getItem(recipesKey(connectionId));
    return raw ? (JSON.parse(raw) as RecipeMap) : {};
  } catch {
    return {};
  }
}

function saveRecipes(connectionId: string, map: RecipeMap) {
  localStorage.setItem(recipesKey(connectionId), JSON.stringify(map));
}

// ── Parsing helpers ─────────────────────────────────────────────────────────

function parseLetterMapConfig(raw: unknown): LetterMap {
  if (typeof raw !== 'string') return {};
  const map: LetterMap = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const letter = trimmed.slice(0, eqIdx).trim().toUpperCase();
    const item = trimmed.slice(eqIdx + 1).trim();
    if (letter.length === 1 && item) map[letter] = item;
  }
  return map;
}

function parseSymbolMapConfig(raw: unknown): SymbolMap {
  if (typeof raw !== 'string') return {};
  const map: SymbolMap = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const symbol = trimmed.slice(0, eqIdx).trim();
    const spell = trimmed.slice(eqIdx + 1).trim();
    if (SUPPORTED_SYMBOLS.has(symbol) && spell) map[symbol] = spell;
  }
  return map;
}

function parseRecipeConfig(raw: unknown): RecipeMap {
  if (typeof raw !== 'string') return {};
  const map: RecipeMap = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const name = trimmed.slice(0, eqIdx).trim().toLowerCase();
    const tokenStr = trimmed.slice(eqIdx + 1).trim();
    if (!name || !tokenStr) continue;
    map[name] = tokenizeRecipe(tokenStr);
  }
  return map;
}

/**
 * Tokenizes a recipe string like: 2xS C P 3x'ill shard'* K
 * into: ['2xS', 'C', 'P', "3x'ill shard'*", 'K']
 * A trailing symbol (!@#$%^&*) is preserved as part of the token and names the spell
 * to cast on that item before putting it in the cauldron.
 */
function tokenizeRecipe(s: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && s[i] === ' ') i++;
    if (i >= s.length) break;

    // quantity prefix like 2x or 3x followed by quoted/unquoted item
    const qtyMatch = s.slice(i).match(/^(\d+)x/i);
    if (qtyMatch) {
      const qtyStr = qtyMatch[0];
      const after = i + qtyStr.length;
      if (s[after] === "'") {
        const close = s.indexOf("'", after + 1);
        if (close !== -1) {
          let end = close + 1;
          if (SUPPORTED_SYMBOLS.has(s[end])) end++;
          tokens.push(s.slice(i, end));
          i = end;
          continue;
        }
      }
      // unquoted word after quantity
      const space = s.indexOf(' ', after);
      const end = space === -1 ? s.length : space;
      tokens.push(s.slice(i, end));
      i = end;
      continue;
    }

    // quoted literal
    if (s[i] === "'") {
      const close = s.indexOf("'", i + 1);
      if (close !== -1) {
        let end = close + 1;
        if (SUPPORTED_SYMBOLS.has(s[end])) end++;
        tokens.push(s.slice(i, end));
        i = end;
        continue;
      }
    }

    // plain word (single letter or unquoted name)
    const space = s.indexOf(' ', i);
    const end = space === -1 ? s.length : space;
    tokens.push(s.slice(i, end));
    i = end;
  }
  return tokens.filter((t) => t.length > 0);
}

// ── Brew execution ──────────────────────────────────────────────────────────

interface BrewToken {
  item: string;
  quantity: number;
  symbolSuffix: string | null; // trailing symbol → cast that mapped spell on the item before putting it in
}

function resolveToken(token: string, letterMap: LetterMap): BrewToken | null {
  let t = token.trim();
  let quantity = 1;
  let symbolSuffix: string | null = null;

  // strip trailing symbol (!@#$%^&*)
  const lastChar = t[t.length - 1];
  if (lastChar && SUPPORTED_SYMBOLS.has(lastChar)) {
    symbolSuffix = lastChar;
    t = t.slice(0, -1);
  }

  // quantity prefix
  const qtyMatch = t.match(/^(\d+)x(.+)$/i);
  if (qtyMatch) {
    quantity = parseInt(qtyMatch[1], 10);
    t = qtyMatch[2];
  }

  // strip surrounding quotes
  if (t.startsWith("'") && t.endsWith("'")) {
    t = t.slice(1, -1);
  }

  // single uppercase letter → letter map lookup
  if (t.length === 1 && /[A-Z]/i.test(t)) {
    const item = letterMap[t.toUpperCase()];
    if (!item) return null;
    return { item, quantity, symbolSuffix };
  }

  return { item: t, quantity, symbolSuffix };
}

function executeBrew(
  recipeName: string,
  recipes: RecipeMap,
  letterMap: LetterMap,
  symbolMap: SymbolMap,
  storage: string,
  api: PluginRuntimeApi,
  debug: boolean,
) {
  const tokens = recipes[recipeName.toLowerCase()];
  if (!tokens) {
    api.log(`[Brew] No recipe found for '${recipeName}'. Use the configure panel to add recipes.`);
    return;
  }

  if (debug) api.log(`[Brew] Brewing '${recipeName}': ${tokens.join(' ')}`);

  for (const token of tokens) {
    const resolved = resolveToken(token, letterMap);
    if (!resolved) {
      api.log(`[Brew] Could not resolve token '${token}' — check your letter map.`);
      continue;
    }

    const { item, quantity, symbolSuffix } = resolved;
    const spell = symbolSuffix ? symbolMap[symbolSuffix] : null;

    if (symbolSuffix && !spell) {
      api.log(`[Brew] Token '${token}' uses '${symbolSuffix}' but no spell is mapped to it in Symbol shortcuts.`);
    }

    for (let q = 0; q < quantity; q++) {
      api.sendCommand(`get '${item}' ${storage}`);
      if (spell) {
        api.sendCommand(`cast '${spell}' '${item}'`);
      }
      api.sendCommand(`put '${item}' cauldron`);
    }
  }
}

// ── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_LETTER_MAP_CONFIG = [
  '# Map a single letter to an item name',
  '# Format: LETTER = item name',
  '#',
  '# C = cologne',
  '# S = ill shard',
].join('\n');

export const DEFAULT_RECIPE_CONFIG = [
  '# Define brew recipes',
  '# Format: name = token token ...',
  "# Tokens: letter, quoted item, or quantity prefix (2xS, 3x'ill shard')",
  "# Append a symbol (!@$%^&*) to any token to cast that symbol's spell on the item between get and put",
  '# Examples: K K*  (continual light on 2nd K)   K K%  (invis on 2nd K)   K K@  (curse on 2nd K)',
  '#',
  '# health = 2xS C P V',
  "# light  = 2x'ill shard'* K",
].join('\n');

export const DEFAULT_SYMBOL_MAP_CONFIG = [
  '# Symbol map — append a symbol to a recipe token to cast that spell on the item before putting it in',
  '# Supported symbols: ! @ $ % ^ & *  (# is the comment character and cannot be used)',
  '# Format: symbol = spell name',
  '#',
  '* = continual light',
  '! = invis',
  '@ = curse',
  '# $ = ',
  '# % = ',
  '# ^ = ',
  '# & = ',
].join('\n');

// ── Plugin ──────────────────────────────────────────────────────────────────

export function createBrewPlugin(): IPluginModule {
  return {
    manifest: {
      id: 'brew',
      name: 'Brew Helper',
      version: '0.1.0',
      description: 'Automates potion brewing. Map letters to items, define recipes, then type: brew <name>',
    },

    configSchema: {
      defaults: {
        letterMap: DEFAULT_LETTER_MAP_CONFIG,
        recipes: DEFAULT_RECIPE_CONFIG,
        symbolMap: DEFAULT_SYMBOL_MAP_CONFIG,
        storage: 'shelf',
        debug: false,
      },
      fields: [
        {
          key: 'letterMap',
          type: 'textarea',
          label: 'Letter map',
          description:
            'Map single letters to item names. One entry per line: LETTER = item name. Lines starting with # are comments.',
          placeholder: 'C = cologne\nS = ill shard',
        },
        {
          key: 'recipes',
          type: 'textarea',
          label: 'Recipes',
          description:
            "Define brew recipes. One per line: name = tokens. Tokens: a letter, quoted item, or quantity like 2xS or 3x'ill shard'. Append any symbol (!@$%^&*) to a token to cast that symbol's mapped spell on the item between get and put. Lines starting with # are comments.",
          placeholder: "health = 2xS C P V\nlight = 2x'ill shard' K",
        },
        {
          key: 'symbolMap',
          type: 'textarea',
          label: 'Symbol map',
          description:
            'Map symbols to spell names. Supported: ! @ $ % ^ & * (# is the comment character). One entry per line: symbol = spell name. Append the symbol to any recipe token to cast that spell on the item before putting it in the cauldron.',
          placeholder: '* = continual light\n! = invis\n@ = curse',
        },
        {
          key: 'storage',
          type: 'string',
          label: 'Storage container',
          description: 'Where items are fetched from (e.g. shelf, rack, pit).',
          placeholder: 'shelf',
        },
        {
          key: 'debug',
          type: 'boolean',
          label: 'Debug logging',
          description: 'Logs recipe execution details to the script console.',
        },
      ],
    },

    onAlias(api: PluginRuntimeApi, input: string): boolean | undefined {
      const trimmed = input.trim();
      const cfg = api.getConfig();
      const debug = cfg.debug === true;

      const letterMap = parseLetterMapConfig(cfg.letterMap);
      const recipes = parseRecipeConfig(cfg.recipes);
      const symbolMap = parseSymbolMapConfig(cfg.symbolMap);
      const storage = typeof cfg.storage === 'string' && cfg.storage.trim() ? cfg.storage.trim() : 'shelf';

      // brew <name>
      const brewMatch = trimmed.match(/^brew\s+(\S+)$/i);
      if (brewMatch) {
        executeBrew(brewMatch[1], recipes, letterMap, symbolMap, storage, api, debug);
        return true;
      }

      // showbrews
      if (/^showbrews$/i.test(trimmed)) {
        const names = Object.keys(recipes);
        if (names.length === 0) {
          api.log('[Brew] No recipes saved. Add some in the configure panel.');
        } else {
          api.log('[Brew] Saved recipes:');
          for (const [name, tokens] of Object.entries(recipes)) {
            api.log(`  ${name} = ${tokens.join(' ')}`);
          }
        }
        return true;
      }

      // showletters
      if (/^showletters$/i.test(trimmed)) {
        const entries = Object.entries(letterMap);
        if (entries.length === 0) {
          api.log('[Brew] No letter mappings. Add some in the configure panel.');
        } else {
          api.log('[Brew] Letter map:');
          for (const [letter, item] of entries) {
            api.log(`  ${letter} = ${item}`);
          }
        }
        return true;
      }

      // showsymbols
      if (/^showsymbols$/i.test(trimmed)) {
        api.log('[Brew] Symbol map — append to a recipe token to cast on item before put (! @ $ % ^ & *):');
        for (const sym of SUPPORTED_SYMBOLS) {
          const spell = symbolMap[sym];
          if (spell) {
            api.log(`  ${sym} → cast '${spell}' on item`);
          } else {
            api.log(`  ${sym} → (not configured)`);
          }
        }
        api.log('[Brew] Configure in the plugin settings under "Symbol map".');
        return true;
      }

      return false;
    },
  };
}
