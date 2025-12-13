// apps/game-client/src/components/RoomHeader.tsx
import React from 'react';
import styles from '../styles/LayoutShell.module.scss';
import { useRoomHeader } from '../hooks/useRoomHeader';

export const RoomHeader: React.FC = () => {
  const { roomName, roomFlags } = useRoomHeader();

  return (
    <div className={styles.roomHeader}>
      <div className={styles.roomTitle}>{roomName || ''}</div>
      <div className={styles.roomSubtitle}>{roomFlags}</div>
    </div>
  );
};

export default RoomHeader;
