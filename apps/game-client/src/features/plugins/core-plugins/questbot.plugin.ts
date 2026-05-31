// apps/game-client/src/features/plugins/core-plugins/questbot.plugin.ts
//
// Automates the full DSL quest cycle:
//   pq start  → walk to quest master → request quest → parse assignment
//             → navigate to area → comb for item → turn in → rest
//
// Adapted from QuestBot.lua (DSL community).
//
// Aliases:
//   pq start   — enable and begin questing
//   pq stop    — disable, reset state
//   pq status  — print current state
//   pq debug   — toggle debug logging

import type { IPluginModule, PluginRuntimeApi } from '@shatteredarchive/types-client';

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripAnsi(s: string): string {
  if (!s || !s.includes('\x1b')) return s;
  return s.replace(/\[[0-9;]*m/g, '');
}

// ── Item map ──────────────────────────────────────────────────────────────────
// Maps the full item name from the quest dialogue to the in-game keyword.

const ITEM_KEYWORDS: Record<string, string> = {
  'a valuable painting': 'painting',
  'a bright green emerald': 'emerald',
  'the crown jewels': 'crown',
  "the king's sceptre": 'sceptre',
  'a blue diamond shard': 'shard',
};

// Strings that signal successful pickup of any quest item.
const PICKUP_PATTERNS = [
  'You get a valuable painting.',
  'You get the Crown Jewels.',
  "You get the King's sceptre.",
  'You get a bright green emerald.',
  'You get a Blue diamond shard.',
];

// ── Character home paths ──────────────────────────────────────────────────────

type HomeKey = 'wargar' | 'thaxanos' | 'shadow' | 'darkonin' | 'verm';

type CharacterPaths = {
  quest_master: string[];
  to_quest_master: string[];
  to_resting_room: string[];
  rest_command: string[];
  justice_bind: string[];
  icewall_port: string[];
  alth_port: string[];
  alth_arena: string[];
  tropica_port: string[];
  succubus: string[];
};

const HOME_PATHS: Record<HomeKey, CharacterPaths> = {
  wargar: {
    quest_master: ['d','n','ne','nw','nw','nw','w','n','n','e','e','n','n','n','n','n','n','w','w','s'],
    to_quest_master: ['get bees pit','stand','c fly','c sanc','c pass','e','d','s','u','n','ne','nw','nw','nw','w','n','n','e','e','n','n','n','n','n','n','w','w','s','pq clear','pq request find'],
    to_resting_room: ['n','e','e','s','s','s','s','s','s','w','w','s','s','e','se','se','se','sw','s','d','n','u','w'],
    rest_command: ['land','wear helm','rest pew','put bees pit'],
    justice_bind: ['n','e','e','s','s','s','s','s','s','w','w','s','s','e','se','se','se','sw','s','d','n','u','w','stand','w','enter ark','e','e','e','e','e'],
    icewall_port: ['n','e','e','s','s','s','s','s','s','w','w','s','s','e','se','se','se','sw','s','d','n','u','w','stand','w','enter ice'],
    alth_port: ['n','e','e','s','s','s','s','s','s','w','w','s','s','e','se','se','se','sw','s','d','n','u','w','stand','w','enter new'],
    alth_arena: ['n','e','e','s','s','s','s','s','s','w','w','s','s','e','se','se','se','sw','s','d','n','u','w','stand','w','enter gaming','enter portal'],
    tropica_port: ['n','e','e','s','s','s','s','s','s','w','w','s','s','e','se','se','se','sw','s','d','n','u','w','stand','w','enter tropica'],
    succubus: ['c gate bloody nose'],
  },
  thaxanos: {
    quest_master: ['n','n','n','n','e','s'],
    to_quest_master: ['stand','c fly','c sanc','c pass','s','s','pq clear','pq request find'],
    to_resting_room: ['n','n'],
    rest_command: ['wear helm','rest slab'],
    justice_bind: ['n','w','w','w','w','s','s','s','s','e','e','n','d','e','e','enter ark','e','e','e','e','e'],
    icewall_port: ['n','w','w','w','w','s','s','s','s','e','e','n','d','e','e','enter ice'],
    alth_port: ['n','w','w','w','w','s','s','s','s','e','e','n','d','e','e','enter new'],
    alth_arena: ['n','w','w','w','w','s','s','s','s','e','e','n','d','e','e','enter gaming','enter portal'],
    tropica_port: ['n','w','w','w','w','s','s','s','s','e','e','n','d','e','e','enter tropica'],
    succubus: ['c gate bloody nose'],
  },
  shadow: {
    quest_master: ['se','e','s','s','s','s','s','s','s','w','sw','s','e','se','e','e','n','enter orb','d','e','n','w','w','w','w','w','n','n','n','n','nw'],
    to_quest_master: ['get bees shelf','stand','c fly','c pass','c sanc','enter orb','d','e','n','w','w','w','w','w','n','n','n','n','nw','pq clear','pq request find'],
    to_resting_room: ['se','s','s','s','s','e','e','e','e','e','s','w','u','enter orb'],
    rest_command: ['wear helm','land','rest blanket'],
    justice_bind: ['se','s','s','s','s','e','e','e','e','e','s','w','u','enter orb','s','d','enter ark','e','e','e','e','e'],
    icewall_port: ['se','s','s','s','s','e','e','e','e','e','s','w','u','enter orb','s','d','enter ice'],
    alth_port: ['se','s','s','s','s','e','e','e','e','e','s','w','u','enter orb','s','d','enter alth'],
    alth_arena: ['se','s','s','s','s','e','e','e','e','e','s','w','u','enter orb','s','d','enter gaming','enter portal'],
    tropica_port: ['se','s','s','s','s','e','e','e','e','e','s','w','u','enter orb','s','d','enter tropica'],
    succubus: ['c gate bloody nose'],
  },
  darkonin: {
    quest_master: ['e','e'],
    to_quest_master: ['stand','c fly','c pass','c sanc','s','e','pq clear','pq request find'],
    to_resting_room: ['w','n'],
    rest_command: ['stand'],
    justice_bind: ['w','s','s','s','w','n','n','w','n','enter ark','e','e','e','e','e'],
    icewall_port: ['w','s','s','s','w','n','n','w','n','enter ice'],
    alth_port: ['w','s','s','s','w','n','n','w','n','enter alth'],
    alth_arena: ['w','s','s','s','w','n','n','w','n','enter gaming','enter portal'],
    tropica_port: ['w','s','s','s','w','n','n','w','n','enter tropica'],
    succubus: ['c gate bloody nose'],
  },
  verm: {
    quest_master: ['n','nw'],
    to_quest_master: ['stand','c fly','c pass','c sanc','s','e','pq clear','pq request find'],
    to_resting_room: ['se','s','s','w','w','n','e','n','n','w','w','w','n','n','n','n','n','w','w'],
    rest_command: ['land','wear helm','rest cot'],
    justice_bind: ['se','s','s','w','w','n','e','n','n','w','w','w','n','n','n','n','n','w','w','w','d','enter ark','e','e','e','e','e'],
    icewall_port: ['se','s','s','w','w','n','e','n','n','w','w','w','n','n','n','n','n','w','w','w','d','enter ice'],
    alth_port: ['se','s','s','w','w','n','e','n','n','w','w','w','n','n','n','n','n','w','w','w','d','enter alth'],
    alth_arena: ['se','s','s','w','w','n','e','n','n','w','w','w','n','n','n','n','n','w','w','w','d','enter gaming','enter portal'],
    tropica_port: ['se','s','s','w','w','n','e','n','n','w','w','w','n','n','n','n','n','w','w','w','d','enter tropica'],
    succubus: ['c gate bloody nose'],
  },
};

// ── Quest area database ───────────────────────────────────────────────────────

type QuestArea = {
  start_point: keyof CharacterPaths;
  start_to_area: string[];
  walk_paths: Record<string, string[]>;
};

const QUEST_AREAS: Record<string, QuestArea> = {
  'gahboom hill': {
    start_point: 'justice_bind',
    start_to_area: ['wear bees','s','s','s','e','s','s','w','w','s','s','s','s','e','s','e','n','n','n','n','w','w','w','s','se','e','se','se','n','ne','nw','sw','s','e','n','n','n','n','n','n','d'],
    walk_paths: {
      'philosophy guild': ['e','e','e','e','e','e','n','w','w','w','w','w','s'],
      'an uneven, hot corridor': ['d','n','n','se','se','e','nw','nw','e','e','s','s','e'],
      'a stone slab platform in fling-fall cavern': ['d'],
      'a room of mirrors': ['w','w','w','nw','s','nw','e','sw','ne','n'],
      'laboratory a534b': ['pq clear','pq request find'],
      'a long bare hallway': ['e','e','e','e','e'],
    },
  },
  'elemental planes': {
    start_point: 'succubus',
    start_to_area: ['d','d','w','w','w','w','d','d','d','d','d'],
    walk_paths: {
      'on the elemental plane of fire': ['ne','ne','e','e','e','n','w','w','w','n','e','e','n','s','w','w','w'],
      'on the elemental plane of air': ['nw','nw','w','w','w','n','e','e','e','n','w','w','w','n','e','e','e'],
      'on the elemental plane of earth': ['se','se','e','e','e','s','w','w','w','s','e','e','e','s','w','w','w'],
      'on the elemental plane of water': ['sw','sw','w','w','w','s','e','e','e','s','w','w','w','s','e','e','e'],
    },
  },
  hell: {
    start_point: 'succubus',
    start_to_area: [],
    walk_paths: {
      'the storage room': ['s','s','w','s','s'],
      "lawyer's office": ['w','w','s','w','w','w','w','w','s','w'],
      'office of the high priest': ['w','w','s','w','w','n','e'],
      'near the hearth of hell': ['s','s','w','s','w'],
      'a large hallway': ['s','s','w'],
      'the end of a large hallway': ['s','s','w','s'],
    },
  },
  'silversand garrison': {
    start_point: 'alth_port',
    start_to_area: ['w','s','s','w','w','w','w','sw','s','s','s','w','sw','s','s','s','w','s','sw'],
    walk_paths: {
      'silversand garrison': ['e'],
    },
  },
  'ghost lake': {
    start_point: 'alth_arena',
    start_to_area: ['e','e','e','s','s','w','n','w','n','n','n','nw','w','w','w','w','w','w','w','w','s','s','sw','nw','d','n'],
    walk_paths: {
      'a deep crevice': ['d','n','n','n','n','d','d','se'],
      'deep in a mist filled lake': ['n','n','n','n','d','n','n','w','e','n','e','n','s','s','w'],
    },
  },
  'a lost catacomb': {
    start_point: 'tropica_port',
    start_to_area: ['sw','w','nw','w','nw','w','s','s','se','se','se','se','sw','se','se','se','w','nw','w','s','w','w','w','w','s','w','s','s','w'],
    walk_paths: {
      'main bedroom': ['enter mau','e','e','e','e','s','s','s','s','d','e','e','s','s','w','w','n','d','s','s','s','s','e','e','e'],
    },
  },
  'forbidden forest': {
    start_point: 'icewall_port',
    start_to_area: ['ne','e','ne','n','n','ne','n','n','n','n','n'],
    walk_paths: {
      'a snow covered field': ['w'],
    },
  },
  'a blazing aurora': {
    start_point: 'justice_bind',
    start_to_area: ['e','ne','n','ne','e','e','ne','n','n','n','n','n','n','n','op e','e','n','u','enter aurora'],
    walk_paths: {
      'the silver ascent': ['nw','nw','n','n','n','e','e','u','nw','u'],
    },
  },
  jovar: {
    start_point: 'icewall_port',
    start_to_area: ['nw','nw','w','w','nw','n','nw','e','n','u','u','w','u','u','n','n','n'],
    walk_paths: {
      'throne room': ['n','n','n','n','n'],
      'residence': ['w','e','e'],
      'before the palace gates': ['n','n'],
      'beyond the gates': ['n','n','n'],
      'guest quarters': ['n','n','n','n','w','w','w','e','e','e','e','e','e'],
      'stable': ['n','n','n','n','e','e','n','n'],
      'armory': ['n','n','e','e','s'],
      'weapon shop': ['n','n','e','e','e'],
      'smithy': ['n','n','e','e','n'],
      'the planning room': ['n','n','e','e','n','w'],
    },
  },
};

// ── Custom area parsing ───────────────────────────────────────────────────────
// Users define additional areas as a JSON array in the config textarea.
// Each entry shape (friendly names mirror the internal QuestArea type):
//   {
//     "name":        "area name as the quest master speaks it",
//     "startPoint":  "icewall_port",           — one of the CharacterPaths keys
//     "startToArea": ["n","n","e"],             — commands from the port to the area entrance
//     "rooms": {
//       "room name as quest master speaks it": ["n","e","s"]
//     }
//   }

type CustomAreaDef = {
  name: string;
  startPoint: string;
  startToArea: string[];
  rooms: Record<string, string[]>;
};

function parseCustomAreas(raw: unknown): Record<string, QuestArea> {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return {};
    const out: Record<string, QuestArea> = {};
    for (const entry of parsed) {
      const name = String(entry?.name ?? '').trim().toLowerCase();
      const startPoint = String(entry?.startPoint ?? '').trim() as keyof CharacterPaths;
      if (!name || !startPoint) continue;
      out[name] = {
        start_point: startPoint,
        start_to_area: Array.isArray(entry.startToArea) ? entry.startToArea.map(String) : [],
        walk_paths: {},
      };
      if (entry.rooms && typeof entry.rooms === 'object') {
        for (const [room, path] of Object.entries(entry.rooms)) {
          if (Array.isArray(path)) {
            out[name].walk_paths[room.toLowerCase()] = path.map(String);
          }
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

function getAreas(api: PluginRuntimeApi): Record<string, QuestArea> {
  const custom = parseCustomAreas(api.getConfig().customAreas);
  // Custom entries override built-ins with the same name
  return { ...QUEST_AREAS, ...custom };
}

// ── State ─────────────────────────────────────────────────────────────────────

type BotState = 'idle' | 'requesting' | 'capturing' | 'navigating' | 'combing' | 'turning-in';

// ── Plugin factory ─────────────────────────────────────────────────────────────

export function createQuestBotPlugin(): IPluginModule {
  let running = false;
  let state: BotState = 'idle';
  let item: string | null = null;
  let itemKeyword: string | null = null;
  let questArea: string | null = null;
  let questRoom: string | null = null;

  function walk(api: PluginRuntimeApi, cmds: string[]): void {
    for (const cmd of cmds) api.sendCommand(cmd);
  }

  // Execute a named alias through the full alias pipeline (same as typing it in the input bar).
  // Falls back to sendCommand if the runtime isn't available.
  function runAlias(api: PluginRuntimeApi, aliasName: string): void {
    const runtime = (window as any).__SA_RUNTIME__?.runtime;
    if (runtime && typeof runtime.executeAlias === 'function') {
      runtime.executeAlias(aliasName);
    } else {
      api.sendCommand(aliasName);
    }
  }

  function getPaths(api: PluginRuntimeApi): CharacterPaths | null {
    const loc = (api.getConfig().homeLocation as HomeKey) || 'wargar';
    return HOME_PATHS[loc] ?? null;
  }

  function debug(api: PluginRuntimeApi, msg: string): void {
    if (api.getConfig().debug) api.writeTerminal?.(`{D[QuestBot] ${msg}{x\n`);
  }

  function resetQuest(): void {
    item = null;
    itemKeyword = null;
    questArea = null;
    questRoom = null;
  }

  function returnToRest(api: PluginRuntimeApi): void {
    const paths = getPaths(api);
    if (!paths) return;
    walk(api, paths.to_resting_room);
    walk(api, paths.rest_command);
    state = 'idle';
  }

  function requestQuest(api: PluginRuntimeApi): void {
    const paths = getPaths(api);
    if (!paths) {
      api.writeTerminal?.(`{R[QuestBot] No paths for home location "${api.getConfig().homeLocation}"{x\n`);
      running = false;
      return;
    }

    const startAlias = String(api.getConfig().startAlias ?? '').trim();
    if (startAlias) {
      debug(api, `Running start alias: ${startAlias}`);
      runAlias(api, startAlias);
    }

    state = 'requesting';
    debug(api, 'Walking to quest master');
    walk(api, paths.to_quest_master);
    state = 'capturing';
  }

  function navigateToArea(api: PluginRuntimeApi): void {
    if (!questArea || !questRoom) {
      api.writeTerminal?.(`{R[QuestBot] Area or room not captured — returning to rest{x\n`);
      returnToRest(api);
      return;
    }
    const areas = getAreas(api);
    const areaData = areas[questArea];
    if (!areaData) {
      api.writeTerminal?.(`{Y[QuestBot] Unknown area: "${questArea}" — add it via Custom Areas config{x\n`);
      returnToRest(api);
      return;
    }
    if (!areaData.walk_paths[questRoom]) {
      api.writeTerminal?.(`{Y[QuestBot] Unknown room "${questRoom}" in "${questArea}" — add it via Custom Areas config{x\n`);
      returnToRest(api);
      return;
    }

    state = 'navigating';
    const paths = getPaths(api);
    if (!paths) return;

    debug(api, `Navigating: start_point=${areaData.start_point}`);
    const startPath = paths[areaData.start_point];
    if (startPath?.length) walk(api, startPath);
    walk(api, areaData.start_to_area);

    state = 'combing';
    debug(api, `Combing room: ${questRoom}`);
    const roomPath = areaData.walk_paths[questRoom];
    for (const dir of roomPath) {
      api.sendCommand(`get all.${itemKeyword}`);
      api.sendCommand(dir);
    }
    api.sendCommand(`get all.${itemKeyword}`);
  }

  function turnIn(api: PluginRuntimeApi): void {
    state = 'turning-in';
    const paths = getPaths(api);
    if (!paths) return;
    api.sendCommand('~');
    api.sendCommand('recall');
    walk(api, paths.quest_master);
    api.sendCommand('pq complete');
    walk(api, paths.to_resting_room);
    walk(api, paths.rest_command);
  }

  function handleLine(api: PluginRuntimeApi, raw: string): void {
    const line = stripAnsi(raw);

    // PK interrupt — always fires, stops everything
    if (/Help!\s+I am being attacked by/.test(line)) {
      if (running) {
        running = false;
        state = 'idle';
        resetQuest();
        api.writeTerminal?.(`{R[QuestBot] PK interrupt — stopped{x\n`);
      }
      return;
    }

    if (!running) return;

    // Cooldown expired → request next quest
    if (line.includes('You can now quest again.')) {
      if (api.getConfig().autoRestart) {
        debug(api, 'Cooldown expired → requesting next quest');
        resetQuest();
        requestQuest(api);
      }
      return;
    }

    // Quest request confirmed
    if (/You ask .+ for a quest\./.test(line)) {
      debug(api, 'Request acknowledged');
      state = 'capturing';
      return;
    }

    // Item capture
    if (state === 'capturing') {
      const itemM = line.match(/says 'Vile thieves have stolen (.+) from the royal treasury!'/i);
      if (itemM) {
        const raw = itemM[1].trim().toLowerCase();
        item = raw;
        itemKeyword = ITEM_KEYWORDS[raw] ?? raw.split(' ').at(-1) ?? raw;
        debug(api, `Item: ${item} → keyword: ${itemKeyword}`);
        return;
      }

      const areaM = line.match(/says 'Look in the general vicinity of (.+) for (.+)!'/i);
      if (areaM) {
        questArea = areaM[1].trim().toLowerCase();
        questRoom = areaM[2].trim().toLowerCase();
        debug(api, `Area: ${questArea}, room: ${questRoom}`);
        return;
      }

      if (line.includes("May the gods go with you!")) {
        debug(api, 'Quest accepted → navigating');
        navigateToArea(api);
        return;
      }
    }

    // Item picked up → turn in
    if (state === 'combing') {
      for (const pattern of PICKUP_PATTERNS) {
        if (line.includes(pattern)) {
          debug(api, `Picked up: ${pattern}`);
          turnIn(api);
          return;
        }
      }
    }

    // Reward line
    const rewardM = line.match(/granting you (\d+) quest points, and (\d+) gold/i);
    if (rewardM) {
      api.writeTerminal?.(`{G[QuestBot] Reward: {W${rewardM[1]}{G QP, {W${rewardM[2]}{G gold{x\n`);
      state = 'idle';
      resetQuest();
      return;
    }
  }

  return {
    manifest: {
      id: 'questbot',
      name: 'Quest Bot',
      version: '0.1.0',
      description:
        'Automates the full quest cycle: request → navigate to area → collect item → turn in. Adapted from QuestBot.lua.',
      tags: ['automation', 'questing'],
    },

    configSchema: {
      defaults: {
        homeLocation: 'wargar',
        startAlias: '',
        autoRestart: true,
        debug: false,
        customAreas: '[]',
      },
      fields: [
        {
          key: 'homeLocation',
          type: 'select',
          label: 'Home location',
          description: 'Your clan hall. Determines which navigation paths are used to reach the quest master.',
          options: [
            { value: 'wargar', label: 'Wargar' },
            { value: 'thaxanos', label: 'Thaxanos' },
            { value: 'shadow', label: 'Shadow (New Thalos)' },
            { value: 'darkonin', label: 'Darkonin' },
            { value: 'verm', label: 'Verminasia' },
          ],
        },
        {
          key: 'startAlias',
          type: 'string',
          label: 'Start alias',
          description:
            'Name of an alias to execute before each quest cycle begins (e.g. "buff" or "questprep"). Leave blank to skip.',
          placeholder: 'buff',
        },
        {
          key: 'autoRestart',
          type: 'boolean',
          label: 'Auto-restart',
          description: 'Automatically request the next quest when the cooldown expires ("You can now quest again.").',
        },
        {
          key: 'debug',
          type: 'boolean',
          label: 'Debug logging',
          description: 'Print each navigation step and state transition to the terminal.',
        },
        {
          key: 'customAreas',
          type: 'textarea',
          label: 'Custom areas (JSON)',
          description:
            'JSON array of additional quest areas. Each entry needs name, startPoint, startToArea, and rooms. Custom entries override built-ins with the same name. Type "pq areas" to see all known areas.',
          placeholder: JSON.stringify(
            [
              {
                name: 'example area',
                startPoint: 'icewall_port',
                startToArea: ['n', 'n', 'e'],
                rooms: {
                  'a dark cave': ['w', 'w', 's'],
                },
              },
            ],
            null,
            2,
          ),
        },
      ],
    },

    onEvent: (api: PluginRuntimeApi, evt) => {
      if (evt?.name !== 'shatteredarchive:raw-data') return;
      const p = evt.payload as any;
      const raw = typeof p === 'string' ? p : String(p?.rawText ?? p?.text ?? '');
      if (raw) handleLine(api, raw);
    },

    onAlias: (api: PluginRuntimeApi, input: string) => {
      const cmd = input.trim().toLowerCase();

      if (cmd === 'pq start') {
        if (running) {
          api.writeTerminal?.(`{Y[QuestBot] Already running{x\n`);
          return true;
        }
        running = true;
        resetQuest();
        api.writeTerminal?.(`{G[QuestBot] Starting quest automation...{x\n`);
        requestQuest(api);
        return true;
      }

      if (cmd === 'pq stop') {
        running = false;
        state = 'idle';
        resetQuest();
        api.writeTerminal?.(`{Y[QuestBot] Stopped{x\n`);
        return true;
      }

      if (cmd === 'pq status') {
        api.writeTerminal?.(
          `{C[QuestBot] running={W${running}{C state={W${state}{C item={W${item ?? '?'}{C area={W${questArea ?? '?'}{C room={W${questRoom ?? '?'}{x\n`,
        );
        return true;
      }

      if (cmd === 'pq debug') {
        const next = !api.getConfig().debug;
        api.updateConfig?.({ debug: next });
        api.writeTerminal?.(`{C[QuestBot] Debug ${next ? 'on' : 'off'}{x\n`);
        return true;
      }

      if (cmd === 'pq areas') {
        const areas = getAreas(api);
        const custom = parseCustomAreas(api.getConfig().customAreas);
        const lines = Object.entries(areas).map(([name, data]) => {
          const tag = custom[name] ? '{Y(custom){x' : '{D(built-in){x';
          const rooms = Object.keys(data.walk_paths).join(', ') || 'none';
          return `  {W${name}{x ${tag} — start: ${data.start_point} — rooms: ${rooms}`;
        });
        api.writeTerminal?.(`{C[QuestBot] Known areas (${lines.length}):{x\n${lines.join('\n')}\n`);
        return true;
      }

      return false;
    },
  };
}
