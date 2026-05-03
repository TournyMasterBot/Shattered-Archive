// apps/game-client/src/components/ContributeIdentifyModal.tsx
import React from 'react';
import styles from '../styles/ContributeIdentifyModal.module.scss';
import { DispatchEvent, ListenEvent } from '../features/event-emitter/event-dispatcher';

type RawDataPayload = {
  rawText?: string;
  text?: string;
  fromUserScript?: boolean;
  receivedTimestamp?: number;
};

type IdentitySnapshot = {
  characterName?: string;
  updatedAt?: number;
};

export interface ContributeIdentifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
}

function getIdentitySnapshot(): IdentitySnapshot {
  const w = window as any;
  return (w.__SA_IDENTITY__ ?? {}) as IdentitySnapshot;
}

export const ContributeIdentifyModal: React.FC<ContributeIdentifyModalProps> = ({ isOpen, onClose, connectionId }) => {
  const [shortText, setShortText] = React.useState('');
  const [longText, setLongText] = React.useState('');

  const [lines, setLines] = React.useState<string[]>([]);
  const [isCapturing, setIsCapturing] = React.useState(false);

  const [identity, setIdentity] = React.useState<IdentitySnapshot>({});

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitOk, setSubmitOk] = React.useState(false);

  const unbindRef = React.useRef<null | (() => void)>(null);
  const captureTimerRef = React.useRef<number | null>(null);

  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  const modalRef = React.useRef<HTMLDivElement>(null);
  const dragOffsetRef = React.useRef<{ x: number; y: number } | null>(null);

  const onHeaderMouseDown = React.useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = modalRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      if (!dragOffsetRef.current) return;
      setPos({ x: ev.clientX - dragOffsetRef.current.x, y: ev.clientY - dragOffsetRef.current.y });
    };
    const onUp = () => {
      dragOffsetRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const stopCapture = React.useCallback(() => {
    if (captureTimerRef.current != null) {
      window.clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }

    try {
      unbindRef.current?.();
    } catch {
      // ignore
    }
    unbindRef.current = null;
    setIsCapturing(false);
  }, []);

  const startIdentifyCapture = React.useCallback(() => {
    setSubmitError(null);
    setSubmitOk(false);

    stopCapture();
    setLines([]);

    setIsCapturing(true);

    unbindRef.current = ListenEvent<RawDataPayload>(
      'shatteredarchive:raw-data',
      (payload) => {
        const raw = String(payload?.rawText ?? payload?.text ?? '');
        if (!raw) return;

        setLines((prev) => {
          const next = [...prev, raw];

          // If the *second-to-last* item is blank, drop the last two lines.
          // (i.e., next[next.length - 2] is blank)
          if (next.length >= 2 && next[next.length - 2].trim() === '') {
            next.splice(-2, 2);
          }

          return next;
        });
      },
      { key: 'ContributeIdentifyModal::raw-data-capture' },
    );

    // capture for 1 second then stop
    captureTimerRef.current = window.setTimeout(() => {
      stopCapture();
    }, 1000);

    // send the game command immediately
    const short = (shortText ?? '').trim();
    if (short.length > 0) {
      DispatchEvent('shatteredarchive:send-command', { cmd: `c id ${short}`, connectionId });
    }
  }, [shortText, connectionId, stopCapture]);

  React.useEffect(() => {
    if (!isOpen) {
      stopCapture();
      setSubmitError(null);
      setSubmitOk(false);
      return;
    }

    setPos({
      x: Math.max(0, (window.innerWidth - 760) / 2),
      y: Math.max(0, (window.innerHeight - 600) / 2),
    });

    // prime from latest snapshot
    setIdentity(getIdentitySnapshot());

    // subscribe to GMCP-derived identity updates
    const off = ListenEvent<IdentitySnapshot>(
      'shatteredarchive:identity-updated',
      (snap) => {
        setIdentity({
          characterName: snap?.characterName,
          updatedAt: snap?.updatedAt,
        });
      },
      { key: 'ContributeIdentifyModal::identity-updated' },
    );

    return () => {
      try {
        off?.();
      } catch {}
      stopCapture();
    };
  }, [isOpen, stopCapture]);

  if (!isOpen) return null;

  const deleteLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const onSubmit = async () => {
    setSubmitError(null);
    setSubmitOk(false);

    const characterName = String(identity?.characterName ?? '').trim();

    const short = String(shortText ?? '').trim();
    const long = String(longText ?? '').trim();

    // description = remaining lines after deletion
    const description = lines.join('\n').trim();

    if (!short) {
      setSubmitError('Short is required.');
      return;
    }
    if (!connectionId || !String(connectionId).trim()) {
      setSubmitError('Missing connectionId.');
      return;
    }
    if (!characterName) {
      setSubmitError('Missing identity: character name not captured yet (GMCP login_data).');
      return;
    }
    if (!description) {
      setSubmitError('Nothing to submit (no captured lines remaining).');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        connectionId,
        characterName,
        timestamp: new Date().toISOString(),
        short,
        long,
        description,
      };

      const res = await fetch('http://localhost:5000/contribute/identify', {
        //const res = await fetch('https://web-server.shatteredarchive.dev/contribute/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`POST failed (${res.status})${text ? `: ${text}` : ''}`);
      }

      setSubmitOk(true);
      stopCapture();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? 'Unknown error');
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const identityStatus = (() => {
    const char = String(identity?.characterName ?? '').trim();
    if (char) return char;
    return '(character unknown)';
  })();

  const canSubmit =
    !isSubmitting &&
    String(shortText ?? '').trim().length > 0 &&
    String(connectionId ?? '').trim().length > 0 &&
    String(identity?.characterName ?? '').trim().length > 0 &&
    lines.length > 0;

  return (
    <div
      ref={modalRef}
      className={styles.modal}
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 9999 }}
    >
      <div className={styles.header} onMouseDown={onHeaderMouseDown}>
        <div className={styles.title}>Contribute · Identify Object</div>
        <button className={styles.closeBtn} onClick={onClose} type="button">
          ✕
        </button>
      </div>

        <div className={styles.body}>
          <div className={styles.topSection}>
            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="contrib-identify-short">
                Short
              </label>
              <input
                id="contrib-identify-short"
                className={styles.input}
                value={shortText}
                onChange={(e) => setShortText(e.target.value)}
                placeholder="Short label / name…"
              />
            </div>

            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="contrib-identify-long">
                Long
              </label>
              <input
                id="contrib-identify-long"
                className={styles.input}
                value={longText}
                onChange={(e) => setLongText(e.target.value)}
                placeholder="Long description…"
              />
            </div>

            <div className={styles.actionsRow}>
              <button
                className={styles.primaryBtn}
                type="button"
                onClick={startIdentifyCapture}
                disabled={isCapturing || isSubmitting || String(shortText ?? '').trim().length === 0}
                title={String(shortText ?? '').trim().length === 0 ? 'Enter a Short value first.' : undefined}
              >
                Identify
              </button>

              <div className={styles.hint}>
                <div>
                  Connection: <span className={styles.mono}>{connectionId}</span>
                </div>
                <div>
                  Identity: <span className={styles.mono}>{identityStatus}</span>
                </div>
                <div>
                  {isCapturing ? (
                    <span>
                      Capturing <span className={styles.mono}>shatteredarchive:raw-data</span> for 1 second…
                    </span>
                  ) : (
                    <span>Click Identify to capture 1 second of raw output and send the id command.</span>
                  )}
                </div>
              </div>

              {isCapturing ? (
                <button className={styles.secondaryBtn} type="button" onClick={stopCapture} disabled={isSubmitting}>
                  Stop
                </button>
              ) : null}
            </div>

            {submitError ? <div className={styles.errorBox}>{submitError}</div> : null}
            {submitOk ? <div className={styles.okBox}>Submitted.</div> : null}
          </div>

          <div className={styles.splitter} />

          <div className={styles.detailSection}>
            {lines.length === 0 ? (
              <div className={styles.empty}>No captured lines yet.</div>
            ) : (
              <div className={styles.lineList}>
                {lines.map((line, idx) => (
                  <div key={idx} className={styles.lineRow}>
                    <button
                      className={styles.deleteBtn}
                      type="button"
                      onClick={() => deleteLine(idx)}
                      aria-label="Delete line"
                      disabled={isSubmitting}
                    >
                      ✕
                    </button>
                    <pre className={styles.lineText}>{line}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.footer}>
            <button className={styles.submitBtn} type="button" onClick={onSubmit} disabled={!canSubmit}>
              {isSubmitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </div>
    </div>
  );
};

export default ContributeIdentifyModal;
