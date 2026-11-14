// apps/game-client/src/components/simulacrumAdmin/ConfirmDialog.tsx
import React from 'react';
import styles from '../../styles/SimulacrumAdminWindow.module.scss';
import type { ConfirmRequest } from '../../features/simulacrumAdmin/sender';

/**
 * The question asked before a destructive or bulk command (inline, never `window.confirm`). The confirm button has the focus so Enter
 * confirms; Escape cancels and does not reach the window, whose own Escape closes it.
 */
const ConfirmDialog: React.FC<{ request: ConfirmRequest; onAnswer: (accepted: boolean) => void }> = ({ request, onAnswer }) => (
  <div
    className={styles.confirm}
    role="alertdialog"
    aria-label="Confirm command"
    onKeyDown={(e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onAnswer(false);
      }
    }}
  >
    <p className={styles.confirmText}>{request.scope}</p>
    <p className={styles.confirmText}>
      Send <code>{request.line}</code>?
    </p>
    <div className={styles.toolbar}>
      <button type="button" className={styles.runButton} autoFocus onClick={() => onAnswer(true)}>
        Send it
      </button>
      <button type="button" className={styles.smallButton} onClick={() => onAnswer(false)}>
        Cancel
      </button>
    </div>
  </div>
);

export default ConfirmDialog;
