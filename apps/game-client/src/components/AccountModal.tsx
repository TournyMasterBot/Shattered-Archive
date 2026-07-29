// apps/game-client/src/components/AccountModal.tsx
import React from 'react';
import styles from '../styles/AccountModal.module.scss';
import { useAccountModal } from '../hooks/useAccountModal';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
}

export const AccountModal: React.FC<AccountModalProps> = ({ isOpen, onClose, connectionId }) => {
  const { isLoggedIn, busy, status, handleLogin, handleLogout, handleSaveToCloud, handleLoadFromCloud } =
    useAccountModal({ isOpen, connectionId, onClose });

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Account">
        <header className={styles.header}>
          <div className={styles.title}>Account</div>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </header>

        <div className={styles.body}>
          {!isLoggedIn && (
            <>
              <div className={styles.blurb}>
                Log in with your Shattered Archive account to save and load this connection's scripts and plugin
                configs from the cloud. This is optional — everything keeps working locally without it.
              </div>
              <div className={styles.actionsColumn}>
                <button type="button" className={styles.primaryButton} onClick={handleLogin} disabled={busy}>
                  Log in with Shattered Archive account
                </button>
              </div>
            </>
          )}

          {isLoggedIn && (
            <>
              <div className={styles.connectionLine}>Connection: {connectionId}</div>
              <div className={styles.blurb}>
                Save pushes this connection's local scripts and plugin configs to the cloud. Load replaces them with
                whatever was last saved there.
              </div>
              <div className={styles.actionsColumn}>
                <button type="button" className={styles.secondaryButton} onClick={handleSaveToCloud} disabled={busy}>
                  Save this connection's scripts + plugins to the cloud
                </button>
                <button type="button" className={styles.secondaryButton} onClick={handleLoadFromCloud} disabled={busy}>
                  Load from cloud into this connection
                </button>
                <button type="button" className={styles.secondaryButton} onClick={handleLogout} disabled={busy}>
                  Log out
                </button>
              </div>
            </>
          )}

          {status?.kind === 'ok' && <div className={styles.statusOk}>{status.text}</div>}
          {status?.kind === 'err' && <div className={styles.statusErr}>{status.text}</div>}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountModal;
