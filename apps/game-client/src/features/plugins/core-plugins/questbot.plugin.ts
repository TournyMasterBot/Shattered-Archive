// apps/game-client/src/features/plugins/core-plugins/questbot.plugin.ts
//
// Automates the full DSL quest cycle:
//   pq start  → walk to quest master → request quest → parse assignment
//             → navigate to area → comb for item → turn in → rest
//
// Adapted from QuestBot.lua (DSL community).
//
// Aliases:
//   pq start        — enable and begin questing
//   pq stop         — disable, reset state
//   pq status       — print current state
//   pq debug        — toggle debug logging
//   pq stats        — print session / all-time / per-area stats
//   pq stats reset  — wipe all stored stats

import type { IPluginModule, PluginRuntimeApi } from '@shatteredarchive/types-client';
import {
  type AreaRecord,
  type AllTimeRecord,
  type SessionRecord,
  finalizeSession,
  incrementSessionCount,
  loadAllAreaStats,
  loadAllTime,
  recordQuestCompletion,
  resetStats,
} from './questbot-stats-idb';

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripAnsi(s: string): string {
  if (!s || !s.includes('\x1b')) return s;
  return s.replace(/\[[0-9;]*m/g, '');
}

// ── Stats display helpers ─────────────────────────────────────────────────────

function quoteArg(s: string): string {
  return s.includes(' ') ? `'${s}'` : s;
}

function fmtN(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function fmtTime(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtDate(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-CA');
}

function qph(totalQp: number, totalMs: number): string {
  if (totalMs < 1000) return '—';
  return fmtN((totalQp / totalMs) * 3_600_000);
}

function buildStatsLines(session: SessionRecord | null, at: AllTimeRecord, areas: AreaRecord[]): string[] {
  const lines: string[] = [];

  if (session) {
    const wallMs = (session.endedAt || Date.now()) - session.startedAt;
    lines.push(`{C[QuestBot] ── Session ───────────────────────────────────{x`);
    lines.push(
      `  Started {w${fmtTime(session.startedAt)}{x   Duration {W${fmtMs(wallMs)}{x   Quests {W${fmtN(session.questCount)}{x`,
    );
    if (session.questCount > 0) {
      const avgQp = Math.round(session.totalQp / session.questCount);
      const avgGold = Math.round(session.totalGold / session.questCount);
      const avgMs = Math.round(session.totalQuestMs / session.questCount);
      lines.push(`  Earned  {W${fmtN(session.totalQp)}{x QP   {W${fmtN(session.totalGold)}{x gold`);
      lines.push(`  /quest  {W${fmtN(avgQp)}{x QP   {W${fmtN(avgGold)}{x gold   {W${fmtMs(avgMs)}{x avg`);
      lines.push(`  Rate    {W${qph(session.totalQp, wallMs)}{x QP/hr`);
    } else {
      lines.push(`  {w(no quests completed yet){x`);
    }
  } else {
    lines.push(`{C[QuestBot] No active session{x`);
  }

  if (at.questCount > 0) {
    const avgQp = Math.round(at.totalQp / at.questCount);
    const avgGold = Math.round(at.totalGold / at.questCount);
    const avgMs = Math.round(at.totalQuestMs / at.questCount);
    lines.push(`{C[QuestBot] ── All Time ──────────────────────────────────{x`);
    lines.push(
      `  {W${fmtN(at.sessionCount)}{x sessions   {W${fmtN(at.questCount)}{x quests   since {w${fmtDate(at.firstQuestAt)}{x`,
    );
    lines.push(`  Earned  {W${fmtN(at.totalQp)}{x QP   {W${fmtN(at.totalGold)}{x gold`);
    lines.push(`  /quest  {W${fmtN(avgQp)}{x QP   {W${fmtN(avgGold)}{x gold   {W${fmtMs(avgMs)}{x avg`);
  }

  if (areas.length > 0) {
    lines.push(`{C[QuestBot] ── Areas (by quests) ───────────────────────{x`);
    for (const a of areas.slice(0, 15)) {
      const avgQp = a.questCount > 0 ? Math.round(a.totalQp / a.questCount) : 0;
      const avgMs = a.questCount > 0 ? Math.round(a.totalQuestMs / a.questCount) : 0;
      const name = a.name.length > 20 ? a.name.slice(0, 19) + '…' : a.name.padEnd(20);
      lines.push(
        `  {W${name}{x  ${String(a.questCount).padStart(4)} q   ${fmtN(a.totalQp).padStart(8)} QP   ${fmtN(avgQp).padStart(5)}/q   ${fmtMs(avgMs)} avg`,
      );
    }
  }

  return lines;
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
  // Navigation from pq complete to gem merchant, including the buy command.
  // Leave empty to skip the gem step entirely.
  gem_merchant: string[];
};

const shadowHallFromRecall = ['e', 'e', 'e', 's', 's', 's', 's', 's', 's'];
const eclipseTowerEntranceToResting = ['open west', 'w', 'u', 'enter orb'];
const gemMerchantFromVermTaskMaster = ['e', 's', 's', 's', 's', 's', 'w', 'n'];
const HOME_PATHS: Record<HomeKey, CharacterPaths> = {
  wargar: {
    quest_master: [
      'd',
      'n',
      'ne',
      'nw',
      'nw',
      'nw',
      'w',
      'n',
      'n',
      'e',
      'e',
      'n',
      'n',
      'n',
      'n',
      'n',
      'n',
      'w',
      'w',
      's',
    ],
    to_quest_master: [
      'stand',
      'c fly',
      'c sanc',
      'c pass',
      'e',
      'd',
      's',
      'u',
      'n',
      'ne',
      'nw',
      'nw',
      'nw',
      'w',
      'n',
      'n',
      'e',
      'e',
      'n',
      'n',
      'n',
      'n',
      'n',
      'n',
      'w',
      'w',
      's',
      'pq request find',
    ],
    to_resting_room: [
      'n',
      'e',
      'e',
      's',
      's',
      's',
      's',
      's',
      's',
      'w',
      'w',
      's',
      's',
      'e',
      'se',
      'se',
      'se',
      'sw',
      's',
      'd',
      'n',
      'u',
      'w',
    ],
    rest_command: ['land', 'wear helm', 'rest pew'],
    justice_bind: [
      'n',
      'e',
      'e',
      's',
      's',
      's',
      's',
      's',
      's',
      'w',
      'w',
      's',
      's',
      'e',
      'se',
      'se',
      'se',
      'sw',
      's',
      'd',
      'n',
      'u',
      'w',
      'stand',
      'w',
      'enter ark',
      'e',
      'e',
      'e',
      'e',
      'e',
    ],
    icewall_port: [
      'n',
      'e',
      'e',
      's',
      's',
      's',
      's',
      's',
      's',
      'w',
      'w',
      's',
      's',
      'e',
      'se',
      'se',
      'se',
      'sw',
      's',
      'd',
      'n',
      'u',
      'w',
      'stand',
      'w',
      'enter ice',
    ],
    alth_port: [
      'n',
      'e',
      'e',
      's',
      's',
      's',
      's',
      's',
      's',
      'w',
      'w',
      's',
      's',
      'e',
      'se',
      'se',
      'se',
      'sw',
      's',
      'd',
      'n',
      'u',
      'w',
      'stand',
      'w',
      'enter new',
    ],
    alth_arena: [
      'n',
      'e',
      'e',
      's',
      's',
      's',
      's',
      's',
      's',
      'w',
      'w',
      's',
      's',
      'e',
      'se',
      'se',
      'se',
      'sw',
      's',
      'd',
      'n',
      'u',
      'w',
      'stand',
      'w',
      'enter gaming',
      'enter portal',
    ],
    tropica_port: [
      'n',
      'e',
      'e',
      's',
      's',
      's',
      's',
      's',
      's',
      'w',
      'w',
      's',
      's',
      'e',
      'se',
      'se',
      'se',
      'sw',
      's',
      'd',
      'n',
      'u',
      'w',
      'stand',
      'w',
      'enter tropica',
    ],
    succubus: ['c gate bloody nose'],
    gem_merchant: [],
  },
  thaxanos: {
    quest_master: ['n', 'n', 'n', 'n', 'e', 's'],
    to_quest_master: ['stand', 'c fly', 'c sanc', 'c pass', 's', 's', 'pq request find'],
    to_resting_room: ['n', 'n'],
    rest_command: ['wear helm', 'rest slab'],
    justice_bind: [
      'n',
      'w',
      'w',
      'w',
      'w',
      's',
      's',
      's',
      's',
      'e',
      'e',
      'n',
      'd',
      'e',
      'e',
      'enter ark',
      'e',
      'e',
      'e',
      'e',
      'e',
    ],
    icewall_port: ['n', 'w', 'w', 'w', 'w', 's', 's', 's', 's', 'e', 'e', 'n', 'd', 'e', 'e', 'enter ice'],
    alth_port: ['n', 'w', 'w', 'w', 'w', 's', 's', 's', 's', 'e', 'e', 'n', 'd', 'e', 'e', 'enter new'],
    alth_arena: [
      'n',
      'w',
      'w',
      'w',
      'w',
      's',
      's',
      's',
      's',
      'e',
      'e',
      'n',
      'd',
      'e',
      'e',
      'enter gaming',
      'enter portal',
    ],
    tropica_port: ['n', 'w', 'w', 'w', 'w', 's', 's', 's', 's', 'e', 'e', 'n', 'd', 'e', 'e', 'enter tropica'],
    succubus: ['c gate bloody nose'],
    gem_merchant: [],
  },
  shadow: {
    quest_master: [
      'open south',
      's',
      's',
      'w',
      'w',
      'w',
      's',
      's',
      's',
      's',
      's',
      's',
      'e',
      'e',
      'e',
      's',
      's',
      'w',
      's',
      'e',
      'e',
      'n',
      'n',
      'n',
      'w',
    ],
    to_quest_master: [
      'stand',
      'c fly',
      'c pass',
      'enter orb',
      'd',
      'e',
      'n',
      'w',
      'w',
      'w',
      'w',
      'w',
      'n',
      'n',
      'n',
      'n',
      'nw',
      'pq request find',
    ],
    to_resting_room: [...shadowHallFromRecall, ...eclipseTowerEntranceToResting],
    rest_command: ['wear helm', 'land', 'rest blanket'],
    justice_bind: [
      'se',
      's',
      's',
      's',
      's',
      'e',
      'e',
      'e',
      'e',
      'e',
      's',
      'w',
      'u',
      'enter orb',
      's',
      'd',
      'enter ark',
      'e',
      'e',
      'e',
      'e',
      'e',
    ],
    icewall_port: [
      'se',
      's',
      's',
      's',
      's',
      'e',
      'e',
      'e',
      'e',
      'e',
      's',
      'w',
      'u',
      'enter orb',
      's',
      'd',
      'enter ice',
    ],
    alth_port: [
      'se',
      's',
      's',
      's',
      's',
      'e',
      'e',
      'e',
      'e',
      'e',
      's',
      'w',
      'u',
      'enter orb',
      's',
      'd',
      'enter cove',
      'se',
      'ne',
      'ne',
      'n',
      'n',
      'e',
    ],
    alth_arena: [
      'se',
      's',
      's',
      's',
      's',
      'e',
      'e',
      'e',
      'e',
      'e',
      's',
      'w',
      'u',
      'enter orb',
      's',
      'd',
      'enter gaming',
      'enter portal',
    ],
    tropica_port: [
      'se',
      's',
      's',
      's',
      's',
      'e',
      'e',
      'e',
      'e',
      'e',
      's',
      'w',
      'u',
      'enter orb',
      's',
      'd',
      'enter tropica',
    ],
    succubus: ['c gate bloody nose'],
    gem_merchant: [...gemMerchantFromVermTaskMaster, 'buy blue'],
  },
  darkonin: {
    quest_master: ['e', 'e'],
    to_quest_master: ['stand', 'c fly', 'c pass', 'c sanc', 's', 'e', 'pq request find'],
    to_resting_room: ['w', 'n'],
    rest_command: ['stand'],
    justice_bind: ['w', 's', 's', 's', 'w', 'n', 'n', 'w', 'n', 'enter ark', 'e', 'e', 'e', 'e', 'e'],
    icewall_port: ['w', 's', 's', 's', 'w', 'n', 'n', 'w', 'n', 'enter ice'],
    alth_port: ['w', 's', 's', 's', 'w', 'n', 'n', 'w', 'n', 'enter alth'],
    alth_arena: ['w', 's', 's', 's', 'w', 'n', 'n', 'w', 'n', 'enter gaming', 'enter portal'],
    tropica_port: ['w', 's', 's', 's', 'w', 'n', 'n', 'w', 'n', 'enter tropica'],
    succubus: ['c gate bloody nose'],
    gem_merchant: [],
  },
  verm: {
    quest_master: ['n', 'nw'],
    to_quest_master: ['stand', 'c fly', 'c pass', 'c sanc', 's', 'e', 'pq request find'],
    to_resting_room: ['se', 's', 's', 'w', 'w', 'n', 'e', 'n', 'n', 'w', 'w', 'w', 'n', 'n', 'n', 'n', 'n', 'w', 'w'],
    rest_command: ['land', 'wear helm', 'rest cot'],
    justice_bind: [
      'se',
      's',
      's',
      'w',
      'w',
      'n',
      'e',
      'n',
      'n',
      'w',
      'w',
      'w',
      'n',
      'n',
      'n',
      'n',
      'n',
      'w',
      'w',
      'w',
      'd',
      'enter ark',
      'e',
      'e',
      'e',
      'e',
      'e',
    ],
    icewall_port: [
      'se',
      's',
      's',
      'w',
      'w',
      'n',
      'e',
      'n',
      'n',
      'w',
      'w',
      'w',
      'n',
      'n',
      'n',
      'n',
      'n',
      'w',
      'w',
      'w',
      'd',
      'enter ice',
    ],
    alth_port: [
      'se',
      's',
      's',
      'w',
      'w',
      'n',
      'e',
      'n',
      'n',
      'w',
      'w',
      'w',
      'n',
      'n',
      'n',
      'n',
      'n',
      'w',
      'w',
      'w',
      'd',
      'enter alth',
    ],
    alth_arena: [
      'se',
      's',
      's',
      'w',
      'w',
      'n',
      'e',
      'n',
      'n',
      'w',
      'w',
      'w',
      'n',
      'n',
      'n',
      'n',
      'n',
      'w',
      'w',
      'w',
      'd',
      'enter gaming',
      'enter portal',
    ],
    tropica_port: [
      'se',
      's',
      's',
      'w',
      'w',
      'n',
      'e',
      'n',
      'n',
      'w',
      'w',
      'w',
      'n',
      'n',
      'n',
      'n',
      'n',
      'w',
      'w',
      'w',
      'd',
      'enter tropica',
    ],
    succubus: ['c gate bloody nose'],
    gem_merchant: [],
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
    start_to_area: [
      'wear bees',
      's',
      's',
      's',
      'e',
      's',
      's',
      'w',
      'w',
      's',
      's',
      's',
      's',
      'e',
      's',
      'e',
      'n',
      'n',
      'n',
      'n',
      'w',
      'w',
      'w',
      's',
      'se',
      'e',
      'se',
      'se',
      'n',
      'ne',
      'nw',
      'sw',
      's',
      'e',
      'n',
      'n',
      'n',
      'n',
      'n',
      'n',
      'd',
    ],
    walk_paths: {
      'philosophy guild': ['e', 'e', 'e', 'e', 'e', 'e', 'n', 'w', 'w', 'w', 'w', 'w', 's'],
      'an uneven, hot corridor': ['d', 'n', 'n', 'se', 'se', 'e', 'nw', 'nw', 'e', 'e', 's', 's', 'e'],
      'a stone slab platform in fling-fall cavern': ['d'],
      'a room of mirrors': ['w', 'w', 'w', 'nw', 's', 'nw', 'e', 'sw', 'ne', 'n'],
      'a long bare hallway': ['e', 'e', 'e', 'e', 'e'],
    },
  },
  'elemental planes': {
    start_point: 'succubus',
    start_to_area: ['d', 'd', 'w', 'w', 'w', 'w', 'd', 'd', 'd', 'd', 'd'],
    walk_paths: {
      'on the elemental plane of fire': [
        'ne',
        'ne',
        'e',
        'e',
        'e',
        'n',
        'w',
        'w',
        'w',
        'n',
        'e',
        'e',
        'n',
        's',
        'w',
        'w',
        'w',
      ],
      'on the elemental plane of air': [
        'nw',
        'nw',
        'w',
        'w',
        'w',
        'n',
        'e',
        'e',
        'e',
        'n',
        'w',
        'w',
        'w',
        'n',
        'e',
        'e',
        'e',
      ],
      'on the elemental plane of earth': [
        'se',
        'se',
        'e',
        'e',
        'e',
        's',
        'w',
        'w',
        'w',
        's',
        'e',
        'e',
        'e',
        's',
        'w',
        'w',
        'w',
      ],
      'on the elemental plane of water': [
        'sw',
        'sw',
        'w',
        'w',
        'w',
        's',
        'e',
        'e',
        'e',
        's',
        'w',
        'w',
        'w',
        's',
        'e',
        'e',
        'e',
      ],
    },
  },
  hell: {
    start_point: 'succubus',
    start_to_area: [],
    walk_paths: {
      'the storage room': ['s', 's', 'w', 's', 's'],
      "lawyer's office": ['w', 'w', 's', 'w', 'w', 'w', 'w', 'w', 's', 'w'],
      'office of the high priest': ['w', 'w', 's', 'w', 'w', 'n', 'e'],
      'near the hearth of hell': ['s', 's', 'w', 's', 'w'],
      'a large hallway': ['s', 's', 'w'],
      'the end of a large hallway': ['s', 's', 'w', 's'],
    },
  },
  'silversand garrison': {
    start_point: 'alth_port',
    start_to_area: ['w', 's', 's', 'w', 'w', 'w', 'w', 'sw', 's', 's', 's', 'w', 'sw', 's', 's', 's', 'w', 's', 'sw'],
    walk_paths: {
      'silversand garrison': ['e'],
    },
  },
  'ghost lake': {
    start_point: 'alth_arena',
    start_to_area: [
      'e',
      'e',
      'e',
      's',
      's',
      'w',
      'n',
      'w',
      'n',
      'n',
      'n',
      'nw',
      'w',
      'w',
      'w',
      'w',
      'w',
      'w',
      'w',
      'w',
      's',
      's',
      'sw',
      'nw',
      'd',
      'n',
    ],
    walk_paths: {
      'a deep crevice': ['d', 'n', 'n', 'n', 'n', 'd', 'd', 'se'],
      'deep in a mist filled lake': ['n', 'n', 'n', 'n', 'd', 'n', 'n', 'w', 'e', 'n', 'e', 'n', 's', 's', 'w'],
    },
  },
  'a lost catacomb': {
    start_point: 'tropica_port',
    start_to_area: [
      'sw',
      'w',
      'nw',
      'w',
      'nw',
      'w',
      's',
      's',
      'se',
      'se',
      'se',
      'se',
      'sw',
      'se',
      'se',
      'se',
      'w',
      'nw',
      'w',
      's',
      'w',
      'w',
      'w',
      'w',
      's',
      'w',
      's',
      's',
      'w',
    ],
    walk_paths: {
      'main bedroom': [
        'enter mau',
        'e',
        'e',
        'e',
        'e',
        's',
        's',
        's',
        's',
        'd',
        'e',
        'e',
        's',
        's',
        'w',
        'w',
        'n',
        'd',
        's',
        's',
        's',
        's',
        'e',
        'e',
        'e',
      ],
    },
  },
  'forbidden forest': {
    start_point: 'icewall_port',
    start_to_area: ['ne', 'e', 'ne', 'n', 'n', 'ne', 'n', 'n', 'n', 'n', 'n'],
    walk_paths: {
      'a snow covered field': ['w'],
    },
  },
  'a blazing aurora': {
    start_point: 'justice_bind',
    start_to_area: [
      'e',
      'ne',
      'n',
      'ne',
      'e',
      'e',
      'ne',
      'n',
      'n',
      'n',
      'n',
      'n',
      'n',
      'n',
      'op e',
      'e',
      'n',
      'u',
      'enter aurora',
    ],
    walk_paths: {
      'the silver ascent': ['nw', 'nw', 'n', 'n', 'n', 'e', 'e', 'u', 'nw', 'u'],
    },
  },
  jovar: {
    start_point: 'icewall_port',
    start_to_area: ['nw', 'nw', 'w', 'w', 'nw', 'n', 'nw', 'e', 'n', 'u', 'u', 'w', 'u', 'u', 'n', 'n', 'n'],
    walk_paths: {
      'throne room': ['n', 'n', 'n', 'n', 'n'],
      residence: ['w', 'e', 'e'],
      'before the palace gates': ['n', 'n'],
      'beyond the gates': ['n', 'n', 'n'],
      'guest quarters': ['n', 'n', 'n', 'n', 'w', 'w', 'w', 'e', 'e', 'e', 'e', 'e', 'e'],
      stable: ['n', 'n', 'n', 'n', 'e', 'e', 'n', 'n'],
      armory: ['n', 'n', 'e', 'e', 's'],
      'weapon shop': ['n', 'n', 'e', 'e', 'e'],
      smithy: ['n', 'n', 'e', 'e', 'n'],
      'the planning room': ['n', 'n', 'e', 'e', 'n', 'w'],
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
      const name = String(entry?.name ?? '')
        .trim()
        .toLowerCase();
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
  let latestGold = 0;
  let lastIsFighting = false;
  let combatBreakPending = false;
  let fleedDuringCombat = false;
  let combatResumeTimerId: ReturnType<typeof setTimeout> | null = null;
  let preCombatState: BotState = 'idle';
  let navRetryTimerId: ReturnType<typeof setTimeout> | null = null;
  let questArea: string | null = null;
  let questRoom: string | null = null;
  let questAttemptCount = 0;
  // IDs of Knockdown-group triggers that were enabled when pq start ran (and thus disabled by us).
  let disabledKnockdownIds: string[] = [];
  let latestQp = 0;
  let pendingEggBuy = false;
  let latestMove = 0;
  let latestMaxMove = 0;
  let combStepsRemaining: string[] = [];
  let currentSession: SessionRecord | null = null;
  let questStartTime = 0;

  function walk(api: PluginRuntimeApi, cmds: string[]): void {
    for (const cmd of cmds) api.sendCommand(cmd);
  }

  function disableKnockdownTriggers(api: PluginRuntimeApi): void {
    const rt = (window as any).__SA_RUNTIME__?.runtime;
    if (!rt) return;
    const scripts: any[] = rt.getAllScripts();
    disabledKnockdownIds = [];
    for (const script of scripts) {
      if (script.group === 'Knockdown' && script.enabled) {
        disabledKnockdownIds.push(script.id);
        rt.upsertScript({ ...script, enabled: false });
      }
    }
    if (disabledKnockdownIds.length > 0) {
      debug(api, `Disabled ${disabledKnockdownIds.length} Knockdown trigger(s)`);
    }
  }

  function restoreKnockdownTriggers(api: PluginRuntimeApi): void {
    if (disabledKnockdownIds.length === 0) return;
    const rt = (window as any).__SA_RUNTIME__?.runtime;
    if (!rt) return;
    const scripts: any[] = rt.getAllScripts();
    for (const script of scripts) {
      if (disabledKnockdownIds.includes(script.id)) {
        rt.upsertScript({ ...script, enabled: true });
      }
    }
    debug(api, `Re-enabled ${disabledKnockdownIds.length} Knockdown trigger(s)`);
    disabledKnockdownIds = [];
  }

  function refreshMovement(api: PluginRuntimeApi): void {
    if (latestMaxMove > 0 && latestMove > latestMaxMove / 3) return;
    const cmd = String(api.getConfig().refreshCommand ?? 'cast refresh').trim() || 'cast refresh';
    api.sendCommand(cmd);
    api.sendCommand(cmd);
  }

  function checkEggBuyThreshold(api: PluginRuntimeApi): void {
    const threshold = Number(api.getConfig().eggQpThreshold ?? '0');
    if (threshold <= 0 || latestQp < threshold || pendingEggBuy) return;
    pendingEggBuy = true;
    debug(api, `QP ${latestQp} ≥ ${threshold} — egg buy queued for next cycle`);
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

  function sendAllCombSteps(api: PluginRuntimeApi): void {
    if (!itemKeyword) return;
    const steps = combStepsRemaining.splice(0);
    debug(api, `Comb: sending all ${steps.length} step(s) synchronously`);
    for (const dir of steps) {
      api.sendCommand(`get all.${itemKeyword}`);
      api.sendCommand(dir);
    }
    api.sendCommand(`get all.${itemKeyword}`);
  }

  function resetQuest(): void {
    item = null;
    itemKeyword = null;
    questArea = null;
    questRoom = null;
    combStepsRemaining = [];
    questStartTime = 0;
  }

  function returnToRest(api: PluginRuntimeApi): void {
    const paths = getPaths(api);
    if (!paths) return;
    api.sendCommand('recall');
    refreshMovement(api);
    walk(api, paths.to_resting_room);
    walk(api, paths.rest_command);
    state = 'idle';
  }

  function requestQuest(api: PluginRuntimeApi, fromRecall = false): void {
    const paths = getPaths(api);
    if (!paths) {
      api.writeTerminal?.(`{R[QuestBot] No paths for home location "${api.getConfig().homeLocation}"{x\n`);
      running = false;
      return;
    }

    if (questAttemptCount >= 3) {
      api.writeTerminal?.(`{R[QuestBot] 3 failed quest attempts — stopping. Type pq start to retry.{x\n`);
      running = false;
      questAttemptCount = 0;
      api.sendCommand('recall');
      refreshMovement(api);
      walk(api, paths.to_resting_room);
      walk(api, paths.rest_command);
      return;
    }

    questAttemptCount++;
    debug(api, `Quest attempt ${questAttemptCount} of 3`);

    const startAlias = String(api.getConfig().startAlias ?? '').trim();
    if (startAlias) {
      debug(api, `Running start alias: ${startAlias}`);
      runAlias(api, startAlias);
    }

    state = 'requesting';
    debug(api, 'Walking to quest master');

    if (fromRecall) {
      // recall + quest_master is pure movement (no spell dependencies).
      // to_quest_master starts with c fly/c pass which can leave the character
      // at the wrong position if a spell fails mid-path.
      api.sendCommand('recall');
      refreshMovement(api);
      walk(api, paths.quest_master);
    } else {
      const beeContainer = String(api.getConfig().beeContainer ?? '').trim();
      if (beeContainer) {
        debug(api, `Getting bees from ${beeContainer}`);
        api.sendCommand(`get bees ${beeContainer}`);
      }
      const qmCmds = [...paths.to_quest_master];
      qmCmds.pop(); // remove trailing 'pq request find', sent explicitly below
      walk(api, qmCmds);
    }

    if (pendingEggBuy && Number(api.getConfig().eggQpThreshold ?? '0') > 0) {
      const eggContainer =
        String(api.getConfig().eggContainer ?? '').trim() || String(api.getConfig().gemPouch ?? '').trim();
      debug(api, 'Buying egg');
      api.sendCommand('pq buy egg');
      if (eggContainer) api.sendCommand(`put egg ${quoteArg(eggContainer)}`);
      pendingEggBuy = false;
    }

    api.sendCommand('pq request find');
    state = 'capturing';
  }

  function retryWithNewQuest(api: PluginRuntimeApi, reason: string): void {
    api.writeTerminal?.(`{Y[QuestBot] ${reason}{x\n`);

    if (questAttemptCount >= 3) {
      api.writeTerminal?.(`{R[QuestBot] 3 consecutive bad quests — returning to rest{x\n`);
      returnToRest(api);
      return;
    }

    // Fetch fresh QP — response arrives during the 45s wait and updates pendingEggBuy
    api.sendCommand('worth');

    // Honour a pending egg buy before clearing so we don't miss the breakpoint
    if (pendingEggBuy && Number(api.getConfig().eggQpThreshold ?? '0') > 0) {
      const eggContainer =
        String(api.getConfig().eggContainer ?? '').trim() || String(api.getConfig().gemPouch ?? '').trim();
      debug(api, 'Buying egg before clearing quest');
      api.sendCommand('pq buy egg');
      if (eggContainer) api.sendCommand(`put egg ${quoteArg(eggContainer)}`);
      pendingEggBuy = false;
    }

    api.writeTerminal?.(`{Y[QuestBot] Clearing quest — will retry in 45s (attempt ${questAttemptCount}/3){x\n`);
    api.sendCommand('pq clear');
    state = 'requesting';

    if (navRetryTimerId !== null) {
      clearTimeout(navRetryTimerId);
    }
    navRetryTimerId = setTimeout(() => {
      navRetryTimerId = null;
      if (!running) return;
      questAttemptCount++;
      debug(api, `Quest re-request attempt ${questAttemptCount} of 3`);
      resetQuest();

      // worth response has arrived by now — buy egg if threshold was crossed during the wait
      if (pendingEggBuy && Number(api.getConfig().eggQpThreshold ?? '0') > 0) {
        const eggContainer =
          String(api.getConfig().eggContainer ?? '').trim() || String(api.getConfig().gemPouch ?? '').trim();
        debug(api, 'Buying egg before retry request');
        api.sendCommand('pq buy egg');
        if (eggContainer) api.sendCommand(`put egg ${quoteArg(eggContainer)}`);
        pendingEggBuy = false;
      }

      api.sendCommand('pq request find');
      state = 'capturing';
    }, 45_000);
  }

  function navigateToArea(api: PluginRuntimeApi): void {
    if (!questArea || !questRoom) {
      retryWithNewQuest(api, 'Area or room not captured — retrying');
      return;
    }
    const areas = getAreas(api);
    const areaData = areas[questArea];
    if (!areaData) {
      retryWithNewQuest(api, `Unknown area: "${questArea}" — add it via Custom Areas config`);
      return;
    }
    if (!areaData.walk_paths[questRoom]) {
      retryWithNewQuest(api, `Unknown room "${questRoom}" in "${questArea}" — add it via Custom Areas config`);
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
    combStepsRemaining = [...areaData.walk_paths[questRoom]];
    debug(api, `Comb setup: ${combStepsRemaining.length} step(s)`);
    sendAllCombSteps(api);
  }

  function completeQuestAndRest(api: PluginRuntimeApi): void {
    const paths = getPaths(api);
    if (!paths) return;

    const gemPath = paths.gem_merchant;
    const gemThreshold = Math.max(0, Number(api.getConfig().gemGoldThreshold ?? '600') || 600);
    const tookGemStep = gemPath.length > 0 && latestGold >= gemThreshold;

    if (tookGemStep) {
      debug(api, `Gold: ${latestGold} ≥ ${gemThreshold} — walking to gem merchant`);
      walk(api, gemPath);
      const gemPouch = String(api.getConfig().gemPouch ?? '').trim();
      if (gemPouch) {
        const quotedPouch = gemPouch.includes(' ') ? `'${gemPouch}'` : gemPouch;
        api.sendCommand(`put blue ${quotedPouch}`);
      }
    } else if (gemPath.length > 0) {
      debug(api, `Gold: ${latestGold} < ${gemThreshold} — skipping gem merchant`);
    }

    api.sendCommand('recall');
    refreshMovement(api);
    walk(api, paths.to_resting_room);
    walk(api, paths.rest_command);

    const beeContainer = String(api.getConfig().beeContainer ?? '').trim();
    if (beeContainer) {
      debug(api, `Returning bees to ${beeContainer}`);
      api.sendCommand(`put bees ${beeContainer}`);
    }
  }

  function turnIn(api: PluginRuntimeApi): void {
    state = 'turning-in';
    const paths = getPaths(api);
    if (!paths) return;
    api.sendCommand('~');
    api.sendCommand('recall');
    refreshMovement(api);
    walk(api, paths.quest_master);
    api.sendCommand('pq complete');
    api.sendCommand('worth');
  }

  function handleLine(api: PluginRuntimeApi, raw: string): void {
    const line = stripAnsi(raw);

    // PK interrupt — always fires, stops everything
    if (/Help!\s+I am being attacked by/.test(line)) {
      if (running) {
        running = false;
        state = 'idle';
        if (navRetryTimerId !== null) {
          clearTimeout(navRetryTimerId);
          navRetryTimerId = null;
        }
        resetQuest();
        api.writeTerminal?.(`{R[QuestBot] PK interrupt — stopped{x\n`);
      }
      return;
    }

    // Track QP from worth output regardless of running state
    const qpMatch = line.match(/Quest Points\s*:\s*(\d+)/);
    if (qpMatch) {
      latestQp = Number(qpMatch[1]);
      checkEggBuyThreshold(api);
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

      if (line.includes('May the gods go with you!')) {
        debug(api, 'Quest accepted → navigating');
        questStartTime = Date.now();
        navigateToArea(api);
        return;
      }
    }

    // Quest confirmed complete → gem merchant + rest
    if (state === 'turning-in' && line.includes('Congratulations on completing the quest!')) {
      debug(api, 'Quest complete — heading home');
      completeQuestAndRest(api);
      return;
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
      const earnedQp = Number(rewardM[1]);
      const earnedGold = Number(rewardM[2]);
      latestQp += earnedQp;
      api.writeTerminal?.(`{G[QuestBot] Reward: {W${rewardM[1]}{G QP, {W${rewardM[2]}{G gold{x\n`);
      checkEggBuyThreshold(api);

      const durationMs = questStartTime > 0 ? Date.now() - questStartTime : 0;
      if (currentSession) {
        currentSession.questCount += 1;
        currentSession.totalQp += earnedQp;
        currentSession.totalGold += earnedGold;
        currentSession.totalQuestMs += durationMs;
        recordQuestCompletion({
          session: { ...currentSession },
          qp: earnedQp,
          gold: earnedGold,
          durationMs,
          areaName: questArea,
        }).catch(() => {});
      }

      questAttemptCount = 0;
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
        beeContainer: '',
        gemPouch: 'gem pouch',
        gemGoldThreshold: '600',
        autoRestart: true,
        debug: false,
        customAreas: '[]',
        refreshCommand: 'cast refresh',
        eggQpThreshold: '0',
        eggContainer: '',
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
          key: 'beeContainer',
          type: 'string',
          label: 'Beeswax earplugs container',
          description:
            'Container name that holds your beeswax earplugs (e.g. "shelf" or "pit"). If set, the bot retrieves the earplugs before each quest cycle and returns them after resting.',
          placeholder: 'shelf',
        },
        {
          key: 'gemPouch',
          type: 'string',
          label: 'Gem pouch',
          description:
            'Name of the gem pouch to put blue gems into after buying (e.g. "gem pouch"). Leave blank to skip the put command.',
          placeholder: 'gem pouch',
        },
        {
          key: 'gemGoldThreshold',
          type: 'string',
          label: 'Gem buy gold threshold',
          description:
            'Minimum gold required to trigger the gem merchant step after turning in a quest. Set to 0 to always visit the gem merchant (when the path is configured). Defaults to 600.',
          placeholder: '600',
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
          key: 'refreshCommand',
          type: 'string',
          label: 'Refresh command',
          description:
            'Command used to restore movement after recalling. Sent twice when movement is at or below one third of maximum. Defaults to "cast refresh".',
          placeholder: 'cast refresh',
        },
        {
          key: 'eggQpThreshold',
          type: 'string',
          label: 'Egg buy QP threshold',
          description:
            'Auto-run pq buy egg at the quest master when quest points reach this value. Set to 0 or leave blank to disable.',
          placeholder: '2500',
        },
        {
          key: 'eggContainer',
          type: 'string',
          label: 'Egg container',
          description:
            'Container to put the egg into after buying (e.g. "shelf" or "pit"). Defaults to the gem pouch if left blank.',
          placeholder: 'shelf',
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
      if (evt?.name === 'game:char-data') {
        const p = evt.payload as any;
        if (typeof p?.gold === 'number') latestGold = p.gold;
        if (typeof p?.move === 'number') latestMove = p.move;
        if (typeof p?.max_move === 'number') latestMaxMove = p.max_move;

        const isFighting = p?.is_fighting === true;

        if (isFighting && !lastIsFighting && running) {
          running = false;
          preCombatState = state;
          state = 'idle';
          combatBreakPending = true;
          fleedDuringCombat = false;
          if (combatResumeTimerId !== null) {
            clearTimeout(combatResumeTimerId);
            combatResumeTimerId = null;
          }
          if (navRetryTimerId !== null) {
            clearTimeout(navRetryTimerId);
            navRetryTimerId = null;
          }
          (window as any).__SA_RUNTIME__?.runtime?.cancelDoAfterTimers();
          api.writeTerminal?.(`{R[QuestBot] Combat detected — stopped.{x\n`);
        }

        if (!isFighting && lastIsFighting && combatBreakPending) {
          api.writeTerminal?.(`{Y[QuestBot] Combat ended — resuming in 30s.{x\n`);
          combatResumeTimerId = setTimeout(() => {
            combatResumeTimerId = null;
            combatBreakPending = false;
            if (fleedDuringCombat) {
              resetQuest();
              api.writeTerminal?.(`{Y[QuestBot] Flee detected — not resuming{x\n`);
              return;
            }
            api.writeTerminal?.(`{G[QuestBot] Combat over — resuming{x\n`);
            running = true;
            if (preCombatState === 'turning-in') {
              debug(api, 'Resuming turn-in');
              turnIn(api);
            } else if (preCombatState === 'combing') {
              debug(api, `Resuming comb in ${questArea ?? '?'} (${combStepsRemaining.length} step(s) left)`);
              state = 'combing';
              sendAllCombSteps(api);
            } else if (preCombatState === 'navigating') {
              debug(api, `Re-navigating to ${questArea ?? '?'}`);
              api.sendCommand('recall');
              refreshMovement(api);
              navigateToArea(api);
            } else {
              requestQuest(api, true);
            }
          }, 30_000);
        }

        lastIsFighting = isFighting;
        return;
      }

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
        currentSession = {
          startedAt: Date.now(),
          endedAt: 0,
          questCount: 0,
          totalQp: 0,
          totalGold: 0,
          totalQuestMs: 0,
        };
        incrementSessionCount().catch(() => {});
        disableKnockdownTriggers(api);
        api.writeTerminal?.(`{G[QuestBot] Starting quest automation...{x\n`);
        requestQuest(api, true);
        return true;
      }

      if (cmd === 'pq stop') {
        running = false;
        state = 'idle';
        combatBreakPending = false;
        if (combatResumeTimerId !== null) {
          clearTimeout(combatResumeTimerId);
          combatResumeTimerId = null;
        }
        if (navRetryTimerId !== null) {
          clearTimeout(navRetryTimerId);
          navRetryTimerId = null;
        }
        if (currentSession && currentSession.questCount > 0) {
          currentSession.endedAt = Date.now();
          finalizeSession({ ...currentSession }).catch(() => {});
        }
        currentSession = null;
        resetQuest();
        questAttemptCount = 0;
        pendingEggBuy = false;
        restoreKnockdownTriggers(api);
        api.writeTerminal?.(`{Y[QuestBot] Stopped{x\n`);
        return true;
      }

      if (cmd === 'flee' && combatBreakPending) {
        fleedDuringCombat = true;
        if (combatResumeTimerId !== null) {
          clearTimeout(combatResumeTimerId);
          combatResumeTimerId = null;
        }
        combatBreakPending = false;
        api.writeTerminal?.(`{Y[QuestBot] Flee detected — auto-resume cancelled{x\n`);
        return false; // pass 'flee' through to the game
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

      if (cmd === 'pq stats reset') {
        resetStats().catch(() => {});
        if (currentSession) {
          currentSession = {
            startedAt: Date.now(),
            endedAt: 0,
            questCount: 0,
            totalQp: 0,
            totalGold: 0,
            totalQuestMs: 0,
          };
        }
        api.writeTerminal?.(`{Y[QuestBot] Stats reset{x\n`);
        return true;
      }

      if (cmd === 'pq stats') {
        const snap = currentSession ? { ...currentSession } : null;
        Promise.all([loadAllTime(), loadAllAreaStats()])
          .then(([at, areas]) => {
            api.writeTerminal?.(buildStatsLines(snap, at, areas).join('\n') + '\n');
          })
          .catch(() => {
            if (snap)
              api.writeTerminal?.(
                buildStatsLines(
                  snap,
                  { questCount: 0, totalQp: 0, totalGold: 0, totalQuestMs: 0, sessionCount: 0, firstQuestAt: 0 },
                  [],
                ).join('\n') + '\n',
              );
          });
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
