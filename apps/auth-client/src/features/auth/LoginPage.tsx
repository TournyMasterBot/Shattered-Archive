import { useState } from 'react';

interface LoginPageProps {
  onLogin: (username: string, password: string) => Promise<void>;
  onSwitchToSignup: () => void;
  onForgotPassword: () => void;
}

export default function LoginPage({ onLogin, onSwitchToSignup, onForgotPassword }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onLogin(username.trim(), password);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auc-page">
      <h2>Log in</h2>
      {error ? <p className="auc-toast auc-toast--err">{error}</p> : null}
      <label className="auc-field">
        <span>Username</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
      </label>
      <label className="auc-field">
        <span>Password</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" />
      </label>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || username.trim().length === 0 || password.length === 0}
      >
        {busy ? 'Logging in…' : 'Log in'}
      </button>
      <button type="button" onClick={onSwitchToSignup}>
        Need an account? Sign up
      </button>
      <button type="button" onClick={onForgotPassword}>
        Forgot password?
      </button>
    </div>
  );
}
