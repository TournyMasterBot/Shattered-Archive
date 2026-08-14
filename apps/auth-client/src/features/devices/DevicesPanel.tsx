import { useCallback, useEffect, useMemo, useState } from 'react';

import { api, ApiError, type DeviceInfo } from '../../api/client.js';

/**
 * Enrolled-device management — the second axis of access, sitting alongside API keys on the
 * same page because the two are constantly confused and only make sense next to each other:
 *
 * - An **API key** is a per-service entitlement across every device. Revoking one cuts that
 *   service off everywhere you are signed in.
 * - A **device** is a per-browser credential across every service. Revoking one kills a
 *   stolen laptop while your desktop keeps working.
 *
 * Neither expresses the other, which is why device revocation is not simply "rotate the key
 * again" and why this panel exists at all.
 *
 * There is no create action here, and no show-once secret: enrolment happens in the consumer
 * app (it needs a live hub session, which is what makes it cost a real login), and the
 * private half is non-extractable — so this list is public metadata, and re-enrolling from
 * the browser IS the rotate operation.
 *
 * Deliberately no "this device" badge. The device key lives in the IndexedDB of the origin
 * that enrolled it (build.shatteredarchive.dev); the hub is a different origin and genuinely
 * cannot read it, so any such badge would be a guess. Consumer apps default the label to
 * something like "Chrome on Windows" at enrolment for exactly this reason.
 */

/** Dates render date-only, matching KeysPage — the time of day has never been the useful part. */
function day(iso: string): string {
  return iso.slice(0, 10);
}

export default function DevicesPanel() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRevoked, setShowRevoked] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.listDevices();
      setDevices(r.devices);
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof ApiError ? e.message : (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (what: string, action: () => Promise<void>) => {
    try {
      await action();
      setToast({ kind: 'ok', text: `${what} — done` });
    } catch (e) {
      setToast({ kind: 'err', text: e instanceof ApiError ? e.message : (e as Error).message });
    }
  };

  // Revocation is a tombstone the server keeps forever (device-store.ts), so revoked rows
  // accumulate permanently — they stay collapsed behind a toggle rather than burying the
  // handful of devices the user can actually act on.
  const active = useMemo(
    () => devices.filter((d) => !d.revokedAt).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)),
    [devices],
  );
  const revoked = useMemo(
    () => devices.filter((d) => d.revokedAt).sort((a, b) => (b.revokedAt ?? '').localeCompare(a.revokedAt ?? '')),
    [devices],
  );

  const revokeDevice = (d: DeviceInfo) => {
    if (
      !window.confirm(
        `Revoke "${d.label}"? That browser must enrol again before it can save anything. Your API keys and this session are unaffected.`,
      )
    )
      return;
    void run(`revoke device "${d.label}"`, async () => {
      await api.revokeDevice(d.id);
      await load();
    });
  };

  const revokeAll = () => {
    if (
      !window.confirm(
        `Revoke all ${active.length} enrolled device${active.length === 1 ? '' : 's'}? Every browser must enrol again. Your API keys and this session are unaffected.`,
      )
    )
      return;
    void run('revoke all devices', async () => {
      await api.revokeAllDevices();
      await load();
    });
  };

  const renderRow = (d: DeviceInfo) => (
    <li key={d.id}>
      <strong>{d.label}</strong>{' '}
      <span className="auc-muted">({d.allowedServices.length > 0 ? d.allowedServices.join(', ') : 'no services'})</span>{' '}
      <code>{d.id}</code> · enrolled {day(d.createdAt)} · last used {day(d.lastSeenAt)}
      {d.revokedAt ? (
        <em> · revoked {day(d.revokedAt)}</em>
      ) : (
        <>
          {' '}
          <button type="button" onClick={() => revokeDevice(d)}>
            Revoke
          </button>
        </>
      )}
    </li>
  );

  return (
    <>
      {toast ? (
        <p className={toast.kind === 'ok' ? 'auc-toast auc-toast--ok' : 'auc-toast auc-toast--err'}>{toast.text}</p>
      ) : null}

      <fieldset className="auc-fieldset">
        <legend>Enrolled devices</legend>
        <p className="auc-muted">
          Browsers bound to your account by a device key. Apps enrol one automatically the first time you use them while
          signed in here — there is nothing to copy or paste, and no secret to store. Revoking a device signs that
          browser out of every app; revoking an API key removes access to one service everywhere.
        </p>
        {loading ? (
          <p>Loading…</p>
        ) : active.length === 0 ? (
          <p>No devices enrolled.</p>
        ) : (
          <ul className="auc-list">{active.map(renderRow)}</ul>
        )}

        {active.length > 0 ? (
          <button type="button" onClick={revokeAll}>
            Revoke all devices
          </button>
        ) : null}

        {revoked.length > 0 ? (
          <>
            {' '}
            <button type="button" onClick={() => setShowRevoked((v) => !v)}>
              {showRevoked ? 'Hide' : 'Show'} revoked ({revoked.length})
            </button>
            {showRevoked ? <ul className="auc-list">{revoked.map(renderRow)}</ul> : null}
          </>
        ) : null}

        {/*
          The honest caveat, and the reason this is worth saying in the UI rather than only in
          the docs: whoever holds a lost laptop also holds its cookies, so a still-live hub
          session there can silently enrol a NEW device moments after you revoke the old one.
          A password change bumps the account epoch, which invalidates every session and every
          enrolment at once — that, not this button, is what actually ends the access.
        */}
        <p className="auc-muted">
          Lost or stolen device? Change your password as well. Revoking stops the enrolled key, but a thief with the
          browser also has its login session and could simply enrol again — changing your password invalidates every
          session and every enrolment at once.
        </p>
      </fieldset>
    </>
  );
}
