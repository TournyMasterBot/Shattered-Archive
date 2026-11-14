/**
 * Shared Copilot contracts: the vocabulary every other module (policy, ledger, server, client) uses.
 *
 * Pure data only. No clock, no file system, no network: callers pass those in.
 * Timestamps are epoch milliseconds. Characters are always referred to by codename
 * (`<Name>-<M|F>`), never by a real character name.
 */

/**
 * Marker written into every Copilot-only bundle and checked by `scripts/check-local-only.mjs`.
 * A production artifact containing this string means local-only code leaked into it.
 */
export const COPILOT_BUNDLE_MARKER = 'sa-copilot-local-v1';

/** Domain-knowledge spheres the training is organised by (scope: world, fighting, interaction, things). */
export const SPHERES = ['world', 'fighting', 'interaction', 'things'] as const;
export type Sphere = (typeof SPHERES)[number];

/** What the owner is currently doing; decides which kinds of suggestion the producer builds. */
export const MODES = ['battle', 'exploration', 'questing', 'leveling'] as const;
export type Mode = (typeof MODES)[number];

/**
 * Hard floor: these kinds are NEVER run without the owner, whatever the settings say.
 * (spend or lose items or gold, speak to other players, irreversible actions, player-kill)
 */
export const FLOOR_KINDS = ['spend-or-lose', 'speak', 'irreversible', 'pk'] as const;
export type FloorKind = (typeof FLOOR_KINDS)[number];

/**
 * What a command does, as far as approval is concerned. `unknown` is what the classifier answers for
 * anything it does not recognise, and it always resolves to "ask".
 */
