// apps\game-client\src\components\EquipmentHotbar.tsx
import React from 'react';
import styles from '../styles/EquipmentHotbar.module.scss';
import { useEquipmentState } from '../hooks/useEquipmentState';

export interface EquipmentHotbarProps {
  connectionId: string;
  sendRaw: (data: string) => void;
  mode: 'docked' | 'floating';
}

function SlotPill(props: { label: string; text: string; dirty: boolean; onClick?: () => void }) {
  const { label, text, dirty, onClick } = props;

  return (
    <button className={styles.pill} onClick={onClick} title={text}>
      <span className={styles.pillLabel}>{label}</span>
      <span className={styles.pillText}>{text || '—'}</span>
      {dirty ? <span className={styles.pillDirty}>dirty</span> : null}
    </button>
  );
}

export const EquipmentHotbar: React.FC<EquipmentHotbarProps> = ({ connectionId, sendRaw, mode }) => {
  const { state } = useEquipmentState(connectionId);

  const wielded = state.slots.wielded;
  const secondary = state.slots.secondary;
  const shield = state.slots.shield;
  const sheathed = state.slots.sheathed;

  const rootClass = mode === 'floating' ? `${styles.root} ${styles.rootFloating}` : styles.root;

  return (
    <div className={rootClass}>
      <SlotPill
        label="W"
        text={wielded?.text ?? ''}
        dirty={!!wielded?.dirty}
        onClick={() => {
          // later: re-arm script. For now: no-op (don’t send commands automatically)
        }}
      />
      <SlotPill
        label="S"
        text={secondary?.text ?? ''}
        dirty={!!secondary?.dirty}
        onClick={() => {
          // later: re-arm script. For now: no-op
        }}
      />
      <SlotPill label="Sh" text={shield?.text ?? ''} dirty={!!shield?.dirty} />
      <SlotPill
        label="🗡"
        text={sheathed?.text ?? ''}
        dirty={!!sheathed?.dirty}
        onClick={() => {
          // Optional manual: re-wield from sheathed if user clicks it:
          // sendRaw(`wield ${sheathed?.text ?? ''}`);
          // BUT you said: don’t introduce forced delay. So keep no-op for now.
          void sendRaw;
        }}
      />
    </div>
  );
};

export default EquipmentHotbar;
