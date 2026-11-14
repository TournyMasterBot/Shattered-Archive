import { fireEvent, render, screen, within } from '@testing-library/react';
import type { MapFile } from '@shatteredarchive/shattered-maps-core';
import { candidatesMap, nlink, nroom } from '../../testing/neutralFixtures';
import SliceView, { MAX_LISTED_ROOMS, type SliceViewProps } from './SliceView';

const map = candidatesMap();

function show(props: Partial<SliceViewProps> = {}) {
  const handlers = { onFloor: jest.fn(), onFocus: jest.fn(), onSelectRoom: jest.fn() };
  const view = render(<SliceView map={map} focus={{ level: 'subzone', id: 's-fields' }} floor={null} selectedRoom={null} {...handlers} {...props} />);
  return { ...handlers, view };
}
const q = (selector: string): Element[] => [...document.querySelectorAll(selector)];

describe('SliceView: gaps, conflicts and links that leave the page', () => {
  it('draws a chip with "?" on the tile edge for an exit whose target is unknown, as its own element', () => {
    show();
    const chips = q('svg g[data-state="unknown-target"]');
    expect(chips).toHaveLength(1);
    expect(chips[0].getAttribute('data-link')).toBe('l3');
    expect(q('svg g[data-link="l3"] text').map((t) => t.textContent)).toEqual(['?']);
  });

  it('draws a conflict apart from the confirmed links: red, short dashes, its own state', () => {
    show();
    const conflict = q('svg line[data-state="conflict"]');
    expect(conflict).toHaveLength(1);
    expect(conflict[0].getAttribute('stroke')).toBe('#c0392b');
    expect(conflict[0].getAttribute('stroke-dasharray')).toBe('2 2');
    const confirmed = q('svg line[data-state="confirmed"]');
    expect(confirmed.length).toBeGreaterThan(0);
    expect(confirmed.every((l) => l.getAttribute('stroke-dasharray') === null)).toBe(true);
  });

  it('draws an arrow chip for a link that leaves the page, naming the room it reaches', () => {
    show();
    expect(q('svg g[data-link="l4"] text').map((t) => t.textContent)).toEqual(['→']);
    expect(q('svg g[data-link="l4"][data-offpage-to]')).toHaveLength(1);
  });

  it('counts them, and lists the gaps and conflicts as buttons that select the room they start at', () => {
    const { onSelectRoom } = show();
    const counts = screen.getByText(/unknown exit/).parentElement as HTMLElement;
    expect(counts.textContent).toBe('1 unknown exit1 conflict1 leaving the page');
    fireEvent.click(screen.getByText('Gaps and conflicts (2)'));
    fireEvent.click(screen.getByRole('button', { name: 'The Gate N: unknown target' }));
    expect(onSelectRoom).toHaveBeenCalledWith('r-gate');
    fireEvent.click(screen.getByRole('button', { name: 'The Barn S: sightings disagree' }));
    expect(onSelectRoom).toHaveBeenLastCalledWith('r-barn');
  });

  it('explains how to read the lines', () => {
    show();
    const legend = screen.getByRole('list', { name: 'How to read the map' });
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'solid line: walked both ways',
      'dashed: seen once, or imported',
      'red, dotted: two sightings disagree',
      '? an exit that goes somewhere unknown',
      '→ a link that leaves this page',
      'tile colour: the terrain of the room (grey: not known yet)',
    ]);
  });

  it('explains the chips, the labels and the hexagon only when the picture has them', () => {
    show();
    expect(screen.queryByText(/round chip/)).toBeNull();
    expect(screen.queryByText(/square chip/)).toBeNull();
    expect(screen.queryByText(/IN way in/)).toBeNull();
    expect(screen.queryByText(/amber or purple tile/)).toBeNull();
    const maze: MapFile = {
      version: 1,
      continents: [
        {
          id: 'c',
          name: 'C',
          areas: [
            {
              id: 'a',
              name: 'A',
              placement: null,
              sources: [],
              subzones: [
                {
                  id: 's',
                  name: 'Maze',
                  kind: 'maze',
                  rooms: [nroom('m1', 'One', 0, 0, { exits: { N: 't1', E: 't2' } }), nroom('m2', 'Two', 0, 1), nroom('m3', 'Three', 9, 9)],
                },
              ],
            },
          ],
        },
      ],
      links: [nlink('t1', 'm1', 'N', 'm2'), nlink('t2', 'm1', 'E', 'm3')],
    };
    show({ map: maze, focus: { level: 'subzone', id: 's' } });
    expect(screen.getByText("round chip on a room's edge: the exit on that side does not lead straight on")).toBeTruthy();
    expect(screen.getByText('square chip: an exit that lands far away (a teleport)')).toBeTruthy();
    expect(screen.getByText('IN way in · OUT leaves the area · END dead end · 1-WAY no way back')).toBeTruthy();
    expect(q('svg [data-tangled]')).toHaveLength(2);
    expect(screen.getByText('amber or purple tile: a maze, or a room with such an exit')).toBeTruthy();
    expect(q('svg [data-tangled="teleport"]')).toHaveLength(1);
    expect(q('svg polygon[data-kind="maze"]')).toHaveLength(3);
  });

  it('leaves the terrain line out of the key when no room has a terrain', () => {
    const plain: MapFile = {
      version: 1,
      continents: [
        {
          id: 'c',
          name: 'C',
          areas: [{ id: 'a', name: 'A', placement: null, sources: [], subzones: [{ id: 's', name: 'S', kind: 'consistent', rooms: [nroom('p1', 'One', 0, 0), nroom('p2', 'Two', 1, 0)] }] }],
        },
      ],
      links: [],
    };
    show({ map: plain, focus: { level: 'subzone', id: 's' } });
    expect(screen.queryByText(/tile colour/)).toBeNull();
    expect(screen.getByText('solid line: walked both ways')).toBeTruthy();
  });

  it('says when rooms have no position, and draws no gap list when there is nothing to list', () => {
    const lone: MapFile = JSON.parse(JSON.stringify(map));
    delete lone.continents[0].areas[0].subzones[1].rooms[0].coords;
    show({ map: lone, focus: { level: 'subzone', id: 's-cellar' } });
    expect(screen.getByText('1 without a position')).toBeTruthy();
    expect(screen.queryByText(/Gaps and conflicts/)).toBeNull();
    expect(q('svg text').map((t) => t.textContent)).toEqual(['No room here has a position yet']);
  });
});

