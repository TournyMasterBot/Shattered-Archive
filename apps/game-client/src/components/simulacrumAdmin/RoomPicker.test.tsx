import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import RoomPicker from './RoomPicker';
import { FIXTURE_AREAS, makeIndex } from '../../testing/worldIndexFixture';
import type { WorldArea, WorldRoom } from '../../features/simulacrumAdmin/worldApi';

const areaList = (): HTMLElement => screen.getByRole('list', { name: 'Areas' });
const roomList = (): HTMLElement => screen.getByRole('list', { name: 'Rooms' });
const areaRows = (): HTMLElement[] => within(areaList()).queryAllByRole('button');
const roomRows = (): HTMLElement[] => within(roomList()).queryAllByRole('button');
const openArea = (name: RegExp): void => {
  fireEvent.click(within(areaList()).getByRole('button', { name }));
};

describe('RoomPicker: the index states (E8)', () => {
  it.each([['idle'], ['loading']])('says it is loading the areas while %s', (status) => {
    render(<RoomPicker index={makeIndex({ areas: { status } as never })} onPick={jest.fn()} />);
    expect(screen.getByText('Loading the areas…')).toBeInTheDocument();
  });

  it('shows the offline message with a way to try again', () => {
    const index = makeIndex({ areas: { status: 'offline', message: 'The world index could not be reached.' } });
    render(<RoomPicker index={index} onPick={jest.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('The world index could not be reached.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(index.refresh).toHaveBeenCalledTimes(1);
  });

  it('shows an error the same way', () => {
    render(<RoomPicker index={makeIndex({ areas: { status: 'error', message: 'The world index answered 500' } })} onPick={jest.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('answered 500');
  });

  it('shows when the data was loaded and refreshes on request', () => {
    const index = makeIndex();
    render(<RoomPicker index={index} onPick={jest.fn()} />);
    expect(screen.getByText(/^Loaded \d{2}:\d{2}:\d{2}$/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(index.refresh).toHaveBeenCalledTimes(1);
  });
});

describe('RoomPicker: areas', () => {
  it('lists every area with its vnum range, or its file when it has none, and flags an unreadable one', () => {
    render(<RoomPicker index={makeIndex()} onPick={jest.fn()} />);
    expect(areaRows().map((r) => r.textContent)).toEqual(['Alpha Keep3000-3099', 'Beta Marsh4000-4099', 'gamma.areunreadablegamma.are']);
  });

  it('filters by name, by file and by a vnum inside the range, and says so when nothing matches', () => {
    render(<RoomPicker index={makeIndex()} onPick={jest.fn()} />);
    const filter = screen.getByLabelText('Filter areas');
    fireEvent.change(filter, { target: { value: 'marsh' } });
    expect(areaRows().map((r) => r.textContent)).toEqual(['Beta Marsh4000-4099']);
    fireEvent.change(filter, { target: { value: 'alpha.are' } });
    expect(areaRows()).toHaveLength(1);
    fireEvent.change(filter, { target: { value: '4050' } });
    expect(areaRows().map((r) => r.textContent)).toEqual(['Beta Marsh4000-4099']);
    fireEvent.change(filter, { target: { value: 'zzzz' } });
    expect(areaRows()).toHaveLength(0);
    expect(screen.getByText('No area matches.')).toBeInTheDocument();
  });

  it('draws at most 200 areas and counts the rest', () => {
    const many: WorldArea[] = Array.from({ length: 230 }, (_, i) => ({ file: `a${i}.are`, name: `Area ${i}`, rooms: 1 }));
    render(<RoomPicker index={makeIndex({ areas: { status: 'ready', data: many, at: 1 } })} onPick={jest.fn()} />);
    expect(areaRows()).toHaveLength(200);
    expect(screen.getByText('30 more: narrow the filter.')).toBeInTheDocument();
  });
});

describe('RoomPicker: rooms of one area', () => {
  it('asks to pick an area first', () => {
    render(<RoomPicker index={makeIndex()} onPick={jest.fn()} />);
    expect(screen.getByText('Pick an area on the left, or search all opened areas.')).toBeInTheDocument();
    expect(roomRows()).toHaveLength(0);
  });

  it('opens an area on click: asks the index for its rooms and lists them', () => {
    const index = makeIndex();
    render(<RoomPicker index={index} onPick={jest.fn()} />);
    openArea(/Alpha Keep/);
    expect(index.loadRooms).toHaveBeenCalledWith('alpha.are');
    expect(roomRows().map((r) => r.textContent)).toEqual(['3001The Great Hall', '3002The Armoury', '3010A Dark Cellar']);
  });

  it('shows loading, then a retry for an area whose rooms could not be read (E8)', () => {
    const index = makeIndex({ rooms: { 'alpha.are': { status: 'loading' }, 'beta.are': { status: 'offline', message: 'could not be reached' } } });
    render(<RoomPicker index={index} onPick={jest.fn()} />);
    openArea(/Alpha Keep/);
    expect(screen.getByText('Loading the rooms…')).toBeInTheDocument();
    openArea(/Beta Marsh/);
    expect(screen.getByRole('alert')).toHaveTextContent('could not be reached');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(index.reloadRooms).toHaveBeenCalledWith('beta.are');
  });

  it.each([
    ['an exact vnum', '3001', [3001]],
    ['a vnum prefix', '300', [3001, 3002]],
    ['a range', '3002-3010', [3002, 3010]],
    ['a part of a name', 'cellar', [3010]],
  ])('narrows by %s', (_what, query, vnums) => {
    render(<RoomPicker index={makeIndex()} onPick={jest.fn()} />);
    openArea(/Alpha Keep/);
    fireEvent.change(screen.getByLabelText('Find a room'), { target: { value: query } });
    expect(roomRows().map((r) => Number(r.querySelector('span')?.textContent))).toEqual(vnums);
  });

  it('says so when no room matches', () => {
    render(<RoomPicker index={makeIndex()} onPick={jest.fn()} />);
    openArea(/Alpha Keep/);
    fireEvent.change(screen.getByLabelText('Find a room'), { target: { value: '9999' } });
    expect(screen.getByText('No room matches.')).toBeInTheDocument();
  });

  it('draws at most 200 rooms and counts the rest (E9)', () => {
    const rooms: WorldRoom[] = Array.from({ length: 450 }, (_, i) => ({ vnum: 5000 + i, name: `Room ${i}` }));
    const index = makeIndex({ rooms: { 'alpha.are': { status: 'ready', data: rooms, at: 1 } } });
    render(<RoomPicker index={index} onPick={jest.fn()} />);
    openArea(/Alpha Keep/);
    expect(roomRows()).toHaveLength(200);
    expect(screen.getByText('250 more: narrow the search.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Find a room'), { target: { value: '5400-5409' } });
    expect(roomRows()).toHaveLength(10);
    expect(screen.queryByText(/more: narrow/)).not.toBeInTheDocument();
  });

  it('picks a room: reports its vnum, name and area, and keeps it marked', () => {
    const onPick = jest.fn();
    const { rerender } = render(<RoomPicker index={makeIndex()} onPick={onPick} />);
    openArea(/Alpha Keep/);
    fireEvent.click(screen.getByRole('button', { name: 'Pick room 3002 The Armoury' }));
    expect(onPick).toHaveBeenCalledWith({ vnum: 3002, name: 'The Armoury', areaFile: 'alpha.are', areaName: 'Alpha Keep' });
    rerender(<RoomPicker index={makeIndex()} onPick={onPick} picked={3002} />);
    expect(screen.getByRole('button', { name: 'Pick room 3002 The Armoury' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Pick room 3001 The Great Hall' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the file as the area name when an area has no name', () => {
    const onPick = jest.fn();
    const index = makeIndex({
      areas: { status: 'ready', data: [{ file: 'plain.are', rooms: 1 }], at: 1 },
      rooms: { 'plain.are': { status: 'ready', data: [{ vnum: 10, name: 'Only Room' }], at: 1 } },
    });
    render(<RoomPicker index={index} onPick={onPick} />);
    openArea(/plain\.are/);
    fireEvent.click(screen.getByRole('button', { name: 'Pick room 10 Only Room' }));
    expect(onPick).toHaveBeenCalledWith({ vnum: 10, name: 'Only Room', areaFile: 'plain.are', areaName: undefined });
  });
});

describe('RoomPicker: searching every opened area', () => {
  const global = (): void => {
    fireEvent.change(screen.getByLabelText('Search in'), { target: { value: 'opened' } });
  };

  it('finds rooms of every opened area at once and names each one’s area', () => {
    render(<RoomPicker index={makeIndex()} onPick={jest.fn()} />);
    global();
    fireEvent.change(screen.getByLabelText('Find a room'), { target: { value: 'the' } });
    expect(roomRows().map((r) => r.textContent)).toEqual([
      '3001The Great HallAlpha Keep',
      '3002The ArmouryAlpha Keep',
      '4002The Sinking PathBeta Marsh',
    ]);
    expect(screen.getByText(/Only areas you have opened/)).toBeInTheDocument();
  });

  it('names an area that has no name by its file', () => {
    const index = makeIndex({
      areas: { status: 'ready', data: [{ file: 'plain.are', rooms: 1 }], at: 1 },
      rooms: { 'plain.are': { status: 'ready', data: [{ vnum: 10, name: 'Only Room' }], at: 1 } },
    });
    render(<RoomPicker index={index} onPick={jest.fn()} />);
    global();
    fireEvent.change(screen.getByLabelText('Find a room'), { target: { value: 'only' } });
    expect(roomRows().map((r) => r.textContent)).toEqual(['10Only Roomplain.are']);
  });

  it('does not ask to pick an area first, and says when nothing matches', () => {
    render(<RoomPicker index={makeIndex()} onPick={jest.fn()} />);
    global();
    expect(screen.queryByText(/Pick an area on the left/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Find a room'), { target: { value: 'zzzz' } });
    expect(screen.getByText('No room matches.')).toBeInTheDocument();
  });

  it('opens the area that holds a vnum that was typed, so the room can be found without a click first', () => {
    const index = makeIndex({ rooms: {} });
    render(<RoomPicker index={index} onPick={jest.fn()} />);
    global();
    fireEvent.change(screen.getByLabelText('Find a room'), { target: { value: '4001' } });
    expect(index.loadRooms).toHaveBeenCalledTimes(1);
    expect(index.loadRooms).toHaveBeenCalledWith('beta.are');
  });

  it('opens nothing for a name, for a vnum outside every range, or when searching one area', () => {
    const index = makeIndex({ rooms: {} });
    render(<RoomPicker index={index} onPick={jest.fn()} />);
    fireEvent.change(screen.getByLabelText('Find a room'), { target: { value: '4001' } }); // one-area scope
    expect(index.loadRooms).not.toHaveBeenCalled();
    global();
    fireEvent.change(screen.getByLabelText('Find a room'), { target: { value: 'marsh' } });
    fireEvent.change(screen.getByLabelText('Find a room'), { target: { value: '9' } });
    expect(index.loadRooms).not.toHaveBeenCalled();
  });

  it('skips an area with no vnum range when looking for the one that holds a vnum', () => {
    const index = makeIndex({ rooms: {} });
    render(<RoomPicker index={index} onPick={jest.fn()} />);
    global();
    fireEvent.change(screen.getByLabelText('Find a room'), { target: { value: '3050' } });
    expect(index.loadRooms.mock.calls).toEqual([['alpha.are']]);
    expect(FIXTURE_AREAS.find((a) => a.minVnum === undefined)?.file).toBe('gamma.are');
  });
});
