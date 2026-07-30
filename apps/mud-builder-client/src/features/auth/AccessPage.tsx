import { useCallback, useEffect, useState } from 'react';

import {
  api,
  ApiError,
  authSignInUrl,
  configureDeviceCredentials,
  deviceCredentialsAvailable,
  deviceUnavailableReason,
  enrollDevice,
  forgetDevice,
  tryEnrollDeviceSilently,
  getStoredToken,
  isDeviceEnrolled,
  setStoredToken,
  type ApiKeyInfo,
  type AuditEntry,
  type DeviceUnavailableReason,
} from '../../api/client.js';
import { invalidateAccountActorCache } from './accountActor.js';
import { Toast, type ToastState } from '../shared/Toast.js';
import { MaskedSecret } from '../shared/MaskedSecret.js';
import '../areas/areas.css';

/**
 * Access tab (Phase 9): builder token entry plus — when the stored token is
 * the service MASTER key — the API-key management panel (create / rotate /
 * revoke, master rotation). Plaintext tokens appear exactly once, in the
 * show-once box right after create/rotate; only hashes exist server-side.
 *
 * Phase 4 (centralized auth): the token field is agnostic to WHERE a token
 * came from — a key minted through auth-client with service
 * "mud-builder-server" works here too (the server introspects it against
 * auth-server on a local miss), landing in the same 'key' status bucket as a
 * local API key since neither is master. No client-side change was needed
 * for the mechanism itself, only this status copy.
 */

type TokenStatus =
  | 'loading' // capabilities probe in flight
  | 'open' // server does not require a token
  | 'none' // token required, nothing stored
  | 'invalid' // stored token rejected (revoked/rotated/wrong)
  | 'key' // valid API key — saves work, no key management
  | 'master'; // master key — key management unlocked

const STATUS_TEXT: Record<TokenStatus, string> = {
  loading: 'Checking access…',
  open: 'This deployment does not require a builder token — saves follow the write gate only.',
  none: 'Access is required to save changes. Enrol this device below (recommended — nothing secret is stored or shown, so it is safe to do while sharing your screen), or paste a token for one-off access.',
  invalid: 'The credential was REJECTED — it may have been revoked or rotated. Enrol this device again, or enter a current token.',
  key: 'Access granted (API key or enrolled device). Saves are enabled in this browser.',
  master: 'Master key accepted — API keys can be managed below.',
};

