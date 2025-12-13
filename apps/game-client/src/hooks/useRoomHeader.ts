import { useEffect, useMemo, useState } from 'react';

type RoomDataPayload = {
  room?: string;
  sector?: string;
  exits?: string[];
};

export function useRoomHeader() {
  const [roomName, setRoomName] = useState('');
  const [sector, setSector] = useState('');

  useEffect(() => {
    const onRoomData = (ev: Event) => {
      const ce = ev as CustomEvent<RoomDataPayload>;
      const nextRoom = String(ce.detail?.room ?? '');
      const nextSector = String(ce.detail?.sector ?? '');

      setRoomName(nextRoom);
      setSector(nextSector);
    };

    window.addEventListener('game:room-data', onRoomData as EventListener);
    return () => window.removeEventListener('game:room-data', onRoomData as EventListener);
  }, []);

  const roomFlags = useMemo(() => {
    if (!sector) return '';
    return `(${sector})`;
  }, [sector]);

  return { roomName, sector, roomFlags };
}
