import { useEffect, useState } from 'react';

import { api, ApiError } from '../../api/client.js';

/** Parsed /sso/authorize request. `state` is the consumer's opaque CSRF value, passed through untouched. */
export interface SsoRequest {
  service: string;
  redirectUri: string;
  state: string | null;
}

export function parseSsoRequest(search: string): SsoRequest | null {
  const params = new URLSearchParams(search);
  const service = params.get('service');
  const redirectUri = params.get('redirect_uri');
  if (!service || !redirectUri) return null;
  try {
    new URL(redirectUri); // must be absolute — deny/approve both navigate to it
  } catch {
    return null;
  }
  return { service, redirectUri, state: params.get('state') };
}

function buildRedirect(request: SsoRequest, params: Record<string, string>): string {
  const url = new URL(request.redirectUri);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (request.state !== null) url.searchParams.set('state', request.state);
  return url.toString();
}

interface SsoApprovePageProps {
  /** null = the link was malformed — render the error card, never redirect. */
  request: SsoRequest | null;
  username: string;
  /** Injectable for tests; defaults to a real navigation. */
  navigate?: (url: string) => void;
}

/**
 * The consent half of the SSO hand-off: a logged-in user hands their identity
 * to a consumer service. Approve mints a one-time code server-side and sends
 * the browser back to the service's registered redirect URI; the service's
 * BACKEND then exchanges the code — no token ever appears in this page.
 */
export default function SsoApprovePage({ request, username, navigate = (url) => window.location.assign(url) }: SsoApprovePageProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Server verdict on whether this hand-off is sanctioned.
   *
   * The page starts in 'checking' and shows NOTHING actionable until the server says the
   * (service, redirectUri) pair is registered. Anything else renders the same dead-end
   * card as a malformed link, with no button that can navigate.
   *
   * This is a security control, not a nicety. Both Continue AND Cancel navigate to
   * redirectUri, and Cancel does so without asking the server anything — so rendering
   * before validation made this origin an open redirect for any URL an attacker put in
   * the query string, on the domain users are told to trust with their password. It also
   * stopped "Continue to <attacker text>?" from being displayed here at all.
   */
  const [status, setStatus] = useState<'checking' | 'ok' | 'rejected'>('checking');

  const service = request?.service ?? null;
  const redirectUri = request?.redirectUri ?? null;

  useEffect(() => {
    if (!service || !redirectUri) return;
    let cancelled = false;
    void (async () => {
      try {
        await api.ssoValidate(service, redirectUri);
        if (!cancelled) setStatus('ok');
      } catch {
        // Any failure — unregistered, unknown service, network — is treated as NOT
        // sanctioned. Failing closed is the only safe default for a redirect target.
        if (!cancelled) setStatus('rejected');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [service, redirectUri]);

  if (!request || status === 'rejected') {
    return (
      <div className="auc-page">
        <h2>Invalid sign-in link</h2>
        <p className="auc-muted">
          This sign-in request is missing, malformed, or is not for a registered application. Close this page and start
          again from the app that sent you here.
        </p>
      </div>
    );
  }

  if (status === 'checking') {
    return (
      <div className="auc-page">
        <h2>Checking sign-in request…</h2>
        <p className="auc-muted">One moment.</p>
      </div>
    );
  }

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      const { code } = await api.ssoApprove(request.service, request.redirectUri);
      navigate(buildRedirect(request, { code }));
    } catch (e) {
      setBusy(false);
      setError(e instanceof ApiError ? e.message : 'approval failed — please try again');
    }
  };

  const deny = () => navigate(buildRedirect(request, { error: 'access_denied' }));

  return (
    <div className="auc-page">
      <h2>Continue to {request.service}?</h2>
      {error ? <p className="auc-toast auc-toast--err">{error}</p> : null}
      <p>
        <strong>{request.service}</strong> is asking to sign you in as <strong>{username}</strong>.
      </p>
      <p className="auc-muted">You will be sent back to {new URL(request.redirectUri).host}.</p>
      <button type="button" onClick={() => void approve()} disabled={busy}>
        {busy ? 'Approving…' : `Continue as ${username}`}
      </button>
      <button type="button" onClick={deny} disabled={busy}>
        Cancel
      </button>
    </div>
  );
}
