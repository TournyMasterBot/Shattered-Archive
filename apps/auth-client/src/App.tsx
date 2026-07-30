import { useEffect, useMemo, useState } from 'react';

import { useAuthSession } from './auth/useAuthSession.js';
import { useReturnTo } from './auth/useReturnTo.js';
import LoginPage from './features/auth/LoginPage.js';
import SignupPage from './features/auth/SignupPage.js';
import ForgotPasswordPage from './features/auth/ForgotPasswordPage.js';
import ForcedChangePage from './features/auth/ForcedChangePage.js';
import AccountPage from './features/account/AccountPage.js';
import KeysPage from './features/keys/KeysPage.js';
import SsoApprovePage, { parseSsoRequest } from './features/sso/SsoApprovePage.js';
import AdminPage from './features/admin/AdminPage.js';
import './App.css';

type PublicView = 'login' | 'signup' | 'forgot';
type LoggedInSection = 'account' | 'keys' | 'admin';

function readTokenFor(pathname: string, expectedPathname: string): string | null {
  if (pathname !== expectedPathname) return null;
  return new URLSearchParams(window.location.search).get('token');
}

export default function App() {
  const session = useAuthSession();
  const returnTo = useReturnTo();
  const resetToken = useMemo(() => readTokenFor(window.location.pathname, '/reset-password'), []);
  const verifyToken = useMemo(() => readTokenFor(window.location.pathname, '/verify-email'), []);
  // Same pathname-check pattern as /reset-password — this SPA has no router. isSsoAuthorize
  // stays true even when the params are malformed so the error card renders instead of the shell.
  const isSsoAuthorize = window.location.pathname === '/sso/authorize';
  const ssoRequest = useMemo(() => (isSsoAuthorize ? parseSsoRequest(window.location.search) : null), [isSsoAuthorize]);
  // /signup is a landing target for consumer sites whose own Register action should
  // NOT default here to the login form (a real bug: shatteredarchive.com's Register
  // used to send users to the hub root, which defaults to Login).
  const isSignupPath = window.location.pathname === '/signup';
  const [publicView, setPublicView] = useState<PublicView>(resetToken ? 'forgot' : isSignupPath ? 'signup' : 'login');
  const [section, setSection] = useState<LoggedInSection>('account');

  /**
   * `?returnTo=` hand-back. Only from a FULLY onboarded session ('ready' excludes
   * mustChangePassword), so a forced password change can never be skipped by arriving with a
   * returnTo. The SSO consent flow does its own redirect and must not be pre-empted here.
   */
  const shouldReturn =
    session.status === 'ready' && !isSsoAuthorize && !returnTo.loading && returnTo.url !== null;
  useEffect(() => {
    // replace(), not assign(): the login URL must not sit in history, or Back lands the user
    // on a stale login page mid-redirect.
    if (shouldReturn && returnTo.url) window.location.replace(returnTo.url);
  }, [shouldReturn, returnTo.url]);

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

  if (shouldReturn) {
    // The redirect is already scheduled by the effect above; rendering the account shell here
    // would flash it for a frame on every hand-back.
    return (
      <div className="auc-app">
        <main className="auc-main">
          <p className="auc-muted">Signed in — returning you to where you started…</p>
        </main>
      </div>
    );
  }

  if (isSsoAuthorize) {
    // Consent screen replaces the account shell for this request; login/forced-change
    // above still ran first, so approval always happens on a fully-onboarded session.
    return (
      <div className="auc-app">
        <header className="auc-header">
          <h1>Shattered Archive Account</h1>
        </header>
        <main className="auc-main">
          <SsoApprovePage request={ssoRequest} username={account.username} />
        </main>
      </div>
    );
  }

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
            Keys &amp; devices
          </button>
          {account.globalRole && account.globalRole !== 'user' ? (
            <button
              type="button"
              className={section === 'admin' ? 'auc-nav-item auc-nav-item--active' : 'auc-nav-item'}
              aria-current={section === 'admin' ? 'page' : undefined}
              onClick={() => setSection('admin')}
            >
              Admin
            </button>
          ) : null}
          <button type="button" onClick={() => void session.logout()}>
            Log out
          </button>
        </nav>
      </header>
      <main className="auc-main">
        <p className="auc-muted">Logged in as {account.username}</p>
        {section === 'account' ? (
          <AccountPage account={account} pendingEmailToken={verifyToken} onAccountChanged={session.refresh} />
        ) : section === 'admin' ? (
          <AdminPage />
        ) : (
          <KeysPage />
        )}
      </main>
    </div>
  );
}
