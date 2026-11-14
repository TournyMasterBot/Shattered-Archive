import {
  ACTION_KINDS,
  isActionKind,
  isSphere,
  type ActionKind,
  type Suggestion,
  type Sphere,
} from '@shatteredarchive/copilot-core';
import type { Route } from './router.js';
import type { Situation } from './situation.js';

const MAX_COMMAND = 200;
const MAX_RATIONALE = 500;
/** Any control character, including a line break: a command that holds one could be two commands. */
const CONTROL = /[\u0000-\u001f\u007f]/;

/** The fight in progress as the monitor sees it, in a few lines (numbers are estimates from the game's own words, never exact). */
export function describeFight(situation: Situation): string[] {
  const f = situation.fight;
  if (f === undefined || !f.active) return [];
  const rounds = (value: number | null): string => (value === null ? 'unknown' : `about ${Math.max(1, Math.round(value))}`);
  const condition = f.opponentCondition === undefined ? 'unknown' : `${f.opponentCondition.minPct}-${f.opponentCondition.maxPct}% of its hit points`;
  return [
    `FIGHT (computed from the log, ${f.projected ? `projected ${f.behindRounds.toFixed(1)} rounds ahead` : 'current'}): against ${f.opponent ?? 'an unknown opponent'}, round ${f.roundNow}`,
    `  you: ${f.hpPct === undefined ? 'hit points unknown' : `${Math.round(f.hpPct)}% hit points`}, losing about ${f.takenPerRound.toFixed(1)} per round; rounds until you die: ${rounds(f.roundsToDie)}`,
    `  opponent: ${condition}, you deal about ${f.dealtPerRound.toFixed(1)} per round; rounds until it dies: ${rounds(f.roundsToKill)}`,
    `  the monitor expects: ${f.outcome}${f.reliable ? '' : ' (too little data to trust)'}; advice: ${f.advice}`,
  ];
}

function describe(situation: Situation): string[] {
  const { game } = situation;
  const vitals = game.vitals
    ? `hp ${game.vitals.hp}/${game.vitals.maxHp}, mana ${game.vitals.mana}/${game.vitals.maxMana}, move ${game.vitals.move}/${game.vitals.maxMove}`
    : 'unknown';
  return [
    `MODE: ${situation.mode}`,
    `ROOM: ${game.room?.name ?? 'unknown'} (${game.room?.sector ?? 'unknown'}), exits: ${game.room?.exits.join(' ') || 'none known'}`,
    `IN FIGHT: ${game.inFight ? 'yes' : 'no'}`,
    `VITALS: ${vitals}`,
    ...describeFight(situation),
    'RECENT TEXT:',
    ...(situation.lines.length > 0 ? situation.lines.map((line) => `> ${line}`) : ['> (none)']),
  ];
}

const SCHEMA = [
  'Answer with ONE JSON object and nothing else:',
  `{"command": "<one game command, no ';' and no line break>", "kind": "<one of: ${ACTION_KINDS.join(', ')}>", "sphere": "<your sphere>", "rationale": "<one sentence>", "confidence": <number from 0 to 1>}`,
  'If this situation does not belong to your sphere, answer {"wrongSphere": "<world|fighting|interaction|things>"} instead.',
  'Rate your own confidence honestly; when you do not know what to do, give a low number.',
  'Never attack a creature you have not identified: a fight command is only for a monster the archive knows or that `consider` has answered for.',
].join('\n');

/** The prompt for the watcher role. Names in `situation.lines` are already replaced; the prompt carries no raw log. */
export function buildWatcherPrompt(situation: Situation, route: Route): string {
  return [
    'You are the watcher of a local game-playing assistant. Propose the single next command for the player.',
    `SPHERE: ${route.sphere}`,
    ...describe(situation),
    ...(route.facts.length > 0 ? ['FACTS FROM THE ARCHIVE:', ...route.facts.map((f) => `- ${f}`)] : []),
    ...(route.lessons.length > 0 ? ['RULES THE OWNER TAUGHT FOR THIS SITUATION:', ...route.lessons.map((l) => `- ${l.rule}`)] : []),
    ...(route.hints !== undefined && route.hints.length > 0 ? ['HINTS FOR THIS ROOM (what is worth trying here; the fastest source that knew is named; check before acting):', ...route.hints.map((h) => `- ${h}`)] : []),
    SCHEMA,
  ].join('\n');
}

/** The second and last try: the same prompt plus what was wrong with the first answer. */
export function buildRepairPrompt(situation: Situation, route: Route, problem: string): string {
  return `${buildWatcherPrompt(situation, route)}\nYour previous answer was rejected: ${problem}. Answer again with only the JSON object.`;
}

/** The prompt for the agent role: restate what the owner corrected. */
export function buildRestatePrompt(suggestion: Suggestion, command: string, why: string | undefined, redact: (text: string) => string): string {
  return [
    'You are the agent of a local game-playing assistant. The owner corrected a suggestion. Restate the lesson.',
    `SPHERE: ${suggestion.sphere}`,
    `SITUATION: ${suggestion.situationKey}`,
    `SUGGESTED COMMAND: ${redact(suggestion.command)}`,
    `SUGGESTION RATIONALE: ${redact(suggestion.rationale)}`,
    `OWNER COMMAND: ${redact(command)}`,
    `OWNER WHY: ${why === undefined ? '(none given)' : redact(why)}`,
    'Answer with ONE JSON object and nothing else:',
    '{"rule": "<the lesson in one sentence>", "restatement": "<the correction in your own words; it must name the command the owner chose>", "confident": <true only if you are sure you understood>}',
    'If you did not understand the correction, answer with "confident": false.',
  ].join('\n');
}

export type WatcherAnswer =
  | { ok: true; kind: 'command'; command: string; actionKind: ActionKind; rationale: string; confidence: unknown }
  | { ok: true; kind: 'wrong-sphere'; sphere: Sphere }
  | { ok: false; problem: string };

/** Read the watcher's answer strictly: valid JSON, an object, and either a usable command or a wrong-sphere note. */
export function parseWatcherAnswer(text: string): WatcherAnswer {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'the answer is not valid JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { ok: false, problem: 'the answer is not a JSON object' };
  const answer = parsed as Record<string, unknown>;

  if (answer.wrongSphere !== undefined) {
    return isSphere(answer.wrongSphere) ? { ok: true, kind: 'wrong-sphere', sphere: answer.wrongSphere } : { ok: false, problem: 'wrongSphere is not a sphere' };
  }
  const command = typeof answer.command === 'string' ? answer.command.trim() : '';
  if (command === '') return { ok: false, problem: 'command is missing or empty' };
  if (command.length > MAX_COMMAND) return { ok: false, problem: 'command is too long' };
  if (CONTROL.test(command)) return { ok: false, problem: 'command contains a control character or line break' };
  if (!isActionKind(answer.kind)) return { ok: false, problem: 'kind is not one of the action kinds' };
  const rationale = typeof answer.rationale === 'string' ? answer.rationale.trim() : '';
  if (rationale === '') return { ok: false, problem: 'rationale is missing or empty' };
  return { ok: true, kind: 'command', command, actionKind: answer.kind, rationale: rationale.slice(0, MAX_RATIONALE), confidence: answer.confidence };
}
