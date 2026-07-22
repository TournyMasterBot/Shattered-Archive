import { useState } from 'react';

import { api, ApiError } from '../../api/client.js';

interface ForgotPasswordPageProps {
  /** Present when landing on /reset-password?token=... from the emailed link. */
  initialToken: string | null;
  onSwitchToLogin: () => void;
}

const MIN_PASSWORD_LENGTH = 12;

/** Two sub-flows: request a reset email (no token yet), or set a new password (token from the email link). */
export default function ForgotPasswordPage({ initialToken, onSwitchToLogin }: ForgotPasswordPageProps) {
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const requestReset = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.forgotPassword(username.trim());
      setMessage(result.message);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async () => {
    if (!initialToken) return;
    if (newPassword !== confirm) {
      setError('passwords do not match');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword(initialToken, newPassword);
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (initialToken) {
    if (done) {
      return (
        <div className="auc-page">
          <h2>Password reset</h2>
          <p>Your password has been reset. Log in with your new password.</p>
          <button type="button" onClick={onSwitchToLogin}>
            Continue to login
          </button>
        </div>
      );
    }
    return (
      <div className="auc-page">
        <h2>Set a new password</h2>
        {error ? <p className="auc-toast auc-toast--err">{error}</p> : null}
        <label className="auc-field">
          <span>New password</span>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </label>
        <label className="auc-field">
          <span>Confirm new password</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <button
          type="button"
          onClick={() => void submitReset()}
          disabled={busy || newPassword.length < MIN_PASSWORD_LENGTH}
        >
          {busy ? 'Resetting…' : 'Reset password'}
        </button>
      </div>
    );
  }

  return (
    <div className="auc-page">
      <h2>Forgot password</h2>
      {error ? <p className="auc-toast auc-toast--err">{error}</p> : null}
      {message ? <p className="auc-toast auc-toast--ok">{message}</p> : null}
      <label className="auc-field">
        <span>Username</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
      </label>
      <button type="button" onClick={() => void requestReset()} disabled={busy || username.trim().length === 0}>
        {busy ? 'Sending…' : 'Send reset link'}
      </button>
      <button type="button" onClick={onSwitchToLogin}>
        Back to login
      </button>
    </div>
  );
}
