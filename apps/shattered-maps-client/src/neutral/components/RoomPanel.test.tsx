import { fireEvent, render, screen, within } from '@testing-library/react';
import type { MapFile } from '@shatteredarchive/shattered-maps-core';
import { candidatesMap, content } from '../../testing/neutralFixtures';
import RoomPanel from './RoomPanel';

const map = candidatesMap();

function show(roomId: string, props: { map?: MapFile; selectedLink?: string | null } = {}) {
  const handlers = { onSelectLink: jest.fn(), onGoTo: jest.fn() };
  render(<RoomPanel map={props.map ?? map} roomId={roomId} selectedLink={props.selectedLink ?? null} {...handlers} />);
  return handlers;
}
const section = (name: string): HTMLElement => screen.getByRole('region', { name });

describe('RoomPanel: the baseline of a room', () => {
  it('separates what is always there from what was seen and from what used to be there', () => {
    show('r-gate');
    const baseline = section('What this room usually holds');
    expect(within(baseline).getByText('Visited 6 times on 2 days.')).toBeTruthy();
    const fixtures = baseline.querySelector('ul[data-kind="fixtures"]') as HTMLElement;
    expect(fixtures.textContent).toBe('a tired guard ×2 seen on 6 of 6 visits');
    const transient = baseline.querySelector('ul[data-kind="transient"]') as HTMLElement;
    expect(transient.textContent).toBe('a wandering bard seen on 1 of 6 visits');
    const was = baseline.querySelector('ul[data-kind="was"]') as HTMLElement;
    expect(was.textContent).toBe('a lost cat was on 4 of 8 visits, last on 2026-11-01, dropped on 2026-11-03');
    expect(within(baseline).getByText('Always here')).toBeTruthy();
    expect(within(baseline).getByText('Seen, not part of the room')).toBeTruthy();
    expect(within(baseline).getByText('Used to be here')).toBeTruthy();
  });

  it('says there is nothing to compare against for a room no character has visited', () => {
    show('r-barn');
    expect(within(section('What this room usually holds')).getByText(/nothing to compare against/)).toBeTruthy();
  });

  it('says nothing is a fixture yet when visits exist but nothing passed the rule, and omits empty lists', () => {
    const thin: MapFile = JSON.parse(JSON.stringify(map));
    const gate = thin.continents[0].areas[0].subzones[0].rooms[0];
    gate.baseline = { visits: 1, days: ['2026-11-01'], contents: [content('a passing monk', 'transient', 1, 1)], was: [] };
    show('r-gate', { map: thin });
    const baseline = section('What this room usually holds');
    expect(within(baseline).getByText('Visited 1 time on 1 day.')).toBeTruthy();
    expect(within(baseline).getByText(/seen often enough/)).toBeTruthy();
    expect(baseline.querySelector('ul[data-kind="fixtures"]')).toBeNull();
    expect(baseline.querySelector('ul[data-kind="was"]')).toBeNull();
    expect(baseline.querySelector('ul[data-kind="transient"]')?.textContent).toBe('a passing monk seen on 1 of 1 visits');
  });

  it('never lists a player as part of a room, and names the kind of anything that is not a mob or an item', () => {
    const odd: MapFile = JSON.parse(JSON.stringify(map));
    const gate = odd.continents[0].areas[0].subzones[0].rooms[0];
    gate.baseline = {
      visits: 5,
      days: ['2026-11-01'],
      contents: [
        { ...content('Somebody', 'fixture', 5, 5), kind: 'player' },
        { ...content('a statue', 'fixture', 5, 5), kind: 'item' },
        { ...content('a hum', 'fixture', 5, 5), kind: 'unknown' },
      ],
      was: [{ label: 'Wanderer', kind: 'player', seen: 3, observed: 8, count: 1, firstSeen: '2026-11-01', lastSeen: '2026-11-01', demotedOn: '2026-11-02', returns: 2 }],
    };
    show('r-gate', { map: odd });
    const baseline = section('What this room usually holds');
    expect(baseline.textContent).not.toContain('Somebody');
    expect(within(baseline).getByText(/a statue/)).toBeTruthy();
    expect(within(baseline).getByText(/a hum/)).toBeTruthy();
    // a demoted record shows how often it came back
    expect(baseline.querySelector('ul[data-kind="was"]')?.textContent).toContain('came back 2×');
  });
});

