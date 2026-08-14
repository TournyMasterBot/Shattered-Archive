import { useEffect, useState } from 'react';

import { api, ApiError, type AccountSummary } from '../../api/client.js';

interface AccountPageProps {
  account: AccountSummary;
  /** Present when landing on /verify-email?token=... from the emailed link — auto-verified once on mount. */
  pendingEmailToken: string | null;
  onAccountChanged: () => Promise<void>;
}

const MIN_PASSWORD_LENGTH = 12;

export default function AccountPage({ account, pendingEmailToken, onAccountChanged }: AccountPageProps) {
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const [email, setEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  const [masterBusy, setMasterBusy] = useState(false);

  useEffect(() => {
    if (!pendingEmailToken) return;
    void (async () => {
      try {
        await api.verifyEmail(pendingEmailToken);
        setToast({ kind: 'ok', text: 'Email verified.' });
        // Drop the token from the URL so a refresh doesn't re-verify against an already-consumed token.
        window.history.replaceState(null, '', window.location.pathname);
        await onAccountChanged();
      } catch (e) {
        setToast({ kind: 'err', text: e instanceof ApiError ? e.message : (e as Error).message });
      }
    })();
    // Intentionally runs once for the token this page mounted with — not on every account/handler change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (what: string, action: () => Promise<void>) => {
    try {
      await action();
      setToast({ kind: 'ok', text: `${what} — done` });
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof ApiError ? e.message : (e as Error).message });
    }
  };

  const changePassword = () =>
    run('change password', async () => {
      setPwBusy(true);
      try {
        await api.changePassword(currentPassword, newPassword);
        setCurrentPassword('');
        setNewPassword('');
      } finally {
        setPwBusy(false);
      }
    });

  const requestEmail = () =>
    run('send verification email', async () => {
      setEmailBusy(true);
      try {
        await api.requestEmail(email.trim());
        setEmail('');
      } finally {
        setEmailBusy(false);
      }
    });

  const rotateMaster = () => {
    if (
      !window.confirm(
        'Rotate your master session? Every previously issued API key and session — including this browser — is invalidated at once. This browser switches to the new session automatically.',
      )
    )
      return;
    void run('rotate master', async () => {
      setMasterBusy(true);
      try {
        await api.rotateMaster();
        await onAccountChanged();
      } finally {
        setMasterBusy(false);
      }
    });
  };

  return (
    <div className="auc-page">
      <h2>Account</h2>
      {toast ? (
        <p className={toast.kind === 'ok' ? 'auc-toast auc-toast--ok' : 'auc-toast auc-toast--err'}>{toast.text}</p>
      ) : null}

      <fieldset className="auc-fieldset">
        <legend>Username</legend>
        <p>{account.username}</p>
      </fieldset>

      <fieldset className="auc-fieldset">
        <legend>Change password</legend>
        <label className="auc-field">
          <span>Current password</span>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </label>
        <label className="auc-field">
          <span>New password</span>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </label>
        <button
          type="button"
          onClick={() => void changePassword()}
          disabled={pwBusy || currentPassword.length === 0 || newPassword.length < MIN_PASSWORD_LENGTH}
        >
          {pwBusy ? 'Changing…' : 'Change password'}
        </button>
      </fieldset>

      <fieldset className="auc-fieldset">
        <legend>Email</legend>
        {account.emailOnFile ? (
          <p>{account.emailVerified ? 'Verified.' : 'On file, not yet verified — check your inbox for the link.'}</p>
        ) : (
          <p>No email on file.</p>
        )}
        <label className="auc-field">
          <span>Email address</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </label>
        <button type="button" onClick={() => void requestEmail()} disabled={emailBusy || email.trim().length === 0}>
          {emailBusy ? 'Sending…' : account.emailOnFile ? 'Change email' : 'Add email'}
        </button>
      </fieldset>

      <fieldset className="auc-fieldset">
        <legend>Master rotation</legend>
        <p className="auc-muted">
          Rotating invalidates every API key and session tied to this account, including this browser's — a fresh
          session replaces it automatically.
        </p>
        <button type="button" onClick={rotateMaster} disabled={masterBusy}>
          {masterBusy ? 'Rotating…' : 'Rotate master'}
        </button>
      </fieldset>
    </div>
  );
}
