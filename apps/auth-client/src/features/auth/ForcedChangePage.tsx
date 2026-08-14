import { useState } from 'react';

import { api, ApiError } from '../../api/client.js';

interface ForcedChangePageProps {
  onChanged: () => Promise<void>;
  onLogout: () => Promise<void>;
}

const MIN_PASSWORD_LENGTH = 12;

/** Blocks everything except itself and logout while the account's mustChangePassword flag is set — a UX mirror of the server's own allowlist (session-guard.ts), which still enforces this regardless of what the client does. */
export default function ForcedChangePage({ onChanged, onLogout }: ForcedChangePageProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (newPassword !== confirm) {
      setError('passwords do not match');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      await onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auc-page">
      <h2>Set a new password</h2>
      <p>A password change is required before you can continue.</p>
      {error ? <p className="auc-toast auc-toast--err">{error}</p> : null}
      <label className="auc-field">
        <span>Current password</span>
        <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
      </label>
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
        onClick={() => void submit()}
        disabled={busy || currentPassword.length === 0 || newPassword.length < MIN_PASSWORD_LENGTH}
      >
        {busy ? 'Changing…' : 'Change password'}
      </button>
      <button type="button" onClick={() => void onLogout()}>
        Log out instead
      </button>
    </div>
  );
}
