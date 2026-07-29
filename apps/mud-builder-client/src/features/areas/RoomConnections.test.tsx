import { render, screen } from '@testing-library/react';
import type { AreaFile, Room } from '@shatteredarchive/merc-area';

import RoomConnections from './RoomConnections.js';

const AREA: AreaFile = {
  sections: [
    {
      kind: 'rooms',
      rooms: [
        {
          vnum: 100,
          name: 'The Test Room',
          description: '',
          areaNumber: 0,
          roomFlags: 0,
          sectorType: 0,
          exits: [],
          extraDescrs: [],
        },
        {
          vnum: 101,
          name: 'The Back Room',
          description: '',
          areaNumber: 0,
          roomFlags: 0,
          sectorType: 0,
          exits: [],
          extraDescrs: [],
        },
      ],
    },
  ],
};

function room(exits: Room['exits']): Room {
  return {
    vnum: 100,
    name: 'The Test Room',
    description: '',
    areaNumber: 0,
    roomFlags: 0,
    sectorType: 0,
    exits,
    extraDescrs: [],
  };
}

describe('RoomConnections', () => {
  it('renders "no exits" for a room with none', () => {
    render(<RoomConnections room={room([])} area={AREA} />);
    expect(screen.getByText('This room has no exits.')).toBeTruthy();
  });

  it('resolves a local exit target to its room name', () => {
    render(
      <RoomConnections
        room={room([{ door: 2, description: '', keyword: '', locks: 0, key: 0, toVnum: 101 }])}
        area={AREA}
      />,
    );
    expect(screen.getByText('South')).toBeTruthy();
    expect(screen.getByText(/#101 The Back Room/)).toBeTruthy();
    expect(screen.getByText(/Open passage/)).toBeTruthy();
  });

  it('marks an exit to a vnum not in this area as external', () => {
    render(
      <RoomConnections
        room={room([{ door: 0, description: '', keyword: '', locks: 2, key: 5, toVnum: 9999 }])}
        area={AREA}
      />,
    );
    expect(screen.getByText(/#9999 \(external \/ not in this area\)/)).toBeTruthy();
    expect(screen.getByText(/pickproof/)).toBeTruthy();
  });

  it('handles a null area without crashing', () => {
    render(<RoomConnections room={room([{ door: 0, description: '', keyword: '', locks: 0, key: 0, toVnum: 200 }])} area={null} />);
    expect(screen.getByText(/external \/ not in this area/)).toBeTruthy();
  });
});
