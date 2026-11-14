import type { ActionKind, Lesson, Sphere } from '../contracts.js';

/** A scenario graduates after this many later occurrences without a ticket, following an owner acceptance. */
export const GRADUATION_CLEAN_OCCURRENCES = 10;

/** Names one recurring situation: what the agent was doing, in which sphere, in which situation. */
export interface Scenario {
  sphere: Sphere;
  kind: ActionKind;
  situationKey: string;
}

export function scenarioKey(s: Scenario): string {
  return `${s.sphere}:${s.kind}:${s.situationKey}`;
}

/** What happened to a scenario, in time order. */
export type ScenarioEvent =
  /** The agent needed Claude: an escalation ticket was opened. */
  | { type: 'ticket'; at: number; scenario: Scenario }
  /** The owner accepted a finding or artifact that addresses the scenario. The only way a scenario can graduate. */
  | { type: 'accepted'; at: number; scenario: Scenario }
  /** The scenario came up again and the agent handled it without a ticket. */
  | { type: 'occurrence'; at: number; scenario: Scenario };

export interface ScenarioState {
  scenario: Scenario;
  /** How many times Claude was needed for this scenario. */
  claudeNeeded: number;
  /** The owner has accepted a fix and no ticket has been opened since. */
  accepted: boolean;
  /** Occurrences without a ticket since the last acceptance. */
  cleanSinceAcceptance: number;
  graduated: boolean;
}

/**
 * Fold the events of every scenario into its state. Events are put in time order (stable).
 *
 *  - a ticket counts one more Claude-needed event and resets everything after it: the scenario is no longer accepted or graduated;
 *  - an acceptance starts the clean count at zero;
 *  - an occurrence counts only after an acceptance, and the scenario graduates at GRADUATION_CLEAN_OCCURRENCES of them.
 *
 * Without an acceptance a scenario never graduates, however many clean occurrences it has.
 */
export function computeScenarioStates(events: readonly ScenarioEvent[]): Map<string, ScenarioState> {
  const states = new Map<string, ScenarioState>();
  const ordered = [...events].sort((a, b) => a.at - b.at);
  for (const event of ordered) {
    const key = scenarioKey(event.scenario);
    let state = states.get(key);
    if (!state) {
      state = { scenario: event.scenario, claudeNeeded: 0, accepted: false, cleanSinceAcceptance: 0, graduated: false };
      states.set(key, state);
    }
    if (event.type === 'ticket') {
      state.claudeNeeded++;
      state.accepted = false;
      state.cleanSinceAcceptance = 0;
      state.graduated = false;
    } else if (event.type === 'accepted') {
      state.accepted = true;
      state.cleanSinceAcceptance = 0;
      state.graduated = false;
    } else if (state.accepted) {
      state.cleanSinceAcceptance++;
      if (state.cleanSinceAcceptance >= GRADUATION_CLEAN_OCCURRENCES) state.graduated = true;
    }
  }
  return states;
}

export interface LessonConflict {
  sphere: Sphere;
  situationKey: string;
  /** The lessons that give different rules for the same situation under the same world and scope. */
  lessons: Lesson[];
}

function normaliseRule(rule: string): string {
  return rule.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Lessons that disagree and cannot both be applied: same sphere, situation, world and scope (and scope key), different rule text.
 * Lessons whose world or scope differ do NOT conflict: both are kept with their tags (E6), and which one applies depends on the world
 * the agent is in and on who it is. Rejected and superseded lessons are ignored. Conflicts are reported, never resolved here:
 * a teaching session decides.
 */
export function detectLessonConflicts(lessons: readonly Lesson[]): LessonConflict[] {
  const groups = new Map<string, Lesson[]>();
  for (const lesson of lessons) {
    if (lesson.status === 'rejected' || lesson.status === 'superseded') continue;
    const key = JSON.stringify([lesson.sphere, lesson.situationKey, lesson.world, lesson.scope, lesson.scopeKey ?? null]);
    groups.set(key, [...(groups.get(key) ?? []), lesson]);
  }
  const conflicts: LessonConflict[] = [];
  for (const group of groups.values()) {
    if (new Set(group.map((l) => normaliseRule(l.rule))).size > 1) {
      conflicts.push({ sphere: group[0].sphere, situationKey: group[0].situationKey, lessons: group });
    }
  }
  return conflicts;
}
