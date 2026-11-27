import type { ModelClient, ModelResult, ModelRole } from './types.js';

export interface FakeCall {
  role: ModelRole;
  prompt: string;
}

/** An answer, or a function that makes one from the call (for example to read the prompt). */
export type FakeAnswer = string | ModelResult | ((call: FakeCall) => string | ModelResult);

/**
 * A deterministic model for tests and offline runs. Answers come from `script` in order (the last one repeats); with no script it
 * answers every `watcher` call with a harmless `look` and every `agent` call with a restatement built from the correction in the
 * prompt, so the whole loop can run without a model. Records every call.
 */
export function createFakeModel(script: readonly FakeAnswer[] = []): ModelClient & { calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  return {
    calls,
    async generate(role, prompt, signal) {
      if (signal?.aborted) return { ok: false, reason: 'aborted' };
      const call = { role, prompt };
      calls.push(call);
      const answer = script.length > 0 ? script[Math.min(calls.length - 1, script.length - 1)] : defaultAnswer(call);
      const resolved = typeof answer === 'function' ? answer(call) : answer;
      return typeof resolved === 'string' ? { ok: true, text: resolved } : resolved;
    },
  };
}

function defaultAnswer({ role, prompt }: FakeCall): string {
  if (role === 'watcher') {
    return JSON.stringify({ command: 'look', kind: 'info', sphere: /SPHERE: (\w+)/.exec(prompt)?.[1] ?? 'world', rationale: 'Look around first.', confidence: 0.9 });
  }
  const corrected = /OWNER COMMAND: (.+)/.exec(prompt)?.[1] ?? '';
  const verb = corrected.trim().split(/\s+/)[0];
  return JSON.stringify({ rule: `Prefer "${corrected.trim()}" here.`, restatement: `The owner chose ${verb} instead.`, confident: true });
}
