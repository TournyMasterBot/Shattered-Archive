// apps/game-client/src/components/EquipmentModal.tsx
import React from 'react';
import styles from '../styles/EquipmentModal.module.scss';
import { useEquipmentState } from '../hooks/useEquipmentState';
import { setHotbarDockMode } from '../features/equipment/equipment-store';
import type { EquipmentSlot, EqSlot, HotbarDockMode } from '../features/equipment/equipment-types';

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

function eqTagForHotbarSlot(slot: EquipmentSlot): EqSlot {
  if (slot === 'wielded') return 'wielded';
  if (slot === 'secondary') return 'secondary_weapon';
  if (slot === 'shield') return 'worn_as_shield';
  return 'sheathed';
}

function mergeSnapshotWithHotbar(snapshotLines: string[], hotbar: Record<EquipmentSlot, string>): string[] {
  const replacements: Array<{ tag: EqSlot; line: string }> = (Object.keys(hotbar) as EquipmentSlot[]).map((k) => {
    const tag = eqTagForHotbarSlot(k);
    const val = hotbar[k] ?? '(nothing)';
    return { tag, line: `<${tag}> ${val}` };
  });

  const out = [...snapshotLines];

  for (const rep of replacements) {
    const prefix = `<${rep.tag}>`;
    const idx = out.findIndex((l) => String(l ?? '').trimStart().startsWith(prefix));

    if (idx >= 0) out[idx] = rep.line;
    else out.push(rep.line);
  }

  return out;
}

export const EquipmentModal: React.FC<EquipmentModalProps> = ({ isOpen, onClose, connectionId }) => {
  const { state, prefs, profile } = useEquipmentState(connectionId);

  const wielded = state.slots.wielded;
  const secondary = state.slots.secondary;
  const shield = state.slots.shield;
  const sheathed = state.slots.sheathed;

  const hasAnyHotbar = !!(wielded || secondary || shield || sheathed);

  const snapshot = profile.snapshot;
  const snapshotLines = snapshot?.allLines ?? [];
  const hasSnapshot = snapshotLines.length > 0;

  const hasDirtyHotbar = !!wielded?.dirty || !!secondary?.dirty || !!shield?.dirty || !!sheathed?.dirty;

  const estimatedLines = React.useMemo(() => {
    if (!hasSnapshot) return [];

    const hotbarText: Record<EquipmentSlot, string> = {
      wielded: wielded?.text ?? '(nothing)',
      secondary: secondary?.text ?? '(nothing)',
      shield: shield?.text ?? '(nothing)',
      sheathed: sheathed?.text ?? '(nothing)',
    };

    return mergeSnapshotWithHotbar(snapshotLines, hotbarText);
  }, [hasSnapshot, snapshotLines, wielded?.text, secondary?.text, shield?.text, sheathed?.text]);

  const setDock = (mode: HotbarDockMode) => {
    void setHotbarDockMode(connectionId, mode);
  };

  // ✅ Hooks are done; safe to early-return now.
  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>Equipment</div>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.body}>
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
            <div className={styles.sectionTitle}>Gear (snapshot + deltas)</div>

            {!hasSnapshot ? (
              <div className={styles.empty}>No eq snapshot captured yet.</div>
            ) : (
              <>
                {hasDirtyHotbar ? (
                  <div className={styles.footerNote}>
                    Hotbar is <span className={styles.dirty}>dirty</span> (live changes not yet confirmed by <b>eq</b>).
                  </div>
                ) : null}

                <div className={styles.eqList}>
                  {estimatedLines.map((line, idx) => (
                    <div key={idx} className={styles.eqLine}>
                      {line}
                    </div>
                  ))}
                </div>
              </>
            )}

            {snapshot?.updatedAt ? (
              <div className={styles.footerNote}>Snapshot time: {new Date(snapshot.updatedAt).toLocaleString()}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EquipmentModal;
