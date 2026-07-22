import { useCallback, useEffect, useState } from 'react';

import { api, ApiError, type Challenge } from '../../api/client.js';

interface SignupPageProps {
  onSwitchToLogin: () => void;
}

/** Anti-bot challenge (3 random questions) -> signup -> show the one-time password exactly once. */
export default function SignupPage({ onSwitchToLogin }: SignupPageProps) {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [username, setUsername] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ username: string; password: string; note: string } | null>(null);

  const loadChallenge = useCallback(async () => {
    setError(null);
    try {
      setChallenge(await api.challenge());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadChallenge();
  }, [loadChallenge]);

  const submit = async () => {
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.signup({ username: username.trim(), challengeId: challenge.challengeId, answers });
      setIssued(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
      // A failed challenge (400) never says which answer was wrong — fetch a fresh one rather than retry the same.
      setChallenge(null);
      setAnswers({});
      void loadChallenge();
    } finally {
      setBusy(false);
    }
  };

  if (issued) {
    return (
      <div className="auc-page">
        <h2>Account created</h2>
        <fieldset className="auc-fieldset">
          <legend>Your password — shown only once</legend>
          <p>{issued.note}</p>
          <input aria-label="One-time password" readOnly value={issued.password} onFocus={(e) => e.target.select()} />
        </fieldset>
        <button type="button" onClick={onSwitchToLogin}>
          Continue to login
        </button>
      </div>
    );
  }

  const allAnswered = challenge !== null && challenge.prompts.every((p) => (answers[p.questionId] ?? '').trim().length > 0);

  return (
    <div className="auc-page">
      <h2>Create an account</h2>
      {error ? <p className="auc-toast auc-toast--err">{error}</p> : null}
      <label className="auc-field">
        <span>Username</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
      </label>

      {challenge ? (
        <fieldset className="auc-fieldset">
          <legend>Answer these to prove you're human</legend>
          {challenge.prompts.map((p) => (
            <label className="auc-field" key={p.questionId}>
              <span>{p.prompt}</span>
              <input
                value={answers[p.questionId] ?? ''}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [p.questionId]: e.target.value }))}
              />
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="auc-muted">Loading challenge…</p>
      )}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || !allAnswered || username.trim().length === 0}
      >
        {busy ? 'Creating…' : 'Create account'}
      </button>
      <button type="button" onClick={onSwitchToLogin}>
        Already have an account? Log in
      </button>
    </div>
  );
}
