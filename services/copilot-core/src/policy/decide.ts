import { isActionKind, isFloorKind, isSphere, type ActionKind, type Sphere, type Suggestion } from '../contracts.js';
import { isStale, type GameState } from '../log/state.js';
import { classifyCommand, moreRestrictive, type FightTarget } from './classify.js';
import { effectiveConfidence, toConfidence, type BucketStats } from './confidence.js';
import { ruleFor, ruleKey, type TrustSettings } from './settings.js';

/** A model rating below this files a ticket as well as asking (the teacher should know the agent was this unsure). */
export const ESCALATE_BELOW = 0.3;

export type PolicyOutcome = 'auto' | 'ask' | 'escalate';

/** Why the policy answered as it did. Stable codes: the client shows them and the ledger records them. */
export type PolicyReason =
  | 'stale'
  | 'floor'
  | 'unknown-class'
  | 'unknown-target'
  | 'no-confidence'
  | 'very-low-confidence'
  | 'no-rule'
  | 'insufficient-samples'
  | 'below-threshold'
  | 'rule-allows';

export interface PolicyDecision {
  outcome: PolicyOutcome;
  reason: PolicyReason;
  /** The kind the policy used: the stricter of what the producer claimed and what the classifier found. */
  kind: ActionKind;
  /** For `auto`: the bucket key of the rule that allowed it. */
  ruleId?: string;
}

export interface PolicyState {
  game: GameState;
  /** The owner's past decisions for a bucket, or undefined when there are none. */
  stats: (sphere: Sphere, kind: ActionKind) => BucketStats | undefined;
  /** What is known about the target of a fight-starting command. */
  target?: FightTarget;
}

type Candidate = Pick<Suggestion, 'command' | 'sphere' | 'kind' | 'confidence' | 'confidenceSource'>;

/**
 * Decide whether a suggestion may run by itself. The ONLY place that does. Everything defaults to ask, and the checks run in this order:
 *
 *  1. stale log feed                              -> ask
 *  2. the hard floor (spend/lose, speak, irreversible, pk) -> ask, whatever the settings say
 *  3. a command the classifier cannot place        -> escalate (a ticket as well as asking)
 *  4. a fight against a target not fully known     -> escalate
 *  5. a missing, NaN or out-of-range confidence    -> ask
 *  6. a model rating below ESCALATE_BELOW          -> escalate
 *  7. no enabled rule for (sphere, kind)           -> ask
 *  8. fewer than 20 owner decisions in the bucket  -> ask
 *  9. effective confidence below the threshold     -> ask
 * 10. otherwise                                    -> auto
 *
 * The command is classified again here; the producer's claimed kind can only make the result stricter, never looser.
 */
export function decide(suggestion: Candidate, settings: TrustSettings, state: PolicyState, now: number): PolicyDecision {
  const classified = classifyCommand(suggestion.command, { inFight: state.game.inFight, target: state.target });
  const claimed = isActionKind(suggestion.kind) ? suggestion.kind : 'unknown';
  const kind = moreRestrictive(classified, claimed);
  const ask = (reason: PolicyReason, outcome: PolicyOutcome = 'ask'): PolicyDecision => ({ outcome, reason, kind });

  if (isStale(state.game, now, settings.staleAfterSeconds * 1000)) return ask('stale');

  if (isFloorKind(kind)) return ask('floor');
  if (kind === 'unknown') return ask('unknown-class', 'escalate');
  if (kind === 'fight-start-unknown') return ask('unknown-target', 'escalate');

  const rating = toConfidence(suggestion.confidence);
  if (rating === null) return ask('no-confidence');
  if (rating < ESCALATE_BELOW) return ask('very-low-confidence', 'escalate');

  if (!isSphere(suggestion.sphere)) return ask('no-rule');
  const rule = ruleFor(settings, suggestion.sphere, kind);
  if (!rule.enabled) return ask('no-rule');

  const effective = effectiveConfidence(rating, state.stats(suggestion.sphere, kind));
  if (effective.value === null) return ask('insufficient-samples');
  if (effective.value < rule.threshold) return ask('below-threshold');

  return { outcome: 'auto', reason: 'rule-allows', kind, ruleId: ruleKey(suggestion.sphere, kind) };
}
