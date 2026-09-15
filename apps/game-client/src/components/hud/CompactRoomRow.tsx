import React from 'react';
import styles from '../../styles/hud/CompactRoomRow.module.scss';
import { useRoomHeader } from '../../hooks/useRoomHeader';
import { useCompassBlock, type CompassDirection } from '../../hooks/useCompassBlock';

const EXIT_ORDER: CompassDirection[] = ['N', 'E', 'S', 'W', 'U', 'D', 'NE', 'NW', 'SE', 'SW'];

export const CompactRoomRow: React.FC = () => {
  const { roomName } = useRoomHeader();
  const { hasExit, move } = useCompassBlock();

  const availableExits = EXIT_ORDER.filter((dir) => hasExit(dir));

  return (
    <div className={`${styles.root} sa-hud-room-row`}>
      <span className={styles.roomName}>{roomName}</span>
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
