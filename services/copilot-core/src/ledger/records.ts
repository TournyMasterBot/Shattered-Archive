import {
  ACTION_KINDS,
  ARTIFACT_KINDS,
  FINDING_VERDICTS,
  DECISION_OUTCOMES,
  LESSON_SCOPES,
  LESSON_STATUSES,
  LESSON_WORLDS,
  MODES,
  SPHERES,
  TICKET_REASONS,
  TICKET_STATUSES,
  TRAINERS,
  type Decision,
  type EscalationTicket,
  type Finding,
  type FindingArtifact,
  type Lesson,
  type ScenarioOccurrence,
  type Suggestion,
} from '../contracts.js';

/**
 * Hand-written validators for the records the training loop stores and the HTTP surface accepts. They are strict on purpose:
 * unknown fields are rejected, every string has a length cap, ids and codenames must match a pattern before they are used in a
 * path or a key, and the result lists every problem found (without echoing the offending value, which may be text from the game).
 */

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export const MAX_ID = 64;
export const MAX_COMMAND = 200;
export const MAX_WHY = 500;
export const MAX_RULE = 500;
export const MAX_SUMMARY = 500;
export const MAX_RESOLUTION = 1000;
export const MAX_SITUATION_KEY = 200;
export const MAX_SCOPE_KEY = 60;
export const MAX_RATIONALE = 500;

export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
/** A codename reference: `Base-G`, for example `Agate-F` or `Orion-U`. */
export const CODENAME_REF_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,23}-[MFU]$/;

interface FieldOptions {
  max: number;
  optional?: boolean;
  pattern?: RegExp;
}

class Reader {
  readonly errors: string[] = [];
  private readonly seen = new Set<string>();

  constructor(private readonly input: Record<string, unknown>) {}

  string(key: string, { max, optional = false, pattern }: FieldOptions): string | undefined {
    this.seen.add(key);
    const value = this.input[key];
    if (value === undefined) {
      if (!optional) this.errors.push(`${key} is required`);
      return undefined;
    }
    if (typeof value !== 'string') {
      this.errors.push(`${key} must be a string`);
      return undefined;
    }
    if (value.trim() === '') {
      this.errors.push(`${key} must not be empty`);
      return undefined;
    }
    if (value.length > max) {
      this.errors.push(`${key} is longer than ${max} characters`);
      return undefined;
    }
    if (pattern && !pattern.test(value)) {
      this.errors.push(`${key} has the wrong format`);
      return undefined;
    }
    return value;
  }