describe('RoomPanel: exits', () => {
  it('shows each exit with how sure the map is, and marks gaps, conflicts and links that leave the page', () => {
    show('r-gate');
    const exits = section('Exits');
    const items = within(exits).getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('data-state'))).toEqual(['confirmed', 'unknown-target']);
    expect(items[0].textContent).toBe('E walked both ways The Barn 95%, walked 3×, and back');
    expect(items[1].textContent).toBe('N goes somewhere unknown target unknown 0%');
  });

  it('lists where a conflicting exit has been seen to lead', () => {
    show('r-barn');
    const conflict = within(section('Exits')).getAllByRole('listitem').find((li) => li.getAttribute('data-state') === 'conflict') as HTMLElement;
    expect(conflict.textContent).toContain('also seen to lead to The Cellar');
    expect(conflict.textContent).toContain('sightings disagree');
  });

  it('says "a room on another page" for a target that is not in the file, and "leaves this page" for the link', () => {
    const cut: MapFile = JSON.parse(JSON.stringify(map));
    cut.continents[0].areas.pop(); // the Harbor, with the Quay
    show('r-well', { map: cut });
    const item = within(section('Exits')).getAllByRole('listitem')[0];
    expect(item.textContent).toContain('a room on another page');
    expect(item.textContent).toContain('leaves this page');
  });

  it('selects an exit, and goes to the room an exit leads to', () => {
    const { onSelectLink, onGoTo } = show('r-gate', { selectedLink: 'l1' });
    const first = within(section('Exits')).getAllByRole('listitem')[0];
    expect(within(first).getByRole('button', { name: /E walked both ways/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(first).getByRole('button', { name: /E walked both ways/ }));
    expect(onSelectLink).toHaveBeenCalledWith('l1');
    fireEvent.click(within(first).getByRole('button', { name: 'The Barn' }));
    expect(onGoTo).toHaveBeenCalledWith('r-barn');
  });

  it('says so when no exit has been described', () => {
    show('r-cellar');
    expect(within(section('Exits')).getByText('No exit has been described.')).toBeTruthy();
  });
});

describe('RoomPanel: the record', () => {
  it('shows the room number, terrain, position, description and where it sits in the hierarchy', () => {
    show('r-gate');
    expect(screen.getByRole('heading', { name: 'The Gate' })).toBeTruthy();
    expect(screen.getByText('Greenmarch › North Farm › Fields')).toBeTruthy();
    expect(screen.getByText('Room number').nextElementSibling?.textContent).toBe('100');
    expect(screen.getByText('Terrain').nextElementSibling?.textContent).toBe('city');
    expect(screen.getByText('Position').nextElementSibling?.textContent).toBe('0, 0, floor 0');
    expect(screen.getByText('A tall gate.')).toBeTruthy();
  });

  it('omits what the room does not have', () => {
    show('r-barn');
    expect(screen.queryByText('Room number')).toBeNull();
    expect(screen.queryByText('Terrain')).toBeNull();
  });

  it('credits where the record came from, by author and date, and shows its history', () => {
    const reviewed: MapFile = JSON.parse(JSON.stringify(map));
    reviewed.continents[0].areas[0].subzones[0].rooms[0].history = [{ at: '2026-11-07', op: 'create', note: 'review: accepted' }, { at: '2026-11-08', op: 'split' }];
    show('r-gate', { map: reviewed });
    const origin = section('Where this record comes from');
    expect(within(origin).getByText('azah, by Test Author, 2026-10-01 (r-gate)')).toBeTruthy();
    expect(within(origin).getByRole('list', { name: 'History' }).textContent).toBe('2026-11-07: review: accepted2026-11-08: split');
  });

  it('says so for a room that is not in the map being shown', () => {
    show('nope');
    expect(screen.getByText('This room is not in the map being shown.')).toBeTruthy();
  });
});
