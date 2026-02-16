// apps/game-client/src/components/ContributeLoreModal.tsx
import React from 'react';
import styles from '../styles/ContributeLoreModal.module.scss';

export interface ContributeLoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string; // ✅ NEW
}

export const ContributeLoreModal: React.FC<ContributeLoreModalProps> = ({ isOpen, onClose, connectionId }) => {
  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>Contribute · Creature Lore</div>
          <button className={styles.closeBtn} onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {/* existing content here; connectionId is now available for the later dispatch/capture flow */}
        </div>
      </div>
    </div>
  );
};

export default ContributeLoreModal;
