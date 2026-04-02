// apps\game-client\src\features\plugins\core-plugins\brew.plugin.ts
import type { IPluginModule, PluginRuntimeApi } from '@shatteredarchive/types-client';

/**
 * Letter map (config textarea): one mapping per line.
 *   <LETTER> = <item name>
 * Example:
 *   C = cologne
 *   S = ill shard
 *   K = continual light
 *
 * Recipe list (config textarea): one recipe per line.
 *   <name> = <token> <token> ...
 * Tokens can be:
 *   - A single letter (A-Z) → resolved via letter map
 *   - A literal item name in single quotes: 'ill shard'
 *   - Quantity prefix: 2xC  or  3x'ill shard'
 * Example:
 *   health = 2xS C P V
 *   light  = 2x'ill shard' K
 *
 * Storage container (config string): where items are fetched from.
 *   shelf  (default)
 *
 * Aliases registered:
 *   brew <name>           — execute a saved recipe
 *   showbrews             — list all recipes
 *   showletters           — list all letter mappings
 */

// ── Types ─────────────────────────────────────────────────────────────────

interface LetterMap {
  [letter: string]: string; // uppercase letter → item name
}

interface RecipeMap {
  [name: string]: string[]; // recipe name → token array
}

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
 * Tokenizes a recipe string like: 2xS C P 3x'ill shard'
 * into: ['2xS', 'C', 'P', "3x'ill shard'"]
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
          tokens.push(s.slice(i, close + 1));
          i = close + 1;
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
        tokens.push(s.slice(i, close + 1));
        i = close + 1;
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
  light: boolean; // trailing * means continual light
}

function resolveToken(token: string, letterMap: LetterMap): BrewToken | null {
  let t = token.trim();
  let quantity = 1;
  let light = false;

  // strip trailing *
  if (t.endsWith('*')) {
    light = true;
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
    return { item, quantity, light };
  }

  return { item: t, quantity, light };
}

function executeBrew(
  recipeName: string,
  recipes: RecipeMap,
  letterMap: LetterMap,
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

    const { item, quantity, light } = resolved;

    for (let q = 0; q < quantity; q++) {
      api.sendCommand(`get '${item}' ${storage}`);
      api.sendCommand(`put '${item}' cauldron`);
    }

    if (light) {
      api.sendCommand(`cast 'continual light' '${item}'`);
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
  '# K = continual light',
].join('\n');

export const DEFAULT_RECIPE_CONFIG = [
  '# Define brew recipes',
  '# Format: name = token token ...',
  '# Tokens: letter, quoted item, or quantity prefix (2xS, 3x\'ill shard\')',
  '#',
  '# health = 2xS C P V',
  '# light  = 2x\'ill shard\' K',
].join('\n');

// ── Plugin ──────────────────────────────────────────────────────────────────

export function createBrewPlugin(): IPluginModule {
  return {
    manifest: {
      id: 'brew',
      name: 'Brew Helper',
      version: '0.1.0',
      description:
        'Automates potion brewing. Map letters to items, define recipes, then type: brew <name>',
    },

    configSchema: {
      defaults: {
        letterMap: DEFAULT_LETTER_MAP_CONFIG,
        recipes: DEFAULT_RECIPE_CONFIG,
        storage: 'shelf',
        debug: false,
      },
      fields: [
        {
          key: 'letterMap',
          type: 'textarea',
          label: 'Letter map',
          description: 'Map single letters to item names. One entry per line: LETTER = item name. Lines starting with # are comments.',
          placeholder: 'C = cologne\nS = ill shard\nK = continual light',
        },
        {
          key: 'recipes',
          type: 'textarea',
          label: 'Recipes',
          description:
            'Define brew recipes. One per line: name = tokens. Tokens: a letter, quoted item, or quantity like 2xS or 3x\'ill shard\'. Lines starting with # are comments.',
          placeholder: "health = 2xS C P V\nlight = 2x'ill shard' K",
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
      const storage = typeof cfg.storage === 'string' && cfg.storage.trim() ? cfg.storage.trim() : 'shelf';

      // brew <name>
      const brewMatch = trimmed.match(/^brew\s+(\S+)$/i);
      if (brewMatch) {
        executeBrew(brewMatch[1], recipes, letterMap, storage, api, debug);
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

      return false;
    },
  };
}
