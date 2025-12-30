// apps/game-client/src/components/EquipmentModal.tsx
import React from 'react';
import styles from '../styles/EquipmentModal.module.scss';
import { useEquipmentState } from '../hooks/useEquipmentState';
import { setHotbarDockMode } from '../features/equipment/equipment-store';
import type { HotbarDockMode } from '../features/equipment/equipment-types';

export interface EquipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
}

function SlotRow(props: { label: string; text: string; dirty: boolean }) {
  const { label, text, dirty } = props;

  return (
    <div className={styles.row}>
      <div className={styles.slot}>{label}</div>
      <div className={styles.item}>
        {text ? text : <span className={styles.muted}>(nothing)</span>}
        {dirty ? <span className={styles.dirty}>dirty</span> : null}
      </div>
    </div>
  );
}

export const EquipmentModal: React.FC<EquipmentModalProps> = ({ isOpen, onClose, connectionId }) => {
  const { state, prefs, profile } = useEquipmentState(connectionId);

  if (!isOpen) return null;

  const wielded = state.slots.wielded;
  const secondary = state.slots.secondary;
  const shield = state.slots.shield;
  const sheathed = state.slots.sheathed;

  const hasAnyHotbar = !!(wielded || secondary || shield || sheathed);

  const snapshot = profile.snapshot;
  const snapshotLines = snapshot?.allLines ?? [];
  const hasSnapshot = snapshotLines.length > 0;

  const setDock = (mode: HotbarDockMode) => {
    void setHotbarDockMode(connectionId, mode);
  };

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>Equipment</div>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Hotbar</div>
          <div className={styles.toggleRow}>
            <button
              className={`${styles.toggleBtn} ${prefs.hotbarDockMode === 'docked' ? styles.toggleBtnActive : ''}`}
              onClick={() => setDock('docked')}
            >
              Docked
            </button>
            <button
              className={`${styles.toggleBtn} ${prefs.hotbarDockMode === 'floating' ? styles.toggleBtnActive : ''}`}
              onClick={() => setDock('floating')}
            >
              Floating
            </button>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Current gear</div>

          {!hasAnyHotbar ? (
            <div className={styles.empty}>
              No equipment captured yet. Type <b>eq</b> in-game to load your gear, then reopen this window.
            </div>
          ) : (
            <>
              <SlotRow label="Wielded" text={wielded?.text ?? ''} dirty={!!wielded?.dirty} />
              <SlotRow label="Secondary" text={secondary?.text ?? ''} dirty={!!secondary?.dirty} />
              <SlotRow label="Shield" text={shield?.text ?? ''} dirty={!!shield?.dirty} />
              <SlotRow label="Sheathed" text={sheathed?.text ?? ''} dirty={!!sheathed?.dirty} />
            </>
          )}

          {state.lastEqAt ? (
            <div className={styles.footerNote}>Last confirmed by eq: {new Date(state.lastEqAt).toLocaleString()}</div>
          ) : null}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Full gear (from eq)</div>

          {!hasSnapshot ? (
            <div className={styles.empty}>No eq snapshot captured yet.</div>
          ) : (
            <div className={styles.eqList}>
              {snapshotLines.map((line, idx) => (
                <div key={idx} className={styles.eqLine}>
                  {line}
                </div>
              ))}
            </div>
          )}

          {snapshot?.updatedAt ? (
            <div className={styles.footerNote}>Snapshot time: {new Date(snapshot.updatedAt).toLocaleString()}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default EquipmentModal;
