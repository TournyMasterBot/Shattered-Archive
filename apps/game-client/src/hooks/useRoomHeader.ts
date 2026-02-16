// apps\game-client\src\hooks\useRoomHeader.ts
import { useEffect, useMemo, useState } from 'react';
import { ListenEvent } from '../features/event-emitter/event-dispatcher';

type RoomDataPayload = {
  room?: string;
  sector?: string;
  exits?: string[];
};

export function useRoomHeader() {
  const [roomName, setRoomName] = useState('');
  const [sector, setSector] = useState('');

  useEffect(() => {
    const dispose = ListenEvent<RoomDataPayload>(
      'game:room-data',
      (payload) => {
        const nextRoom = String(payload?.room ?? '');
        const nextSector = String(payload?.sector ?? '');

        setRoomName(nextRoom);
        setSector(nextSector);
      },
      { key: 'useRoomHeader::game:room-data' },
    );

    return () => {
      try {
        dispose?.();
      } catch {
        // ignore
      }
    };
  }, []);

  const roomFlags = useMemo(() => {
    if (!sector) return '';
    return `(${sector})`;
  }, [sector]);

  return { roomName, sector, roomFlags };
}
