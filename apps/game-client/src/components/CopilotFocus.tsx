import React from 'react';
import { FOCUS_LABELS, type Focus, type FocusStore } from '../features/copilot/focus';
import styles from '../styles/CopilotFocus.module.scss';

/** Remembered for the browser session once the owner has said yes, so the question is not asked again until the tab is closed. */
export const CONFIRMED_KEY = 'copilot.focus.confirmed.v1';

type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** The browser's session storage, touched only inside the guards below: a browser that blocks it throws there, and the question is then asked every time. */
const browserSession: SessionStorageLike = {
  getItem: (key) => window.sessionStorage.getItem(key),
  setItem: (key, value) => window.sessionStorage.setItem(key, value),
};

function wasConfirmed(storage: SessionStorageLike): boolean {
  try {
    return storage.getItem(CONFIRMED_KEY) === 'true';
  } catch {
    return false;
  }
}

const HINT: Record<Focus, string> = {
  training: 'Every suggestion waits for you: approve, correct or reject it. Your answers are what Copilot learns from.',
  agent: 'Copilot drives: it runs what your trust rules allow and asks when it is unsure. Spending, speaking to players and anything irreversible always ask.',
};

/**
 * What Copilot is for: Training (everything waits for the owner) or the AI agent (runs what the trust settings allow). Switching to the
 * AI agent asks first, once per browser session; switching back to Training never asks, and takes effect at once.
 */
const CopilotFocus: React.FC<{ focus: FocusStore; storage?: SessionStorageLike }> = ({ focus: store, storage }) => {
  const focus = React.useSyncExternalStore(store.subscribe, store.get);
  const [asking, setAsking] = React.useState(false);
  const session = storage ?? browserSession;

  const choose = (next: Focus): void => {
    if (next === focus) return;
    if (next === 'agent' && !wasConfirmed(session)) {
      setAsking(true);
      return;
    }
    setAsking(false);
    store.set(next);
  };

  const confirm = (): void => {
    try {
      session.setItem(CONFIRMED_KEY, 'true');
    } catch {
      // blocked storage: asked again next time
    }
    setAsking(false);
    store.set('agent');
  };

  return (
    <div className={styles.focus}>
      <div className={styles.row}>
        <span className={styles.label} id="copilot-focus-label">
          Focus
        </span>
        <div className={styles.choices} role="radiogroup" aria-labelledby="copilot-focus-label">
          {(['training', 'agent'] as const).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={focus === f} className={styles.choice} onClick={() => choose(f)}>
              {FOCUS_LABELS[f]}
            </button>
          ))}
        </div>
      </div>
      <p className={styles.hint}>{HINT[focus]}</p>
      {asking && (
        <div
          className={styles.confirm}
          role="alertdialog"
          aria-label="Let Copilot drive?"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation(); // answers the question only; the window stays
              setAsking(false);
            }
          }}
        >
          <p>
            <strong>Let Copilot run commands by itself?</strong> Only where a trust rule you turned on allows it, with enough of your earlier
            approvals behind it and the model sure. Anything that spends, speaks to players or cannot be undone still waits for you.
          </p>
          <div className={styles.confirmButtons}>
            <button type="button" className={styles.confirmYes} onClick={confirm} autoFocus>
              Let it drive
            </button>
            <button type="button" className={styles.confirmNo} onClick={() => setAsking(false)}>
              Stay in Training
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CopilotFocus;
