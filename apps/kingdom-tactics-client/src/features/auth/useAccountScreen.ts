import { useEffect, useRef, useState } from 'react';
import type { MatchState } from '@shatteredarchive/kingdom-tactics-engine';
import { getToken, clearToken, isExpired } from './authTokenStore';
import { ensureDeviceCredentials, forgetDevice, isDeviceEnrolled } from './deviceCredentials';
import { startLogin } from './ktSso';
import * as cloudSync from './cloudSync';
import type { MatchHistorySummary } from './cloudSync';
import { listSavedArmies, replaceAllArmies } from '../../state/saved-armies';

type Status = { readonly kind: 'ok' | 'err'; readonly text: string } | null;

/** Everything Account/replay-viewer needs — mirrors game-client's useAccountModal (Phase D) split. */
export function useAccountScreen() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  /**
   * Set once anything has AUTHORITATIVELY decided the user is signed out — a 401 from a real
   * request, or an explicit logout. The mount probe became asynchronous when device-enrolment
   * checking was added, so without this it can resolve LATE and flip a user who was just
   * logged out by a 401 back to "signed in". That is a real race, not just a test artifact.
   */
  const signedOutAuthoritatively = useRef(false);

  /** Sign-out that outranks the in-flight mount probe. */
  function markSignedOut(): void {
    signedOutAuthoritatively.current = true;
    setIsLoggedIn(false);
  }

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [history, setHistory] = useState<MatchHistorySummary[]>([]);
  const [replaySnapshots, setReplaySnapshots] = useState<readonly MatchState[] | null>(null);
  const [replayStep, setReplayStep] = useState(0);

  useEffect(() => {
    /**
     * Two ways to be signed in, and the device one must be checked FIRST: a returning user has
     * no in-memory SSO token at all (it dies with the page) but is still signed in via their
     * enrolled device key. Checking only the token would have shown them as logged out on every
     * visit — the regression that would have made this whole change look broken.
     */
    void (async () => {
      await ensureDeviceCredentials();
      const stored = getToken();
      const loggedIn = (await isDeviceEnrolled()) || (!!stored && !isExpired(stored));
      // Never overrule a decision made while this probe was in flight.
      if (signedOutAuthoritatively.current) return;
      setIsLoggedIn(loggedIn);
      if (loggedIn) void refreshHistory();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshHistory(): Promise<void> {
    const res = await cloudSync.loadMatchHistory();
    if (res.kind === 'ok') {
      setHistory(res.data);
    } else if (res.kind === 'unauthenticated') {
      markSignedOut();
    }
  }

  function handleLogin(): void {
    startLogin();
  }

  function handleLogout(): void {
    clearToken();
    // Must also drop the device key, or "log out" would leave the browser silently able to
    // mint fresh tokens and the user would appear signed in again on the next visit. Local
    // only, like the original logout — the server-side enrolment is revoked from the account
    // service's own device list.
    void forgetDevice();
    markSignedOut();
    setHistory([]);
    setReplaySnapshots(null);
    setStatus({ kind: 'ok', text: 'Logged out.' });
  }

  async function handleViewReplay(id: string): Promise<void> {
    setBusy(true);
    setStatus(null);
    const res = await cloudSync.loadReplay(id);
    setBusy(false);
    if (res.kind === 'ok') {
      // Defensive: a genuinely recorded match always has at least one snapshot (it only gets
      // recorded once decided, which requires applying actions) — an empty result means a
      // corrupted/malformed stored entry, not a normal outcome. Fail with a clear message
      // rather than let the replay view render `undefined` as the current snapshot.
      if (res.data.snapshots.length === 0) {
        setStatus({ kind: 'err', text: 'This match has no recorded replay data.' });
        return;
      }
      setReplaySnapshots(res.data.snapshots);
      setReplayStep(0);
    } else if (res.kind === 'unauthenticated') {
      markSignedOut();
      setStatus({ kind: 'err', text: 'Your session expired — please log in again.' });
    } else {
      setStatus({ kind: 'err', text: `Replay failed: ${res.message}` });
    }
  }

  function closeReplay(): void {
    setReplaySnapshots(null);
    setReplayStep(0);
  }

  function stepReplay(delta: number): void {
    setReplayStep((prev) => {
      if (!replaySnapshots) return prev;
      const next = prev + delta;
      return Math.max(0, Math.min(replaySnapshots.length - 1, next));
    });
  }

  async function handleSaveArmiesToCloud(): Promise<void> {
    setBusy(true);
    setStatus(null);
    const armies = listSavedArmies();
    const res = await cloudSync.saveArmyLayouts(armies);
    setBusy(false);
    if (res.kind === 'ok') {
      setStatus({ kind: 'ok', text: `Saved ${res.data.count} army layout(s) to the cloud.` });
    } else if (res.kind === 'unauthenticated') {
      markSignedOut();
      setStatus({ kind: 'err', text: 'Your session expired — please log in again.' });
    } else {
      setStatus({ kind: 'err', text: `Save failed: ${res.message}` });
    }
  }

  async function handleLoadArmiesFromCloud(): Promise<void> {
    const confirmed = window.confirm(
      'Load from the cloud? This replaces your local saved armies with whatever was last saved there.',
    );
    if (!confirmed) return;

    setBusy(true);
    setStatus(null);
    const res = await cloudSync.loadArmyLayouts();
    setBusy(false);
    if (res.kind === 'ok') {
      replaceAllArmies(res.data);
      setStatus({ kind: 'ok', text: `Loaded ${res.data.length} army layout(s) from the cloud.` });
    } else if (res.kind === 'unauthenticated') {
      markSignedOut();
      setStatus({ kind: 'err', text: 'Your session expired — please log in again.' });
    } else {
      setStatus({ kind: 'err', text: `Load failed: ${res.message}` });
    }
  }

  return {
    isLoggedIn,
    busy,
    status,
    history,
    replaySnapshots,
    replayStep,
    handleLogin,
    handleLogout,
    handleViewReplay,
    closeReplay,
    stepReplay,
    handleSaveArmiesToCloud,
    handleLoadArmiesFromCloud,
  };
}
