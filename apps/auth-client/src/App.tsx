import { useMemo, useState } from 'react';

import { useAuthSession } from './auth/useAuthSession.js';
import LoginPage from './features/auth/LoginPage.js';
import SignupPage from './features/auth/SignupPage.js';
import ForgotPasswordPage from './features/auth/ForgotPasswordPage.js';
import ForcedChangePage from './features/auth/ForcedChangePage.js';
import AccountPage from './features/account/AccountPage.js';
import KeysPage from './features/keys/KeysPage.js';
import './App.css';

type PublicView = 'login' | 'signup' | 'forgot';
type LoggedInSection = 'account' | 'keys';

function readTokenFor(pathname: string, expectedPathname: string): string | null {
  if (pathname !== expectedPathname) return null;
  return new URLSearchParams(window.location.search).get('token');
}

export default function App() {
  const session = useAuthSession();
  const resetToken = useMemo(() => readTokenFor(window.location.pathname, '/reset-password'), []);
  const verifyToken = useMemo(() => readTokenFor(window.location.pathname, '/verify-email'), []);
  const [publicView, setPublicView] = useState<PublicView>(resetToken ? 'forgot' : 'login');
  const [section, setSection] = useState<LoggedInSection>('account');

  if (session.status === 'loading') {
    return (
      <div className="auc-app">
        <p className="auc-muted">Loading…</p>
      </div>
    );
  }

  if (session.status === 'loggedOut') {
    return (
      <div className="auc-app">
        <header className="auc-header">
          <h1>Shattered Archive Account</h1>
        </header>
        <main className="auc-main">
          {session.error ? <p className="auc-toast auc-toast--err">{session.error}</p> : null}
          {publicView === 'signup' ? (
            <SignupPage onSwitchToLogin={() => setPublicView('login')} />
          ) : publicView === 'forgot' ? (
            <ForgotPasswordPage initialToken={resetToken} onSwitchToLogin={() => setPublicView('login')} />
          ) : (
            <LoginPage
              onLogin={session.login}
              onSwitchToSignup={() => setPublicView('signup')}
              onForgotPassword={() => setPublicView('forgot')}
            />
          )}
        </main>
      </div>
    );
  }

  if (session.status === 'mustChangePassword') {
    return (
      <div className="auc-app">
        <header className="auc-header">
          <h1>Shattered Archive Account</h1>
        </header>
        <main className="auc-main">
          <ForcedChangePage onChanged={session.refresh} onLogout={session.logout} />
        </main>
      </div>
    );
  }

  const account = session.account;
  if (!account) return null; // status 'ready' always pairs with an account — defensive only.

  return (
    <div className="auc-app">
      <header className="auc-header">
        <h1>Shattered Archive Account</h1>
        <nav className="auc-nav" aria-label="Account sections">
          <button
            type="button"
            className={section === 'account' ? 'auc-nav-item auc-nav-item--active' : 'auc-nav-item'}
            aria-current={section === 'account' ? 'page' : undefined}
            onClick={() => setSection('account')}
          >
            Account
          </button>
          <button
            type="button"
            className={section === 'keys' ? 'auc-nav-item auc-nav-item--active' : 'auc-nav-item'}
            aria-current={section === 'keys' ? 'page' : undefined}
            onClick={() => setSection('keys')}
          >
            API keys
          </button>
          <button type="button" onClick={() => void session.logout()}>
            Log out
          </button>
        </nav>
      </header>
      <main className="auc-main">
        <p className="auc-muted">Logged in as {account.username}</p>
        {section === 'account' ? (
          <AccountPage account={account} pendingEmailToken={verifyToken} onAccountChanged={session.refresh} />
        ) : (
          <KeysPage />
        )}
      </main>
    </div>
  );
}