describe('SliceView: picking things', () => {
  it('selects a room when its tile is clicked, and zooms into it on a double click', () => {
    const { onSelectRoom, onFocus } = show();
    const tile = q('svg polygon[data-room="r-barn"]')[0];
    fireEvent.click(tile);
    expect(onSelectRoom).toHaveBeenCalledWith('r-barn');
    fireEvent.doubleClick(tile);
    expect(onFocus).toHaveBeenCalledWith({ level: 'room', id: 'r-barn' });
  });

  it('ignores clicks on the empty part of the drawing', () => {
    const { onSelectRoom, onFocus } = show();
    fireEvent.click(q('svg')[0]);
    fireEvent.doubleClick(q('svg')[0]);
    expect(onSelectRoom).not.toHaveBeenCalled();
    expect(onFocus).not.toHaveBeenCalled();
  });

  it('lists the rooms as buttons too (the drawing cannot be tabbed through), each with a zoom-in button', () => {
    const { onSelectRoom, onFocus } = show({ selectedRoom: 'r-well' });
    const gate = screen.getByRole('button', { name: 'The Gate' });
    fireEvent.click(gate);
    expect(onSelectRoom).toHaveBeenCalledWith('r-gate');
    expect(screen.getByRole('button', { name: 'The Well' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in to The Well' }));
    expect(onFocus).toHaveBeenCalledWith({ level: 'room', id: 'r-well' });
  });

  it('marks the selected tile, and the tiles already decided in review, on the drawing', () => {
    show({ selectedRoom: 'r-gate', statusOf: (id) => (id === 'r-barn' ? 'accepted' : id === 'r-well' ? 'rejected' : 'candidate') });
    expect(q('svg [data-selected="true"]').map((e) => e.getAttribute('data-room'))).toEqual(['r-gate']);
    expect(q('svg [data-review="accepted"]').map((e) => e.getAttribute('data-room'))).toEqual(['r-barn']);
    expect(q('svg [data-review="rejected"]').map((e) => e.getAttribute('data-room'))).toEqual(['r-well']);
    expect(q('svg [data-review="edited"]')).toHaveLength(0);
  });

  it('takes the marks off again when the selection or the decisions change', () => {
    const { view } = show({ selectedRoom: 'r-gate', statusOf: () => 'accepted' });
    view.rerender(
      <SliceView map={map} focus={{ level: 'subzone', id: 's-fields' }} floor={null} selectedRoom={null} onFloor={() => undefined} onFocus={() => undefined} onSelectRoom={() => undefined} />,
    );
    expect(q('svg [data-selected]')).toHaveLength(0);
    expect(q('svg [data-review]')).toHaveLength(0);
  });
});

describe('SliceView: levels', () => {
  it('draws the areas of a continent as boxes by their placement, says which are not placed, and lists them as buttons', () => {
    const { onFocus } = show({ focus: { level: 'continent', id: 'c-green' } });
    expect(q('svg rect[data-area]').map((r) => r.getAttribute('data-area'))).toEqual(['a-farm']);
    expect(q('svg [data-unplaced="areas"]').map((t) => t.textContent)).toEqual(['Not placed yet: Harbor']);
    fireEvent.click(q('svg rect[data-area="a-farm"]')[0]);
    expect(onFocus).toHaveBeenCalledWith({ level: 'area', id: 'a-farm' });
    const areas = screen.getByRole('list', { name: 'Areas' });
    fireEvent.click(within(areas).getByRole('button', { name: /Harbor/ }));
    expect(onFocus).toHaveBeenLastCalledWith({ level: 'area', id: 'a-harbor' });
    expect(within(areas).getByRole('button', { name: /North Farm/ }).textContent).toBe('North Farm 4 rooms');
    expect(screen.queryByRole('list', { name: 'How to read the map' })).toBeNull();
  });

  it('draws no empty sheet for a continent where no area is placed, and says why; the areas are still there to choose', () => {
    const loose: MapFile = JSON.parse(JSON.stringify(map));
    for (const area of loose.continents[0].areas) area.placement = null;
    const { onFocus } = show({ map: loose, focus: { level: 'continent', id: 'c-green' } });
    expect(q('svg')).toHaveLength(0);
    expect(screen.getByText(/No area of this continent has been placed on its map yet/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole('list', { name: 'Areas' })).getByRole('button', { name: /North Farm/ }));
    expect(onFocus).toHaveBeenCalledWith({ level: 'area', id: 'a-farm' });
  });

  it('puts areas with no rooms behind a fold, so the ones with rooms are the first thing there is', () => {
    const catalog: MapFile = JSON.parse(JSON.stringify(map));
    catalog.continents[0].areas.push({ id: 'a-none', name: 'Unmapped Moor', placement: null, subzones: [{ id: 's-none', name: 'Main', kind: 'consistent', rooms: [] }] });
    const { onFocus } = show({ map: catalog, focus: { level: 'continent', id: 'c-green' } });
    expect(within(screen.getByRole('list', { name: 'Areas' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['North Farm 4 rooms', 'Harbor 1 rooms']);
    fireEvent.click(screen.getByText('Areas with no rooms yet (1)'));
    fireEvent.click(within(screen.getByRole('list', { name: 'Areas with no rooms' })).getByRole('button', { name: 'Unmapped Moor' }));
    expect(onFocus).toHaveBeenCalledWith({ level: 'area', id: 'a-none' });
  });

  it('shows no fold when every area has rooms', () => {
    show({ focus: { level: 'continent', id: 'c-green' } });
    expect(screen.queryByText(/Areas with no rooms yet/)).toBeNull();
  });

  it('asks which subzone to open when an area has several, instead of drawing them on top of each other', () => {
    const { onFocus } = show({ focus: { level: 'area', id: 'a-farm' } });
    expect(q('svg')).toHaveLength(0);
    expect(screen.getByText(/2 subzones, each laid out on its own grid/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Cellar/ }));
    expect(onFocus).toHaveBeenCalledWith({ level: 'subzone', id: 's-cellar' });
  });

  it('draws an area with one subzone directly', () => {
    show({ focus: { level: 'area', id: 'a-harbor' } });
    expect(q('svg polygon[data-room="r-quay"]')).toHaveLength(1);
  });

  it('draws a room with the rooms its exits reach, the room outlined, and no floor choice', () => {
    show({ focus: { level: 'room', id: 'r-gate' } });
    expect(q('svg polygon[data-focus="true"]').map((p) => p.getAttribute('data-room'))).toEqual(['r-gate']);
    expect(q('svg polygon[data-room]').map((p) => p.getAttribute('data-room')).sort()).toEqual(['r-barn', 'r-gate']);
    expect(screen.queryByRole('group', { name: 'Floor' })).toBeNull();
    expect(screen.getByText('Rooms on this view')).toBeTruthy();
  });

  it('offers the floors when there are several, opens on the busiest, and draws the one chosen', () => {
    const tall: MapFile = JSON.parse(JSON.stringify(map));
    tall.continents[0].areas[0].subzones[0].rooms[2].coords = { x: 1, y: 1, z: 1 };
    const { onFloor, view } = show({ map: tall });
    const floors = screen.getByRole('group', { name: 'Floor' });
    expect(within(floors).getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['Floor 0 2', 'true'],
      ['Floor 1 1', 'false'],
    ]);
    expect(q('svg polygon[data-room]').map((p) => p.getAttribute('data-room')).sort()).toEqual(['r-barn', 'r-gate']);
    fireEvent.click(within(floors).getByRole('button', { name: /Floor 1/ }));
    expect(onFloor).toHaveBeenCalledWith(1);
    view.rerender(<SliceView map={tall} focus={{ level: 'subzone', id: 's-fields' }} floor={1} selectedRoom={null} onFloor={onFloor} onFocus={() => undefined} onSelectRoom={() => undefined} />);
    expect(q('svg polygon[data-room]').map((p) => p.getAttribute('data-room'))).toEqual(['r-well']);
  });

  it('lists at most a few hundred rooms as buttons and says so; the drawing still has them all', () => {
    const big: MapFile = JSON.parse(JSON.stringify(map));
    const total = MAX_LISTED_ROOMS + 50;
    big.continents[0].areas[0].subzones[1].rooms = Array.from({ length: total }, (_, i) => nroom(`r-${i}`, `Room ${i}`, i % 40, Math.floor(i / 40)));
    show({ map: big, focus: { level: 'subzone', id: 's-cellar' } });
    expect(q('details ul li')).toHaveLength(MAX_LISTED_ROOMS);
    expect(screen.getByText(`Showing the first ${MAX_LISTED_ROOMS} of ${total}; zoom in to a subzone for fewer.`)).toBeTruthy();
    expect(q('svg polygon[data-room]')).toHaveLength(total);
  });

  it('says there is nothing to show for a focus that is not in the map', () => {
    show({ focus: { level: 'room', id: 'nope' } });
    expect(screen.getByText('Nothing to show here.')).toBeTruthy();
  });

  it('writes room titles into the drawing escaped, so a hostile title cannot add markup', () => {
    const hostile: MapFile = JSON.parse(JSON.stringify(map));
    hostile.continents[0].areas[0].subzones[1].rooms[0].title = '<img src=x onerror=alert(1)>"&';
    show({ map: hostile, focus: { level: 'subzone', id: 's-cellar' } });
    expect(q('svg img')).toHaveLength(0);
    expect(q('svg title').map((t) => t.textContent)).toContain('<img src=x onerror=alert(1)>"&');
  });
});