  time(key: string): number | undefined {
    this.seen.add(key);
    const value = this.input[key];
    if (value === undefined) {
      this.errors.push(`${key} is required`);
      return undefined;
    }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      this.errors.push(`${key} must be a non-negative integer`);
      return undefined;
    }
    return value;
  }

  oneOf<T extends string>(key: string, allowed: readonly T[]): T | undefined {
    this.seen.add(key);
    const value = this.input[key];
    if (value === undefined) {
      this.errors.push(`${key} is required`);
      return undefined;
    }
    if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
      this.errors.push(`${key} is not one of the allowed values`);
      return undefined;
    }
    return value as T;
  }

  /** Like `oneOf`, but the key may be absent. A value that is given must still be one of the allowed ones. */
  optionalOneOf<T extends string>(key: string, allowed: readonly T[]): T | undefined {
    this.seen.add(key);
    if (this.input[key] === undefined) return undefined;
    return this.oneOf(key, allowed);
  }

  /** A confidence: null (no usable rating) or a number in [0, 1]. Anything else, including a missing value, is an error. */
  nullableUnit(key: string): number | null {
    this.seen.add(key);
    const value = this.input[key];
    if (value === null) return null;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1) return value;
    this.errors.push(`${key} must be null or a number between 0 and 1`);
    return null;
  }

  /** Mark a key as read by custom code, so `rejectUnknown` does not report it. */
  markSeen(key: string): void {
    this.seen.add(key);
  }

  /** Report every key the validator did not read. */
  rejectUnknown(): void {
    for (const key of Object.keys(this.input)) {
      if (!this.seen.has(key)) this.errors.push(`unknown field ${key.slice(0, 40)}`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finish<T>(reader: Reader, value: T): Validated<T> {
  reader.rejectUnknown();
  return reader.errors.length > 0 ? { ok: false, errors: reader.errors } : { ok: true, value };
}

const NOT_AN_OBJECT: Validated<never> = { ok: false, errors: ['body must be an object'] };

export function validateDecision(input: unknown): Validated<Decision> {
  if (!isRecord(input)) return NOT_AN_OBJECT;
  const r = new Reader(input);
  const id = r.string('id', { max: MAX_ID, pattern: ID_PATTERN });
  const suggestionId = r.string('suggestionId', { max: MAX_ID, pattern: ID_PATTERN });
  const character = r.string('character', { max: 30, pattern: CODENAME_REF_PATTERN });
  const at = r.time('at');
  const outcome = r.oneOf('outcome', DECISION_OUTCOMES);
  const needsCommand = outcome === 'approved' || outcome === 'corrected' || outcome === 'auto';
  const command = r.string('command', { max: MAX_COMMAND, optional: !needsCommand });
  const why = r.string('why', { max: MAX_WHY, optional: true });
  const rule = r.string('rule', { max: 100, optional: outcome !== 'auto' && outcome !== 'refused' });
  const sphere = r.optionalOneOf('sphere', SPHERES);
  const kind = r.optionalOneOf('kind', ACTION_KINDS);
  const trainer = r.optionalOneOf('trainer', TRAINERS);
  const value = { id, suggestionId, character, at, outcome, command, why, rule, sphere, kind, trainer } as Decision;
  // keys that were not given must be absent rather than `undefined`
  for (const key of ['command', 'why', 'rule', 'sphere', 'kind', 'trainer'] as const) if (value[key] === undefined) delete value[key];
  return finish(r, value);
}

export function validateLesson(input: unknown): Validated<Lesson> {
  if (!isRecord(input)) return NOT_AN_OBJECT;
  const r = new Reader(input);
  const id = r.string('id', { max: MAX_ID, pattern: ID_PATTERN });
  const createdAt = r.time('createdAt');
  const sphere = r.oneOf('sphere', SPHERES);
  const situationKey = r.string('situationKey', { max: MAX_SITUATION_KEY });
  const scope = r.oneOf('scope', LESSON_SCOPES);
  const needsKey = scope === 'class' || scope === 'race' || scope === 'ability-set';
  const scopeKey = r.string('scopeKey', { max: MAX_SCOPE_KEY, optional: !needsKey });
  if (scope !== undefined && !needsKey && input.scopeKey !== undefined) {
    r.errors.push('scopeKey is only allowed for the class, race and ability-set scopes');
  }
  const world = r.oneOf('world', LESSON_WORLDS);
  const rule = r.string('rule', { max: MAX_RULE });
  const sourceDecisionId = r.string('sourceDecisionId', { max: MAX_ID, pattern: ID_PATTERN });
  const status = r.oneOf('status', LESSON_STATUSES);
  const trainer = r.optionalOneOf('trainer', TRAINERS);
  const value = { id, createdAt, sphere, situationKey, scope, scopeKey, world, rule, sourceDecisionId, status, trainer } as Lesson;
  if (value.scopeKey === undefined) delete value.scopeKey;
  if (value.trainer === undefined) delete value.trainer;
  // a trainer's lesson belongs to the Simulacrum: it can never be a lesson of the DSL
  if (value.trainer !== undefined && world !== undefined && world !== 'sandbox') r.errors.push('a trainer lesson must be for the sandbox world');
  return finish(r, value);
}

/** The persona fields feedback can point at (the Shattered Story persona file's own keys), or `unknown` when the owner cannot say. */
export const PERSONA_FIELDS = ['role', 'stance', 'voice', 'expertise', 'blindspots', 'interests', 'pressures', 'sphere', 'concerns', 'redLines', 'concessions', 'secrets', 'goals', 'unknown'] as const;
export type PersonaField = (typeof PERSONA_FIELDS)[number];
/** The summary holds a prefix of about 60 characters, so the why leaves room within MAX_SUMMARY. */
export const MAX_PERSONA_WHY = 400;

export interface PersonaFeedback {
  /** The character as a codename reference (`Agate-F`). */
  codename: string;
  field: PersonaField;
  why: string;
}

const PERSONA_SUMMARY = /^Persona feedback for ([A-Za-z][A-Za-z0-9]{0,23}-[MFU]); field: ([A-Za-z]+); why: ([\s\S]+)$/;

/** The one-line summary of a `persona-feedback` ticket, or null when the pieces are not usable (a bad codename, field or why). */
export function buildPersonaFeedbackSummary(feedback: PersonaFeedback): string | null {
  const why = feedback.why.replace(/\s+/g, ' ').trim();
  if (!CODENAME_REF_PATTERN.test(feedback.codename) || !(PERSONA_FIELDS as readonly string[]).includes(feedback.field)) return null;
  if (why === '' || why.length > MAX_PERSONA_WHY) return null;
  return `Persona feedback for ${feedback.codename}; field: ${feedback.field}; why: ${why}`;
}

/** Reads a summary made by `buildPersonaFeedbackSummary`; null for anything else. */
export function parsePersonaFeedbackSummary(summary: string): PersonaFeedback | null {
  const m = PERSONA_SUMMARY.exec(summary);
  if (!m || !(PERSONA_FIELDS as readonly string[]).includes(m[2]) || m[3].length > MAX_PERSONA_WHY || m[3].trim() === '') return null;
  return { codename: m[1], field: m[2] as PersonaField, why: m[3] };
}

export function validateTicket(input: unknown): Validated<EscalationTicket> {
  if (!isRecord(input)) return NOT_AN_OBJECT;
  const r = new Reader(input);
  const id = r.string('id', { max: MAX_ID, pattern: ID_PATTERN });
  const createdAt = r.time('createdAt');
  const character = r.string('character', { max: 30, pattern: CODENAME_REF_PATTERN });
  const reason = r.oneOf('reason', TICKET_REASONS);
  const sphere = r.oneOf('sphere', SPHERES);
  const kind = r.oneOf('kind', ACTION_KINDS);
  const situationKey = r.string('situationKey', { max: MAX_SITUATION_KEY });
  const summary = r.string('summary', { max: MAX_SUMMARY });
  const status = r.oneOf('status', TICKET_STATUSES);
  const decisionId = r.string('decisionId', { max: MAX_ID, pattern: ID_PATTERN, optional: true });
  const resolution = r.string('resolution', { max: MAX_RESOLUTION, optional: true });
  if (reason === 'persona-feedback' && summary !== undefined) {
    const persona = parsePersonaFeedbackSummary(summary);
    if (persona === null) r.errors.push('summary of a persona-feedback ticket must read "Persona feedback for <codename>; field: <field>; why: <text>"');
    else if (persona.codename !== character) r.errors.push('the persona in the summary must be the ticket\'s character');
  }
  const value = { id, createdAt, character, reason, sphere, kind, situationKey, summary, status, decisionId, resolution } as EscalationTicket;
  for (const key of ['decisionId', 'resolution'] as const) if (value[key] === undefined) delete value[key];
  return finish(r, value);
}

export const MAX_ARTIFACTS = 10;
export const MAX_ARTIFACT_PATH = 200;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

function validateArtifacts(value: unknown, errors: string[]): FindingArtifact[] {
  if (!Array.isArray(value)) {
    errors.push('artifacts must be a list');
    return [];
  }
  if (value.length > MAX_ARTIFACTS) {
    errors.push(`artifacts has more than ${MAX_ARTIFACTS} entries`);
    return [];
  }
  const out: FindingArtifact[] = [];
  value.forEach((item, i) => {
    if (!isRecord(item)) {
      errors.push(`artifacts[${i}] must be an object`);
      return;
    }
    const r = new Reader(item);
    const artifactPath = r.string('path', { max: MAX_ARTIFACT_PATH });
    const kind = r.oneOf('kind', ARTIFACT_KINDS);
    r.rejectUnknown();
    for (const problem of r.errors) errors.push(`artifacts[${i}].${problem}`);
    if (artifactPath !== undefined && (CONTROL_CHARACTER.test(artifactPath) || artifactPath.split(/[\\/]/).includes('..') || /^[a-z][a-z0-9+.-]*:\/\//i.test(artifactPath))) {
      errors.push(`artifacts[${i}].path must be a plain path (no control characters, no .., no URL)`);
    }
    if (artifactPath !== undefined && kind !== undefined) out.push({ path: artifactPath, kind });
  });
  return out;
}

/** A finding as a teaching session writes it, or as the ledger stores it. `acceptedBy` is explicit: `null` or `owner`. */
export function validateFinding(input: unknown): Validated<Finding> {
  if (!isRecord(input)) return NOT_AN_OBJECT;
  const r = new Reader(input);
  const id = r.string('id', { max: MAX_ID, pattern: ID_PATTERN });
  const ticketId = r.string('ticketId', { max: MAX_ID, pattern: ID_PATTERN });
  const createdAt = r.time('createdAt');
  const verdict = r.oneOf('verdict', FINDING_VERDICTS);
  const why = r.string('why', { max: MAX_RESOLUTION });
  r.markSeen('artifacts');
  const artifacts = validateArtifacts(input.artifacts, r.errors);
  r.markSeen('acceptedBy');
  let acceptedBy: 'owner' | null = null;
  if (input.acceptedBy === 'owner') acceptedBy = 'owner';
  else if (input.acceptedBy !== null) r.errors.push('acceptedBy must be null or owner');
  const acceptedAt = acceptedBy === 'owner' ? r.time('acceptedAt') : undefined;
  if (acceptedBy === null && input.acceptedAt !== undefined) r.errors.push('acceptedAt is only allowed for an accepted finding');
  r.markSeen('acceptedAt');
  const value = { id, ticketId, createdAt, verdict, why, artifacts, acceptedBy, acceptedAt } as Finding;
  if (value.acceptedAt === undefined) delete value.acceptedAt;
  return finish(r, value);
}

export function validateOccurrence(input: unknown): Validated<ScenarioOccurrence> {
  if (!isRecord(input)) return NOT_AN_OBJECT;
  const r = new Reader(input);
  const id = r.string('id', { max: MAX_ID, pattern: ID_PATTERN });
  const at = r.time('at');
  const sphere = r.oneOf('sphere', SPHERES);
  const kind = r.oneOf('kind', ACTION_KINDS);
  const situationKey = r.string('situationKey', { max: MAX_SITUATION_KEY });
  return finish(r, { id, at, sphere, kind, situationKey } as ScenarioOccurrence);
}

/** The server's suggestion, as the client reads it. */
export function validateSuggestion(input: unknown): Validated<Suggestion> {
  if (!isRecord(input)) return NOT_AN_OBJECT;
  const r = new Reader(input);
  const id = r.string('id', { max: MAX_ID, pattern: ID_PATTERN });
  const character = r.string('character', { max: 30, pattern: CODENAME_REF_PATTERN });
  const createdAt = r.time('createdAt');
  const mode = r.oneOf('mode', MODES);
  const sphere = r.oneOf('sphere', SPHERES);
  const kind = r.oneOf('kind', ACTION_KINDS);
  const command = r.string('command', { max: MAX_COMMAND });
  const rationale = r.string('rationale', { max: MAX_RATIONALE });
  const confidenceSource = r.oneOf('confidenceSource', ['model', 'map-evidence'] as const);
  const situationKey = r.string('situationKey', { max: MAX_SITUATION_KEY });
  const confidence = r.nullableUnit('confidence');
  const value = { id, character, createdAt, mode, sphere, kind, command, rationale, confidence, confidenceSource, situationKey } as Suggestion;
  return finish(r, value);
}
