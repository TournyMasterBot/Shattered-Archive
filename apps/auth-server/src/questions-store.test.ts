import fs from 'fs';
import os from 'os';
import path from 'path';

import { QuestionsStore, ChallengeThrottle, REQUIRED_CORRECT } from './questions-store.js';
import { AuthError } from './errors.js';

function writePool(dir: string, questions: { id: string; prompt: string; acceptedAnswers: string[] }[]): void {
  fs.writeFileSync(path.join(dir, 'dsl-questions.json'), JSON.stringify({ questions }));
}

const POOL = [
  { id: 'q1', prompt: 'Q1?', acceptedAnswers: ['Answer One', 'A1'] },
  { id: 'q2', prompt: 'Q2?', acceptedAnswers: ['Answer Two'] },
  { id: 'q3', prompt: 'Q3?', acceptedAnswers: ['Answer Three'] },
  { id: 'q4', prompt: 'Q4?', acceptedAnswers: ['Answer Four'] },
];

describe('QuestionsStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'questions-store-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('issueChallenge throws when the pool has fewer than REQUIRED_CORRECT questions', () => {
    writePool(dir, POOL.slice(0, REQUIRED_CORRECT - 1));
    const store = new QuestionsStore(dir);
    expect(() => store.issueChallenge()).toThrow(AuthError);
  });

  it('issueChallenge draws exactly REQUIRED_CORRECT distinct questions and never leaks answers', () => {
    writePool(dir, POOL);
    const store = new QuestionsStore(dir);
    const { prompts } = store.issueChallenge();
    expect(prompts).toHaveLength(REQUIRED_CORRECT);
    const ids = new Set(prompts.map((p) => p.questionId));
    expect(ids.size).toBe(REQUIRED_CORRECT);
    expect(JSON.stringify(prompts)).not.toMatch(/Answer/);
  });

  it('verifyChallenge accepts normalized (trim/lowercase/whitespace-collapsed) correct answers', () => {
    writePool(dir, POOL);
    const store = new QuestionsStore(dir);
    const { challengeId, prompts } = store.issueChallenge();
    const answers: Record<string, string> = {};
    for (const p of prompts) {
      const q = POOL.find((x) => x.id === p.questionId)!;
      answers[p.questionId] = `  ${q.acceptedAnswers[0].toUpperCase().replace(/ /g, '   ')}  `; // messy but should normalize-match
    }
    expect(store.verifyChallenge(challengeId, answers)).toBe(true);
  });

  it('verifyChallenge fails if any answer is wrong', () => {
    writePool(dir, POOL);
    const store = new QuestionsStore(dir);
    const { challengeId, prompts } = store.issueChallenge();
    const answers: Record<string, string> = {};
    for (const p of prompts) {
      const q = POOL.find((x) => x.id === p.questionId)!;
      answers[p.questionId] = q.acceptedAnswers[0];
    }
    answers[prompts[0].questionId] = 'definitely wrong';
    expect(store.verifyChallenge(challengeId, answers)).toBe(false);
  });

  it('a challenge is single-use — verifying twice fails the second time even with correct answers', () => {
    writePool(dir, POOL);
    const store = new QuestionsStore(dir);
    const { challengeId, prompts } = store.issueChallenge();
    const answers: Record<string, string> = {};
    for (const p of prompts) answers[p.questionId] = POOL.find((x) => x.id === p.questionId)!.acceptedAnswers[0];

    expect(store.verifyChallenge(challengeId, answers)).toBe(true);
    expect(store.verifyChallenge(challengeId, answers)).toBe(false);
  });

  it('an expired challenge fails verification even with correct answers', () => {
    writePool(dir, POOL);
    const store = new QuestionsStore(dir);
    jest.useFakeTimers();
    try {
      const { challengeId, prompts } = store.issueChallenge();
      const answers: Record<string, string> = {};
      for (const p of prompts) answers[p.questionId] = POOL.find((x) => x.id === p.questionId)!.acceptedAnswers[0];

      jest.advanceTimersByTime(11 * 60 * 1000); // past the 10min TTL
      expect(store.verifyChallenge(challengeId, answers)).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('unknown challengeId fails verification (never throws)', () => {
    writePool(dir, POOL);
    const store = new QuestionsStore(dir);
    expect(store.verifyChallenge('nonexistent', { q1: 'anything' })).toBe(false);
  });
});

describe('ChallengeThrottle', () => {
  it('allows up to capacity requests, then blocks', () => {
    const throttle = new ChallengeThrottle(3, 10 * 60 * 1000);
    expect(throttle.allow('1.2.3.4')).toBe(true);
    expect(throttle.allow('1.2.3.4')).toBe(true);
    expect(throttle.allow('1.2.3.4')).toBe(true);
    expect(throttle.allow('1.2.3.4')).toBe(false);
  });

  it('tracks separate IPs independently', () => {
    const throttle = new ChallengeThrottle(1, 10 * 60 * 1000);
    expect(throttle.allow('1.1.1.1')).toBe(true);
    expect(throttle.allow('2.2.2.2')).toBe(true);
    expect(throttle.allow('1.1.1.1')).toBe(false);
  });

  it('refills over time', () => {
    const throttle = new ChallengeThrottle(1, 5);
    expect(throttle.allow('1.1.1.1')).toBe(true);
    expect(throttle.allow('1.1.1.1')).toBe(false);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(throttle.allow('1.1.1.1')).toBe(true);
        resolve();
      }, 20);
    });
  });
});
