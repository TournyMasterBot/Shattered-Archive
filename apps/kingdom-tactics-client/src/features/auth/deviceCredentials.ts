/**
 * Device-bound credentials for kt-client. Mirrors mud-builder-client's api/client.ts wiring
 * (same sdk-client underneath, same fail-soft rules) — see docs/auth-server.md for the flow.
 *
 * Why this exists here: the SSO hand-off used to leave a bearer token in localStorage
 * ('kt.auth.token'), readable by any script on the page and replayable anywhere until it
 * expired. Now the SSO login enrols a keypair whose private half the browser will never
 * reveal, and short-lived tokens are minted from it silently. The SSO flow itself is unchanged
 * — enrolment just piggybacks on the session it already established.
 */
import { DeviceCredentials, NeedsEnrollmentError } from '@shatteredarchive/sdk-client';

/** This service's audience — device tokens are valid at exactly one service. */
const DEVICE_SERVICE = 'kingdom-tactics-server';

export type DeviceUnavailableReason = 'not-offered' | 'insecure-context' | 'no-storage' | null;

let device: DeviceCredentials | null = null;
let unavailable: DeviceUnavailableReason = 'not-offered';
let configured = false;

/**
 * Fetches the browser-facing auth origin from kt-server (the bundle can't know it — kt-client
 * deploys with relative URLs and the edge routes them) and wires up device credentials.
 * Idempotent: only the first call does work, so every entry point can call it freely.
 */
export async function ensureDeviceCredentials(fetchImpl: typeof fetch = fetch): Promise<void> {
  if (configured) return;
  configured = true;

  let authPublicUrl: string | undefined;
  try {
    const res = await fetchImpl('/api/kt/config');
    if (res.ok) authPublicUrl = ((await res.json()) as { authPublicUrl?: string }).authPublicUrl;
  } catch {
    // kt-server unreachable — leave device credentials off; SSO login still works.
  }

  if (!authPublicUrl) {
    unavailable = 'not-offered';
    return;
  }
  // WebCrypto is secure-context only, judged by scheme+HOSTNAME and never by the resolved IP.
  // Always satisfied in this stack (every service is reached by hostname over https, dev
  // included), so this guards off-path access rather than the normal case.
  if (typeof isSecureContext !== 'undefined' && !isSecureContext) {
    unavailable = 'insecure-context';
    return;
  }
  // A key that cannot persist would re-prompt enrolment on every reload — worse than not
  // offering it at all.
  if (typeof indexedDB === 'undefined') {
    unavailable = 'no-storage';
    return;
  }

  try {
    // fetchImpl is threaded through deliberately: the device endpoints must use the SAME fetch
    // as the config call, or an injected implementation would silently only apply to one of
    // them — which is exactly the wiring bug this caught in review.
    device = new DeviceCredentials({ authBaseUrl: authPublicUrl, fetchImpl });
    unavailable = null;
  } catch {
    unavailable = 'insecure-context';
  }
}

export function deviceUnavailableReason(): DeviceUnavailableReason {
  return unavailable;
}

export async function isDeviceEnrolled(): Promise<boolean> {
  if (!device) return false;
  try {
    return await device.isEnrolled();
  } catch {
    // A storage read can fail for reasons unrelated to access; never let that abort a caller.
    return false;
  }
}

/**
 * Enrol this browser. Called right after the SSO hand-off, which is the one moment an
 * auth-server session cookie is guaranteed to exist — enrolment requires a real sign-in by
 * design, so that a stolen token can never enrol a device of its own.
 *
 * Best-effort: a failure here must never break a login that otherwise succeeded. The user
 * simply stays on the SSO token for this session and gets asked to log in again next time.
 */
export async function enrollDeviceAfterLogin(label: string): Promise<boolean> {
  if (!device) return false;
  try {
    await device.enroll(label);
    return true;
  } catch {
    return false;
  }
}

/** A device token for kt-server, or null when this browser isn't enrolled. */
export async function getDeviceToken(): Promise<string | null> {
  if (!(await isDeviceEnrolled())) return null;
  try {
    return await device!.getAccessToken(DEVICE_SERVICE);
  } catch (e) {
    // A dead enrolment (revoked, password changed, key evicted) becomes "no token", which the
    // caller already handles as unauthenticated — not an exception through every call site.
    if (e instanceof NeedsEnrollmentError) return null;
    throw e;
  }
}

export async function forgetDevice(): Promise<void> {
  await device?.reset();
}

/** Test seam — resets the module's one-shot configuration. */
export function resetDeviceCredentialsForTest(): void {
  device = null;
  unavailable = 'not-offered';
  configured = false;
}

/** A recognisable entry in the user's device list, e.g. "Chrome on Windows". */
export function defaultDeviceLabel(): string {
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
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} on ${os} (Kingdom Tactics)` : `${browser} (Kingdom Tactics)`;
}
