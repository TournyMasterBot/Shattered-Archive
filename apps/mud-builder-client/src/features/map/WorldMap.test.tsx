import { render, screen, fireEvent } from '@testing-library/react';

import WorldMap from './WorldMap.js';

beforeEach(() => {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
    if (url.endsWith('/api/map')) {
      return json({
        areas: [
          { file: 'tiny.are', name: 'Tiny', minVnum: 100, maxVnum: 199, rooms: 2 },
          { file: 'neighbor.are', name: 'Neighbor', minVnum: 200, maxVnum: 299, rooms: 1 },
          { file: 'broken.are', rooms: 0, parseError: 'line 2: bad section' },
        ],
        links: [
          {
            from: 'tiny.are',
            to: 'neighbor.are',
            count: 1,
            exits: [{ fromVnum: 100, door: 2, toVnum: 205, toName: 'Neighbor Landing' }],
          },
        ],
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
});

describe('WorldMap', () => {
  it('renders every area as a node (broken ones flagged) with links between neighbors', async () => {
    render(<WorldMap onOpenArea={() => {}} />);
    expect(await screen.findByRole('button', { name: 'area tiny.are' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'area neighbor.are' })).toBeTruthy();
    const broken = screen.getByRole('button', { name: 'area broken.are' });
    expect(broken.getAttribute('class')).toContain('mb-map-worldnode--broken');
    // the link's hover tooltip lists the connecting exit
    expect(screen.getByText(/#100 south → #205 Neighbor Landing/)).toBeTruthy();
  });

  it('clicking an area node drills into its area map', async () => {
    const onOpenArea = jest.fn();
    render(<WorldMap onOpenArea={onOpenArea} />);
    fireEvent.click(await screen.findByRole('button', { name: 'area neighbor.are' }));
    expect(onOpenArea).toHaveBeenCalledWith('neighbor.are');
  });
});
