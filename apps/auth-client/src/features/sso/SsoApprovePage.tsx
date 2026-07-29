import { useState } from 'react';

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

  if (!request) {
    return (
      <div className="auc-page">
        <h2>Invalid sign-in link</h2>
        <p className="auc-muted">
          This sign-in request is missing or malformed. Close this page and start again from the app that sent you here.
        </p>
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
