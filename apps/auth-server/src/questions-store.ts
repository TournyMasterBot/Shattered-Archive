import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { AuthError } from './errors.js';

/**
 * AI-ANNOTATION
 * @ai-summary Anti-bot signup challenge: an operator-hand-edited, PLAIN
 *   (unencrypted, deliberately — see the plan's Constraints/step 5) pool of
 *   DSL-knowledge Q&A at <DATA_DIR>/dsl-questions.json, mtime-reloaded like
 *   auth-store.ts. issueChallenge() draws 3 random questions into an
 *   in-memory-only, single-use challenge instance; verifyChallenge requires
 *   all 3 correct. A basic in-memory per-IP token bucket throttles issuance.
 * @ai-public QuestionsStore, ChallengeThrottle, REQUIRED_CORRECT
 * @ai-notes A corrupt/malformed dsl-questions.json LOCKS the pool (reports
 *   empty, refuses to silently fall back) rather than risk quietly disabling
 *   the anti-bot gate on a hand-edit typo. No behavioral/telemetry field
 *   anywhere here — isHumanScore is client-only in the future Phase 2 UI.
 */

export interface QuestionRecord {
  id: string;
  prompt: string;
  acceptedAnswers: string[];
}

interface QuestionsFileData {
  questions: QuestionRecord[];
}

interface ChallengeInstance {
  challengeId: string;
  questionIds: string[];
  expiresAt: number;
  used: boolean;
}

export const REQUIRED_CORRECT = 3;
const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10min

function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function answerMatches(candidate: string, accepted: string[]): boolean {
  const normalized = normalizeAnswer(candidate);
  return accepted.some((a) => normalizeAnswer(a) === normalized);
}

/** Uniform pick-without-replacement (partial Fisher-Yates) — `.sort(() => random)` is a well-known biased anti-pattern, avoided deliberately. */
function pickRandom<T>(items: T[], count: number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = crypto.randomInt(0, pool.length);
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}

/** Simple fixed-capacity, steady-refill token bucket per IP — no new dependency. */
export class ChallengeThrottle {
  private readonly buckets = new Map<string, { tokens: number; lastRefillMs: number }>();

  constructor(
    private readonly capacity = 5,
    private readonly refillIntervalMs = 2 * 60 * 1000, // +1 token every 2min
  ) {}

  /** Returns true if this IP may issue another challenge right now (and consumes a token). */
  allow(ip: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(ip) ?? { tokens: this.capacity, lastRefillMs: now };
    const elapsed = now - bucket.lastRefillMs;
    if (elapsed > 0) {
      const refilled = Math.floor(elapsed / this.refillIntervalMs);
      if (refilled > 0) {
        bucket.tokens = Math.min(this.capacity, bucket.tokens + refilled);
        bucket.lastRefillMs = now;
      }
    }
    if (bucket.tokens <= 0) {
      this.buckets.set(ip, bucket);
      return false;
    }
    bucket.tokens -= 1;
    this.buckets.set(ip, bucket);
    return true;
  }
}

export class QuestionsStore {
  private readonly filePath: string;
  private data: QuestionsFileData = { questions: [] };
  private locked = false;
  private mtimeMs = 0;

  private readonly challenges = new Map<string, ChallengeInstance>();

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, 'dsl-questions.json');
  }

  private questions(): QuestionRecord[] {
    if (this.locked) return [];
    try {
      if (!fs.existsSync(this.filePath)) return [];
      const stat = fs.statSync(this.filePath);
      if (stat.mtimeMs === this.mtimeMs) return this.data.questions;
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as QuestionsFileData;
      if (!Array.isArray(parsed.questions)) throw new Error('malformed dsl-questions.json: missing "questions" array');
      this.data = parsed;
      this.mtimeMs = stat.mtimeMs;
      return this.data.questions;
    } catch (e) {
      this.locked = true;
      console.error(
        `[questions-store] cannot read ${this.filePath} (${(e as Error).message}) — the anti-bot pool is LOCKED (reports empty) until the file is fixed on the host`,
      );
      return [];
    }
  }

  private sweepExpiredChallenges(): void {
    const now = Date.now();
    for (const [id, instance] of this.challenges) {
      if (instance.expiresAt < now) this.challenges.delete(id);
    }
  }

  issueChallenge(): { challengeId: string; prompts: { questionId: string; prompt: string }[] } {
    const pool = this.questions();
    if (pool.length < REQUIRED_CORRECT) {
      throw new AuthError(
        `signup challenge pool has fewer than ${REQUIRED_CORRECT} questions — an operator must populate ${this.filePath}`,
        503,
      );
    }
    this.sweepExpiredChallenges();

    const chosen = pickRandom(pool, REQUIRED_CORRECT);
    const challengeId = crypto.randomBytes(16).toString('base64url');
    this.challenges.set(challengeId, {
      challengeId,
      questionIds: chosen.map((q) => q.id),
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
      used: false,
    });

    return {
      challengeId,
      prompts: chosen.map((q) => ({ questionId: q.id, prompt: q.prompt })),
    };
  }

  /** Marks the challenge used immediately, even on failure, so it can never be replayed. */
  verifyChallenge(challengeId: string, answers: Record<string, string>): boolean {
    const instance = this.challenges.get(challengeId);
    if (!instance || instance.used || instance.expiresAt < Date.now()) return false;
    instance.used = true;

    const pool = this.questions();
    let correct = 0;
    for (const questionId of instance.questionIds) {
      const question = pool.find((q) => q.id === questionId);
      const answer = answers[questionId];
      if (question && typeof answer === 'string' && answerMatches(answer, question.acceptedAnswers)) {
        correct += 1;
      }
    }
    return correct === REQUIRED_CORRECT;
  }
}
