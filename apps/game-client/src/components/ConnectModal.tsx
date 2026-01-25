// apps/game-client/src/components/ConnectModal.tsx
import React from 'react';
import styles from '../styles/ConnectModal.module.scss';
import { useConnectModal } from '../hooks/useConnectModal';
import { ConnectModalProps } from '../types/connection-types/connect-modal-props';

export const ConnectModal: React.FC<ConnectModalProps> = ({
  isOpen,
  isConnected,
  currentHost,
  currentPort,
  onConnect,
  onDisconnect,
  onClose,
}) => {
  const {
    host,
    setHost,
    port,
    setPort,
    remember,
    setRemember,
    autoEnableGmcp,
    setAutoEnableGmcp,
    saved,
    selectedId,
    error,
    handleSelectSaved,
    handleDeleteSaved,
    handleConnect,
    handleDisconnect,
    handleClose,
  } = useConnectModal({
    isOpen,
    isConnected,
    currentHost,
    currentPort,
    onConnect,
    onDisconnect,
    onClose,
  });

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Connect to server">
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerTitle}>Connect</div>
          {isConnected && currentHost && (
            <div className={styles.headerStatus}>
              Connected to <span className={styles.headerStatusHost}>{currentHost}</span>
              {currentPort != null && <span className={styles.headerStatusPort}>:{currentPort}</span>}
            </div>
          )}
          <button type="button" className={styles.closeButton} onClick={handleClose}>
            ×
          </button>
        </header>

        {/* Body: left quick-connects, right form */}
        <div className={styles.body}>
          {/* Quick connects */}
          <aside className={styles.savedPane}>
            <div className={styles.savedHeader}>Saved connections</div>
            <div className={styles.savedList}>
              {saved.length === 0 && (
                <div className={styles.savedEmpty}>No saved connections yet. Connect with “Remember” checked.</div>
              )}

              {saved.map((conn) => (
                <div
                  key={conn.id}
                  className={`${styles.savedItem} ${selectedId === conn.id ? styles.savedItemActive : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectSaved(conn)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectSaved(conn);
                    }
                  }}
                >
                  <div className={styles.savedItemMain}>
                    <span className={styles.savedName}>{conn.name}</span>
                    <span className={styles.savedHostPort}>
                      {conn.host}:{conn.port}
                    </span>
                  </div>

                  <button
                    type="button"
                    className={styles.savedDeleteButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSaved(conn.id);
                    }}
                    aria-label="Delete saved connection"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </aside>

          {/* Connect form */}
          <section className={styles.formPane}>
            <div className={styles.fieldRow}>
              <label className={styles.fieldLabel}>
                Host
                <input
                  className={styles.fieldInput}
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="e.g. dsl-mud.org"
                />
              </label>

              <label className={styles.fieldLabel}>
                Port
                <input
                  className={styles.fieldInput}
                  type="number"
                  min={1}
                  max={65535}
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="e.g. 4000"
                />
              </label>
            </div>

            <label className={styles.rememberRow}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember this connection
            </label>

            <label className={styles.rememberRow}>
              <input type="checkbox" checked={autoEnableGmcp} onChange={(e) => setAutoEnableGmcp(e.target.checked)} />
              Auto-enable GMCP (send <code>gmcp</code> if needed)
            </label>

            {error && <div className={styles.errorText}>{error}</div>}

            <div className={styles.buttonsRow}>
              <button type="button" className={styles.primaryButton} onClick={handleConnect}>
                {isConnected ? 'Connect to another server' : 'Connect'}
              </button>

              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleDisconnect}
                disabled={!isConnected}
              >
                Disconnect
              </button>

              <div className={styles.buttonsSpacer} />

              <button type="button" className={styles.secondaryButton} onClick={handleClose}>
                Close
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default ConnectModal;
