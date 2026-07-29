import { useCallback, useEffect, useState } from 'react';

import { api, type Capabilities, type RebuildStatus } from '../../api/client.js';
import { Toast, type ToastState } from '../shared/Toast.js';
import '../areas/areas.css';

/**
 * Engine tab (Phase 15): triggers the engine-rebuild pipeline and polls its status.
 * Global infra action, not area-scoped — own state/polling, no useAreaWorkbench
 * dependency, same category as AccessPage.
 *
 * The status poll MUST tolerate the server it's talking to disappearing mid-rebuild
 * (the pipeline's own final step recreates this very container) — a failed poll is
 * "transient, reconnecting," never "the rebuild failed." Only status.phase === 'failed'
 * (a value the SERVER set, read successfully) means that.
 */

const POLL_INTERVAL_MS = 3000;

const PHASE_TEXT: Record<RebuildStatus['phase'], string> = {
  'building-mercmud24': 'Building the game engine…',
  'recreating-mercmud24': 'Restarting the game engine…',
  'building-builder-images': 'Building the builder images…',
  'handing-off-to-helper': 'Redeploying this builder tool — it will disconnect and reconnect shortly…',
  complete: 'Complete',
  failed: 'Failed',
};

function inProgress(status: RebuildStatus | null): boolean {
  return status !== null && status.phase !== 'complete' && status.phase !== 'failed';
}

export default function EnginePage() {
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [status, setStatus] = useState<RebuildStatus | null>(null);
  const [canTrigger, setCanTrigger] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const poll = useCallback(async () => {
    try {
      const r = await api.rebuildStatus();
      setStatus(r.status);
      setCanTrigger(r.canTrigger);
      setReconnecting(false);
    } catch {
      // Transient — the container we're polling may be mid-recreate. Never clear the
      // last known status here; the banner below is the only visible change.
      setReconnecting(true);
    }
  }, []);

  useEffect(() => {
    void api
      .capabilities()
      .then(setCaps)
      .catch((e: unknown) => setToast({ kind: 'err', text: `server unreachable: ${(e as Error).message}` }));
    void poll();
    const id = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [poll]);

  const trigger = async () => {
    const sure = window.confirm(
      'Rebuild the engine? This recompiles and restarts the LIVE game server, then redeploys ' +
        'this builder tool itself — the builder will disconnect and reconnect partway through ' +
        '(that is expected, not a failure). The whole process takes several minutes. Proceed?',
    );
    if (!sure) return;
    setTriggering(true);
    try {
      await api.triggerRebuild();
      setToast({ kind: 'ok', text: 'rebuild started' });
      await poll();
    } catch (e) {
      setToast({ kind: 'err', text: `rebuild trigger failed: ${(e as Error).message}` });
    } finally {
      setTriggering(false);
    }
  };

  if (caps === null) {
    return (
      <div className="mb-page">
        <h2>Engine</h2>
        <p>Loading…</p>
      </div>
    );
  }

  if (!caps.rebuildEnabled) {
    return (
      <div className="mb-page">
        <h2>Engine</h2>
        <p>This deployment does not have the engine-rebuild feature enabled.</p>
      </div>
    );
  }

  const busy = inProgress(status) || triggering;

  return (
    <div className="mb-page">
      <h2>Engine</h2>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      {reconnecting ? (
        <p className="mb-toast mb-toast--err" role="status">
          Reconnecting to the builder service… the page will update automatically once it&apos;s back.
        </p>
      ) : null}

      <fieldset className="mb-fieldset">
        <legend>Rebuild</legend>
        <p className="mb-muted">
          Recompiles the game engine and this builder tool from the current source, then redeploys both. A
          third action alongside Hot Reload and Copyover (Areas tab) — those apply CONTENT changes; this
          applies CODE changes.
        </p>
        {canTrigger ? (
          <button type="button" onClick={() => void trigger()} disabled={busy}>
            {busy ? 'Rebuild in progress…' : 'Rebuild engine'}
          </button>
        ) : (
          <p className="mb-muted">
            You do not have permission to trigger a rebuild. Ask an operator to add your account to the
            rebuild allowlist.
          </p>
        )}
      </fieldset>

      {status ? (
        <fieldset className="mb-fieldset">
          <legend>Status</legend>
          <p>
            <strong>{PHASE_TEXT[status.phase]}</strong> — started by {status.actor}
          </p>
          {status.error ? <p className="mb-toast mb-toast--err">{status.error}</p> : null}
          <ul className="mb-list" aria-label="Rebuild log">
            {status.log.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </fieldset>
      ) : (
        <p className="mb-muted">No rebuild has run yet on this deployment.</p>
      )}
    </div>
  );
}
