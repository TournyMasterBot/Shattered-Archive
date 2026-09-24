import React from 'react';
import styles from '../../styles/hud/CompactRoomRow.module.scss';
import { useRoomHeader } from '../../hooks/useRoomHeader';
import { useCompassBlock, type CompassDirection } from '../../hooks/useCompassBlock';
import { useWorldTimePeriod } from '../../hooks/useWorldTimePeriod';

const EXIT_ORDER: CompassDirection[] = ['N', 'E', 'S', 'W', 'U', 'D', 'NE', 'NW', 'SE', 'SW'];

const WORLD_TIME_ICONS: Record<string, string> = {
  Dawn: '🌅',
  'Day Time': '☀️',
  Dusk: '🌇',
  'Night Time': '🌙',
};

export const CompactRoomRow: React.FC = () => {
  const { roomName, roomFlags } = useRoomHeader();
  const { hasExit, move } = useCompassBlock();
  const { period } = useWorldTimePeriod();

  const availableExits = EXIT_ORDER.filter((dir) => hasExit(dir));
  const periodIcon = period ? WORLD_TIME_ICONS[period] : undefined;

  return (
    <div className={`${styles.root} sa-hud-room-row`}>
      {periodIcon && (
        <span className={styles.periodIcon} title={period ?? undefined}>
          {periodIcon}
        </span>
      )}
      <span className={styles.roomName}>{roomName}</span>
      {roomFlags && <span className={styles.roomSector}>{roomFlags}</span>}
      <span className={`${styles.exits} sa-hud-room-exits`}>
        {'['}
        {availableExits.map((dir) => (
          <button
            key={dir}
            type="button"
            className={`${styles.exitBtn} sa-hud-room-exit`}
            data-available="true"
            onClick={() => move(dir)}
          >
            {dir}
          </button>
        ))}
        {']'}
      </span>
    </div>
  );
};

export default CompactRoomRow;
