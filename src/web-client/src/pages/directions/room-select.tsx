import { useState, useEffect } from 'react';

interface RoomsResponse {
  payload: string[];
}

export default function RoomsSelectPage() {
  const [rooms, setRooms] = useState<string[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string>('');

  useEffect(() => {
    // Fetch from the upstream proxy endpoint
    fetch('/web-server/directions/get-rooms')
      .then((res) => res.json())
      .then((data: RoomsResponse) => {
        setRooms(data.payload);
      })
      .catch((err) => {
        console.error('Error fetching rooms:', err);
      });
  }, []);

  return (
    <div>
      <h1>Select a Room</h1>
      <input
        list="rooms-list"
        value={selectedRoom}
        onChange={(e) => setSelectedRoom(e.target.value)}
        placeholder="Type to search rooms..."
      />
      <datalist id="rooms-list">
        {rooms.map((room) => (
          <option key={room} value={room} />
        ))}
      </datalist>
    </div>
  );
}