/** A recognisable default so a user's device list reads "Chrome on Windows", not "device 3". */
function defaultDeviceLabel(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const browser = /Firefox\//.test(ua)
    ? 'Firefox'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

export default function AccessPage() {
  const [status, setStatus] = useState<TokenStatus>('loading');
  const [tokenInput, setTokenInput] = useState('');
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [freshToken, setFreshToken] = useState<{ what: string; token: string } | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [deviceAvailable, setDeviceAvailable] = useState(false);
  const [deviceBlocked, setDeviceBlocked] = useState<DeviceUnavailableReason>('not-offered');
  const [deviceEnrolled, setDeviceEnrolled] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState('');

  const loadAudit = useCallback(async () => {
    try {
      setAudit((await api.audit(100)).entries);
    } catch (e) {
      setToast({ kind: 'err', text: `audit log: ${(e as Error).message}` });
    }
  }, []);

  const probe = useCallback(async () => {
    try {
      const caps = await api.capabilities();
      // Wire device credentials from the deployment's own answer before anything reads them;
      // an absent authPublicUrl leaves them off and the UI falls back to manual entry.
      configureDeviceCredentials(caps.authPublicUrl);
      setDeviceAvailable(deviceCredentialsAvailable());
      setDeviceBlocked(deviceUnavailableReason());
      let enrolled = await isDeviceEnrolled();

      // The seamless path: if this browser isn't bound yet but the user already has a hub
      // session, bind it now with no prompt. Costs one request on an unenrolled load, and
      // turns "paste a token" into nothing at all for anyone already signed in at auth.*.
      if (!enrolled && deviceCredentialsAvailable()) {
        enrolled = await tryEnrollDeviceSilently(defaultDeviceLabel());
      }
      setDeviceEnrolled(enrolled);

      if (!(caps.tokenRequired ?? false)) {
        setStatus('open');
        setKeys([]);
        return;
      }
      // Either credential tier counts as "we have something to try".
      if (!getStoredToken() && !enrolled) {
        setStatus('none');
        setKeys([]);
        return;
      }
      try {
        const r = await api.authKeys();
        setStatus('master');
        setKeys(r.keys);
      } catch (e) {
        setStatus(e instanceof ApiError && e.status === 403 ? 'key' : 'invalid');
        setKeys([]);
      }
    } catch (e) {
      setToast({ kind: 'err', text: `server unreachable: ${(e as Error).message}` });
    }
  }, []);

  useEffect(() => {
    void probe();
  }, [probe]);

  useEffect(() => {
    if (status === 'master') void loadAudit();
    else setAudit(null);
  }, [status, loadAudit]);

  const saveToken = async () => {
    const token = tokenInput.trim();
    if (!token) return;
    setStoredToken(token);
    setTokenInput('');
    invalidateAccountActorCache();
    await probe();
  };

  const forgetToken = async () => {
    setStoredToken('');
    invalidateAccountActorCache();
    await probe();
  };

  /**
   * Enrolment needs a live auth-server SESSION, not a builder token — that is the point: it
   * must cost a real sign-in, so a stolen token can never enrol a device of its own. A 401
   * here therefore means "go log in", which is worth saying plainly rather than surfacing a
   * bare status code.
   */
  const enrolThisDevice = async () => {
    const label = deviceLabel.trim() || defaultDeviceLabel();
    try {
      await enrollDevice(label);
      setDeviceLabel('');
      invalidateAccountActorCache();
      await probe();
      setToast({ kind: 'ok', text: 'This device is enrolled — access renews itself from now on.' });
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setToast({
        kind: 'err',
        text:
          status === 401 || /401/.test((e as Error).message)
            ? 'Enrolling needs you to be signed in to the account service first — sign in there, then try again.'
            : `Could not enrol this device: ${(e as Error).message}`,
      });
    }
  };

  const forgetThisDevice = async () => {
    await forgetDevice();
    invalidateAccountActorCache();
    await probe();
    setToast({ kind: 'ok', text: 'This device is no longer enrolled here.' });
  };

  const run = async (what: string, action: () => Promise<void>) => {
    try {
      await action();
      setToast({ kind: 'ok', text: `${what} — done` });
    } catch (e) {
      setToast({ kind: 'err', text: `${what} failed: ${(e as Error).message}` });
    }
  };

  const createKey = () =>
    run(`create key "${newLabel.trim()}"`, async () => {
      const issued = await api.createKey(newLabel.trim());
      setFreshToken({ what: `API key "${issued.label}"`, token: issued.token });
      setNewLabel('');
      await probe();
    });

  const rotateKey = (k: ApiKeyInfo) => {
    if (!window.confirm(`Rotate "${k.label}"? Its current token stops working immediately.`)) return;
    void run(`rotate key "${k.label}"`, async () => {
      const issued = await api.rotateKey(k.id);
      setFreshToken({ what: `API key "${issued.label}" (rotated)`, token: issued.token });
      await probe();
    });
  };

  const revokeKey = (k: ApiKeyInfo) => {
    if (!window.confirm(`Revoke "${k.label}"? This cannot be undone (create a new key instead).`)) return;
    void run(`revoke key "${k.label}"`, async () => {
      await api.revokeKey(k.id);
      await probe();
    });
  };

  const rotateMaster = () => {
    if (
      !window.confirm(
        'Rotate the MASTER key? Every copy of the current master key stops working immediately. This browser switches to the new one automatically.',
      )
    )
      return;
    void run('rotate master key', async () => {
      const issued = await api.rotateMaster();
      setStoredToken(issued.token);
      setFreshToken({ what: 'master key (rotated)', token: issued.token });
      await probe();
    });
  };


  return (
    <div className="mb-page">
      <h2>Access</h2>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <p>{STATUS_TEXT[status]}</p>

      {status !== 'open' && status !== 'loading' ? (
        <fieldset className="mb-fieldset">
          <legend>Builder token</legend>
          <label className="mb-field">
            Token
            <input
              aria-label="Builder token"
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="paste token"
            />
          </label>
          <p className="mb-hint">
            Kept in this page only — it is not saved to disk, so a reload clears it. For ongoing
            access, enrol the device instead.
          </p>
          <button type="button" onClick={() => void saveToken()} disabled={tokenInput.trim().length === 0}>
            Use token
          </button>
          {getStoredToken() ? (
            <button type="button" onClick={() => void forgetToken()}>
              Forget token
            </button>
          ) : null}
        </fieldset>
      ) : null}

      {!deviceAvailable && deviceBlocked && deviceBlocked !== 'not-offered' && status !== 'loading' ? (
        <fieldset className="mb-fieldset">
          <legend>This device</legend>
          <p>
            {deviceBlocked === 'insecure-context'
              ? 'Device sign-in is unavailable because this page was not loaded over a secure connection. Open it via its https:// address (this stack serves https on every service hostname) and it will appear.'
              : 'Device sign-in is unavailable because this browser is not allowing local storage — often private/incognito mode, or storage blocked for this site. Use a normal window, or use a token below.'}
          </p>
        </fieldset>
      ) : null}

      {deviceAvailable && status !== 'open' && status !== 'loading' ? (
        <fieldset className="mb-fieldset">
          <legend>This device</legend>
          {deviceEnrolled ? (
            <>
              <p>
                This device is enrolled. Access renews itself silently, and there is no secret
                stored here for anything to read or copy.
              </p>
              <button type="button" onClick={() => void forgetThisDevice()}>
                Forget this device
              </button>
            </>
          ) : (
            <>
              <p>
                Enrol this browser and it stays signed in on its own — using a key it can never
                reveal, not a stored password or token. Nothing secret is displayed, so this is
                safe to do while sharing your screen.
              </p>
              {/*
                Reaching this branch means the silent enrolment in probe() did not succeed, and
                by far the likeliest reason is no hub session yet. So lead with the one action
                that fixes it — sign in and come straight back — rather than a manual Enrol
                button the user would have to know to press twice.
              */}
              {authSignInUrl() ? (
                <p>
                  <a className="mb-primary-link" href={authSignInUrl() as string}>
                    Sign in to the account service
                  </a>{' '}
                  and you will be brought straight back here, already set up.
                </p>
              ) : null}
              <label className="mb-field">
                Name for this device
                <input
                  aria-label="Device name"
                  value={deviceLabel}
                  onChange={(e) => setDeviceLabel(e.target.value)}
                  placeholder={defaultDeviceLabel()}
                />
              </label>
              <button type="button" onClick={() => void enrolThisDevice()}>
                Enrol this device
              </button>
            </>
          )}
        </fieldset>
      ) : null}

      {freshToken ? (
        <fieldset className="mb-fieldset">
          <legend>New token — shown only once</legend>
          <p>
            {freshToken.what}: store this now; only a hash is kept on the server.
          </p>
          <MaskedSecret value={freshToken.token} label="Issued token" />
          <button type="button" onClick={() => setFreshToken(null)}>
            Dismiss
          </button>
        </fieldset>
      ) : null}

      {status === 'master' ? (
        <fieldset className="mb-fieldset">
          <legend>API keys</legend>
          {keys.length === 0 ? <p>No API keys yet.</p> : null}
          <ul className="mb-list">
            {keys.map((k) => (
              <li key={k.id}>
                <strong>{k.label}</strong> <code>{k.id}</code> · created {k.createdAt.slice(0, 10)}
                {k.revokedAt ? (
                  <em> · revoked {k.revokedAt.slice(0, 10)}</em>
                ) : (
                  <>
                    {' '}
                    <button type="button" onClick={() => rotateKey(k)}>
                      Rotate
                    </button>{' '}
                    <button type="button" onClick={() => revokeKey(k)}>
                      Revoke
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <label className="mb-field">
            New key label
            <input
              aria-label="New key label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. laptop, ci driver"
            />
          </label>
          <button type="button" onClick={() => void createKey()} disabled={newLabel.trim().length === 0}>
            Create API key
          </button>
          <hr />
          <button type="button" onClick={rotateMaster}>
            Rotate master key
          </button>
        </fieldset>
      ) : null}

      {status === 'master' ? (
        <fieldset className="mb-fieldset">
          <legend>Audit log</legend>
          <p className="mb-muted">
            Every accepted mutation (newest first, last 100). The log itself is append-only on the server.
          </p>
          <button type="button" onClick={() => void loadAudit()}>
            Refresh
          </button>
          {audit === null ? (
            <p>Loading…</p>
          ) : audit.length === 0 ? (
            <p>No audited mutations yet.</p>
          ) : (
            <table className="mb-audit-table" aria-label="Audit entries">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Actor</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((e, i) => (
                  <tr key={`${e.ts ?? 'raw'}-${i}`}>
                    {e.raw !== undefined ? (
                      <td colSpan={3}>
                        <code>{e.raw}</code>
                      </td>
                    ) : (
                      <>
                        <td>{(e.ts ?? '').replace('T', ' ').slice(0, 19)}</td>
                        <td>
                          <code>
                            {e.method} {e.route}
                          </code>
                        </td>
                        <td>{e.actor}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </fieldset>
      ) : null}
    </div>
  );
}
