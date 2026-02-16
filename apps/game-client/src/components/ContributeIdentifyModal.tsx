// apps/game-client/src/components/ContributeIdentifyModal.tsx
import React from 'react';
import styles from '../styles/ContributeIdentifyModal.module.scss';
import { DispatchEvent, ListenEvent } from '../features/event-emitter/event-dispatcher';

type RawDataPayload = {
  rawText?: string;
  text?: string;
  fromUserScript?: boolean;
};

export interface ContributeIdentifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string; // ✅ NEW (for parity + later use)
}

export const ContributeIdentifyModal: React.FC<ContributeIdentifyModalProps> = ({
  isOpen,
  onClose,
  connectionId,
}) => {
  const [shortText, setShortText] = React.useState('');
  const [longText, setLongText] = React.useState('');

  const [lines, setLines] = React.useState<string[]>([]);
  const [isCapturing, setIsCapturing] = React.useState(false);

  const unbindRef = React.useRef<null | (() => void)>(null);
  const timerRef = React.useRef<number | null>(null);

  const stopCapture = React.useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    try {
      unbindRef.current?.();
    } catch {
      // ignore
    }
    unbindRef.current = null;

    setIsCapturing(false);
  }, []);

  const beginCaptureForMs = React.useCallback(
    (ms: number) => {
      stopCapture();

      setLines([]);
      setIsCapturing(true);

      // Unique key so we don't collide with other listeners
      const key = `ContributeIdentifyModal::raw-data::${Date.now()}`;

      unbindRef.current = ListenEvent<RawDataPayload>(
        'shatteredarchive:raw-data',
        (payload) => {
          const raw = String(payload?.rawText ?? payload?.text ?? '');
          if (!raw) return;
          setLines((prev) => [...prev, raw]);
        },
        { key },
      );

      timerRef.current = window.setTimeout(() => {
        stopCapture();
      }, ms);
    },
    [stopCapture],
  );

  React.useEffect(() => {
    if (!isOpen) {
      stopCapture();
      return;
    }

    return () => {
      stopCapture();
    };
  }, [isOpen, stopCapture]);

  if (!isOpen) return null;

  const deleteLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const onIdentify = () => {
    const s = shortText.trim();
    if (!s) return;

    // 1) Start capture immediately for 3 seconds
    beginCaptureForMs(3000);

    // 2) Dispatch game command immediately: c id {short}
    DispatchEvent('shatteredarchive:send-command', { cmd: `c id ${s}` });
  };

  const onSubmit = () => {
    // Placeholder — you said submit becomes POST later.
    // For now, stop capture to prevent continued accumulation.
    stopCapture();
    // eslint-disable-next-line no-alert
    window.alert('Submit is not wired yet (placeholder).');
  };

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>Contribute · Identify Object</div>
          <button className={styles.closeBtn} onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {/* Top section */}
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
                onClick={onIdentify}
                disabled={!shortText.trim() || isCapturing}
                title={isCapturing ? 'Capturing raw output…' : 'Send c id {short} and capture raw for 3s'}
              >
                {isCapturing ? 'Capturing…' : 'Identify'}
              </button>

              <div className={styles.hint}>
                {isCapturing ? (
                  <span>
                    Capturing <span className={styles.mono}>shatteredarchive:raw-data</span> for 3 seconds…
                  </span>
                ) : (
                  <span>Click Identify to send the command and capture raw output for 3 seconds.</span>
                )}
              </div>
            </div>
          </div>

          {/* Splitter */}
          <div className={styles.splitter} />

          {/* Detail section */}
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
                    >
                      ✕
                    </button>

                    {/* Placeholder: later we’ll render ANSI->HTML here */}
                    <pre className={styles.lineText}>{line}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom actions */}
          <div className={styles.footer}>
            <button className={styles.submitBtn} type="button" onClick={onSubmit} disabled={lines.length === 0}>
              Submit
            </button>
          </div>

          {/* (Optional) keep connectionId visible during dev */}
          {/* <div style={{ opacity: 0.5, fontSize: 12, marginTop: 8 }}>connectionId: {connectionId}</div> */}
        </div>
      </div>
    </div>
  );
};

export default ContributeIdentifyModal;
