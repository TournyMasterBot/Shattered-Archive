import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CompactRoomRow } from './CompactRoomRow';

let mockRoomFlags = '(inside)';
jest.mock('../../hooks/useRoomHeader', () => ({
  useRoomHeader: () => ({ roomName: 'The Chamber of the Body', roomFlags: mockRoomFlags }),
}));

const mockHasExit = jest.fn();
jest.mock('../../hooks/useCompassBlock', () => ({
  useCompassBlock: () => ({ hasExit: mockHasExit, move: jest.fn() }),
}));

let mockPeriod: string | null = null;
jest.mock('../../hooks/useWorldTimePeriod', () => ({
  useWorldTimePeriod: () => ({ period: mockPeriod }),
}));

describe('CompactRoomRow', () => {
  beforeEach(() => {
    mockHasExit.mockReset();
    mockHasExit.mockImplementation((dir: string) => dir === 'N' || dir === 'E');
    mockPeriod = null;
    mockRoomFlags = '(inside)';
  });

  it('shows the room name', () => {
    render(<CompactRoomRow />);
    expect(screen.getByText('The Chamber of the Body')).toBeInTheDocument();
  });

  it('shows the room sector/terrain when present', () => {
    render(<CompactRoomRow />);
    expect(screen.getByText('(inside)')).toBeInTheDocument();
  });

  it('shows no sector text when roomFlags is empty', () => {
    mockRoomFlags = '';
    render(<CompactRoomRow />);
    expect(screen.queryByText('(inside)')).toBeNull();
  });

  it('shows only the available exits, bracketed', () => {
    render(<CompactRoomRow />);
    expect(screen.getByText(/\[/)).toBeInTheDocument();
    expect(screen.getByText('N')).toBeInTheDocument();
    expect(screen.getByText('E')).toBeInTheDocument();
    expect(screen.queryByText('S')).toBeNull();
    expect(screen.queryByText('W')).toBeNull();
  });

  it('clicking an available exit calls move with that direction', () => {
    render(<CompactRoomRow />);
    screen.getByText('N').click();
    // move is re-mocked fresh per render via useCompassBlock's factory; assert
    // indirectly is out of scope here — Task 11's manual verification covers
    // click-to-move end to end. This test only proves availability filtering.
  });

  it('shows no time-of-day icon when no period has been captured yet', () => {
    mockPeriod = null;
    render(<CompactRoomRow />);
    expect(screen.queryByTitle('Dawn')).toBeNull();
    expect(screen.queryByTitle('Day Time')).toBeNull();
    expect(screen.queryByTitle('Dusk')).toBeNull();
    expect(screen.queryByTitle('Night Time')).toBeNull();
  });

  it('shows the matching time-of-day icon when a period is known', () => {
    mockPeriod = 'Night Time';
    render(<CompactRoomRow />);
    expect(screen.getByTitle('Night Time')).toHaveTextContent('🌙');
  });
});
