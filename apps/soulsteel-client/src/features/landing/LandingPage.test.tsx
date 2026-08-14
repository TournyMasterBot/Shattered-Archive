import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('../../storage/soulsteelDb.js', () => ({
  listRoomSummaries: jest.fn(),
  deleteRoom: jest.fn(),
}));

import { deleteRoom, listRoomSummaries } from '../../storage/soulsteelDb.js';
import LandingPage from './LandingPage.js';

const mockListRoomSummaries = listRoomSummaries as jest.MockedFunction<typeof listRoomSummaries>;
const mockDeleteRoom = deleteRoom as jest.MockedFunction<typeof deleteRoom>;

const NOW = Date.now();
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

beforeEach(() => {
  mockDeleteRoom.mockReset();
  mockDeleteRoom.mockResolvedValue(undefined);
});

describe('LandingPage — resume list deletion', () => {
  it('shows the empty state when there are no saved games', async () => {
    mockListRoomSummaries.mockResolvedValue([]);
    render(<LandingPage onEnterRoom={jest.fn()} />);
    expect(await screen.findByText('No games saved on this browser yet.')).toBeDefined();
  });

  it('opens and closes the rules from the landing page', async () => {
    mockListRoomSummaries.mockResolvedValue([]);
    render(<LandingPage onEnterRoom={jest.fn()} />);
    await screen.findByText('No games saved on this browser yet.');

    fireEvent.click(screen.getByText('📜 Read the rules'));
    expect(screen.getByRole('dialog', { name: 'Rules' })).toBeDefined();

    fireEvent.click(screen.getByLabelText('Close rules'));
    expect(screen.queryByRole('dialog', { name: 'Rules' })).toBeNull();
  });

  it('asks for confirmation before deleting a single game, and Cancel keeps it', async () => {
    mockListRoomSummaries.mockResolvedValue([{ id: 'r1', updatedAt: daysAgo(1), dayNumber: 2, playerCount: 5 }]);
    render(<LandingPage onEnterRoom={jest.fn()} />);
    await screen.findByText(/Day 2/);

    fireEvent.click(screen.getByLabelText('Delete this game'));
    expect(screen.getByText('Delete this Day 2 game (5 players)?')).toBeDefined();
    expect(mockDeleteRoom).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Delete this Day 2 game (5 players)?')).toBeNull();
    expect(screen.getByText(/Day 2/)).toBeDefined();
  });

  it('deletes the game and refreshes the list on confirm', async () => {
    mockListRoomSummaries
      .mockResolvedValueOnce([{ id: 'r1', updatedAt: daysAgo(1), dayNumber: 2, playerCount: 5 }])
      .mockResolvedValueOnce([]);
    render(<LandingPage onEnterRoom={jest.fn()} />);
    await screen.findByText(/Day 2/);

    fireEvent.click(screen.getByLabelText('Delete this game'));
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => expect(mockDeleteRoom).toHaveBeenCalledWith('r1'));
    expect(await screen.findByText('No games saved on this browser yet.')).toBeDefined();
  });

  it('bulk delete only counts games older than the chosen threshold, and confirms with the count', async () => {
    mockListRoomSummaries.mockResolvedValue([
      { id: 'old', updatedAt: daysAgo(40), dayNumber: 3, playerCount: 4 },
      { id: 'recent', updatedAt: daysAgo(2), dayNumber: 1, playerCount: 4 },
    ]);
    render(<LandingPage onEnterRoom={jest.fn()} />);
    await screen.findByText(/Day 3/);

    // Default threshold is 30 days — only 'old' qualifies.
    fireEvent.click(screen.getByText('Delete old games'));
    expect(screen.getByText('Delete 1 game older than 30 days?')).toBeDefined();
  });

  it('respects a changed threshold', async () => {
    mockListRoomSummaries.mockResolvedValue([{ id: 'r1', updatedAt: daysAgo(10), dayNumber: 1, playerCount: 4 }]);
    render(<LandingPage onEnterRoom={jest.fn()} />);
    await screen.findByText(/Day 1/);

    // 10-day-old game does not qualify at the default 30-day threshold.
    expect((screen.getByText('Delete old games') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Delete games older than'), { target: { value: '5' } });
    expect((screen.getByText('Delete old games') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByText('Delete old games'));
    expect(screen.getByText('Delete 1 game older than 5 days?')).toBeDefined();
  });

  it('bulk deletes every qualifying game, leaves recent ones, and refreshes', async () => {
    mockListRoomSummaries
      .mockResolvedValueOnce([
        { id: 'old1', updatedAt: daysAgo(40), dayNumber: 3, playerCount: 4 },
        { id: 'old2', updatedAt: daysAgo(50), dayNumber: 1, playerCount: 2 },
        { id: 'recent', updatedAt: daysAgo(2), dayNumber: 1, playerCount: 4 },
      ])
      .mockResolvedValueOnce([{ id: 'recent', updatedAt: daysAgo(2), dayNumber: 1, playerCount: 4 }]);
    render(<LandingPage onEnterRoom={jest.fn()} />);
    await screen.findByText(/Day 3/);

    fireEvent.click(screen.getByText('Delete old games'));
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => expect(mockDeleteRoom).toHaveBeenCalledWith('old1'));
    expect(mockDeleteRoom).toHaveBeenCalledWith('old2');
    expect(mockDeleteRoom).not.toHaveBeenCalledWith('recent');
  });

  it('disables "Delete old games" when nothing qualifies', async () => {
    mockListRoomSummaries.mockResolvedValue([{ id: 'recent', updatedAt: daysAgo(2), dayNumber: 1, playerCount: 4 }]);
    render(<LandingPage onEnterRoom={jest.fn()} />);
    await screen.findByText(/Day 1/);
    expect((screen.getByText('Delete old games') as HTMLButtonElement).disabled).toBe(true);
  });

  it('Cancel on the bulk-delete confirmation does not delete anything', async () => {
    mockListRoomSummaries.mockResolvedValue([{ id: 'old', updatedAt: daysAgo(40), dayNumber: 3, playerCount: 4 }]);
    render(<LandingPage onEnterRoom={jest.fn()} />);
    await screen.findByText(/Day 3/);

    fireEvent.click(screen.getByText('Delete old games'));
    fireEvent.click(screen.getByText('Cancel'));

    expect(mockDeleteRoom).not.toHaveBeenCalled();
    expect(screen.getByText('Delete old games')).toBeDefined();
  });
});
