import {
  JsonlStore,
  scrub,
  validateDecision,
  validateFinding,
  validateLesson,
  validateOccurrence,
  validateTicket,
  type Decision,
  type EscalationTicket,
  type Finding,
  type Lesson,
  type ScenarioOccurrence,
  type Validated,
} from '@shatteredarchive/copilot-core';
import { MemoryFs } from './memoryFs.js';

/** Real names that must never appear in anything the teaching side writes or returns. */
export const REAL_NAMES = ['Zorvak', 'Mirelle'];

/** The replacement the character registry would make: every registered name becomes its codename. */
export const redact = (text: string): string =>
  scrub(text, [
    { name: 'Zorvak', replacement: 'Orion-M' },
    { name: 'Mirelle', replacement: 'Agate-F' },
  ]).text;

export interface Ledger {
  fs: MemoryFs;
  decisions: JsonlStore<Decision>;
  tickets: JsonlStore<EscalationTicket>;
  lessons: JsonlStore<Lesson>;
  findings: JsonlStore<Finding>;
  occurrences: JsonlStore<ScenarioOccurrence>;
}

export async function openLedger(fs: MemoryFs = new MemoryFs()): Promise<Ledger> {
  const open = async <T extends { id: string }>(file: string, validate: (value: unknown) => Validated<T>) =>
    (await JsonlStore.open<T>({ fs, path: `/ledger/${file}.jsonl`, validate })).store;
  return {
    fs,
    decisions: await open<Decision>('decisions', validateDecision),
    tickets: await open<EscalationTicket>('tickets', validateTicket),
    lessons: await open<Lesson>('lessons', validateLesson),
    findings: await open<Finding>('findings', validateFinding),
    occurrences: await open<ScenarioOccurrence>('occurrences', validateOccurrence),
  };
}

export const aTicket = (over: Partial<EscalationTicket> = {}): EscalationTicket => ({
  id: 't1',
  createdAt: 1000,
  character: 'Agate-F',
  reason: 'correction-not-understood',
  sphere: 'interaction',
  kind: 'interact',
  situationKey: 'exploration:hall-door',
  summary: 'The agent did not understand the correction.',
  status: 'open',
  ...over,
});

export const aLesson = (over: Partial<Lesson> = {}): Lesson => ({
  id: 'l1',
  createdAt: 1100,
  sphere: 'interaction',
  situationKey: 'exploration:hall-door',
  scope: 'shared',
  world: 'dsl',
  rule: 'Open the door before moving north.',
  sourceDecisionId: 'd1',
  status: 'proposed',
  ...over,
});

export const aDecision = (over: Partial<Decision> = {}): Decision => ({
  id: 'd1',
  suggestionId: 's1',
  character: 'Agate-F',
  at: 1050,
  outcome: 'corrected',
  command: 'open door',
  why: 'The door is closed.',
  ...over,
});

export const aFinding = (over: Partial<Finding> = {}): Finding => ({
  id: 'f1',
  ticketId: 't1',
  createdAt: 2000,
  verdict: 'data-gap',
  why: 'The expert has no entry for this door.',
  artifacts: [{ path: 'tools/archive-mcp/experts/rooms.json', kind: 'expert' }],
  acceptedBy: null,
  ...over,
});
