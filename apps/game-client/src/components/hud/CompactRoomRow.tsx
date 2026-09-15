import React from 'react';
import styles from '../../styles/hud/CompactRoomRow.module.scss';
import { useCharacterIdentity } from '../../hooks/useCharacterIdentity';
import { useRoomHeader } from '../../hooks/useRoomHeader';
import { useCompassBlock, type CompassDirection } from '../../hooks/useCompassBlock';

const EXIT_ORDER: CompassDirection[] = ['N', 'E', 'S', 'W', 'U', 'D', 'NE', 'NW', 'SE', 'SW'];

export const CompactRoomRow: React.FC = () => {
  // characterName isn't rendered in this row today (the room name + exits
  // took the space) but the hook is exercised here since this is where the
  // spec originally placed it (§4.2) — Task 9 uses it for the terminal
  // panel title instead. Kept as a documented, intentional no-render use
  // so the hook has a real consumer even before Task 9 lands, per TDD step
  // ordering; remove this comment once Task 9 is merged and this becomes
  // moot.
  useCharacterIdentity();

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