export const ACTION_KINDS = [
  'move',
  'info',
  'interact',
  'loot',
  'ability',
  'fight-continue',
  'fight-start-known',
  'fight-start-unknown',
  ...FLOOR_KINDS,
  'unknown',
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

/**
 * A confidence is a finite number in [0, 1]. `null` means "no usable rating" (missing, NaN, out of
 * range); the policy treats it as ask.
 */
export type Confidence = number | null;

export interface Suggestion {
  id: string;
  /** Codename of the character the suggestion is for. */
  character: string;
  createdAt: number;
  mode: Mode;
  sphere: Sphere;
  kind: ActionKind;
  /** The exact line to send to the game. */
  command: string;
  /** Why the agent proposes it; shown to the owner. */
  rationale: string;
  /** The model's own rating, or the edge evidence for map movement. */
  confidence: Confidence;
  /** Where the confidence came from: the model's rating or the map's evidence. */
  confidenceSource: 'model' | 'map-evidence';
  /** Stable key of the situation the suggestion was made in (used for graduation and de-duplication). */
  situationKey: string;
}

export const DECISION_OUTCOMES = ['approved', 'corrected', 'rejected', 'auto', 'refused'] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

export interface Decision {
  id: string;
  suggestionId: string;
  character: string;
  at: number;
  outcome: DecisionOutcome;
  /** The command actually sent (the suggestion's, or the owner's correction). Absent for rejected/refused. */
  command?: string;
  /** The owner's short "why" note for a correction or rejection. */
  why?: string;
  /** For `auto`: the id of the rule that allowed it. For `refused`: why the command gate refused it. */
  rule?: string;
  /**
   * The bucket the answer belongs to: the suggestion's sphere and action kind. The ledger is the only record that outlives the
   * server's memory of suggestions, so the owner's history per bucket (the basis of earned confidence) is counted from these two.
   * Absent on older lines, which are then not counted.
   */
  sphere?: Sphere;
  kind?: ActionKind;
  /**
   * Set when the answer was given by the AI trainer in Claude training mode (Simulacrum only), not by the owner. Such a decision is kept in
   * its own ledger, never counts toward the owner's earned confidence, and is never applied to the DSL.
   */
  trainer?: Trainer;
}

/** Who may stand in for the owner as a trainer: only Claude, and only in the Simulacrum (see docs/copilot/claude-training.md). */
export const TRAINERS = ['claude'] as const;
export type Trainer = (typeof TRAINERS)[number];

export const LESSON_SCOPES = ['shared', 'class', 'race', 'ability-set', 'character-public'] as const;
export type LessonScope = (typeof LESSON_SCOPES)[number];

export const LESSON_WORLDS = ['dsl', 'sandbox'] as const;
export type LessonWorld = (typeof LESSON_WORLDS)[number];

export const LESSON_STATUSES = ['proposed', 'accepted', 'rejected', 'superseded'] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

export interface Lesson {
  id: string;
  createdAt: number;
  sphere: Sphere;
  /** The situation the lesson is about (the suggestion's `situationKey`); lessons are grouped and compared by it. */
  situationKey: string;
  scope: LessonScope;
  /** Class, race or ability-set name when `scope` needs one. */
  scopeKey?: string;
  world: LessonWorld;
  /** The rule in one sentence. */
  rule: string;
  sourceDecisionId: string;
  status: LessonStatus;
  /** Set on a lesson that came from the AI trainer's correction (Claude training mode): it belongs to the Simulacrum and never applies to the DSL. */
  trainer?: Trainer;
}

export const TICKET_REASONS = [
  'low-confidence',
  'correction-not-understood',
  'danger',
  'wrong-sphere',
  'persona-feedback',
  'unknown-situation',
] as const;
export type TicketReason = (typeof TICKET_REASONS)[number];

export const TICKET_STATUSES = ['open', 'resolved', 'declined'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export interface EscalationTicket {
  id: string;
  createdAt: number;
  character: string;
  reason: TicketReason;
  sphere: Sphere;
  /** What the agent was trying to do; with `sphere` and `situationKey` it names the scenario a ticket belongs to. */
  kind: ActionKind;
  situationKey: string;
  /** Scrubbed one-line summary; never raw log text. */
  summary: string;
  status: TicketStatus;
  decisionId?: string;
  /** Set when a teaching session resolves it into a written artifact. */
  resolution?: string;
}

/** What a teaching session concluded about a ticket. */
export const FINDING_VERDICTS = ['local-correct', 'local-wrong', 'data-gap', 'routing-gap', 'persona'] as const;
export type FindingVerdict = (typeof FINDING_VERDICTS)[number];

/** The kinds of artifact a finding can point at (the thing that was written or changed to fix the cause). */
export const ARTIFACT_KINDS = ['expert', 'mcp', 'sphere-link', 'skill', 'prompt', 'persona-proposal', 'map-correction', 'doc'] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export interface FindingArtifact {
  /** A repository-relative or data-folder path, for the owner to open. Never a URL, never with `..`. */
  path: string;
  kind: ArtifactKind;
}

/**
 * A teaching session's answer for one ticket. It arrives with `acceptedBy: null`; only the owner's acceptance sets it (and
 * `acceptedAt`), and only an accepted finding lets its scenario graduate.
 */
export interface Finding {
  id: string;
  ticketId: string;
  createdAt: number;
  verdict: FindingVerdict;
  /** Why, in a few sentences (names already replaced by codenames). */
  why: string;
  artifacts: FindingArtifact[];
  acceptedBy: 'owner' | null;
  acceptedAt?: number;
}

/**
 * A scenario came up and the owner took the agent's suggestion (approved, or a rule ran it). Only these count towards graduation: the
 * agent handled the situation without a ticket. The decision's own id is the id, so a retried decision counts once.
 */
export interface ScenarioOccurrence {
  id: string;
  at: number;
  sphere: Sphere;
  kind: ActionKind;
  situationKey: string;
}

export function isSphere(value: unknown): value is Sphere {
  return typeof value === 'string' && (SPHERES as readonly string[]).includes(value);
}

export function isMode(value: unknown): value is Mode {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value);
}

export function isActionKind(value: unknown): value is ActionKind {
  return typeof value === 'string' && (ACTION_KINDS as readonly string[]).includes(value);
}

export function isFloorKind(value: unknown): value is FloorKind {
  return typeof value === 'string' && (FLOOR_KINDS as readonly string[]).includes(value);
}
