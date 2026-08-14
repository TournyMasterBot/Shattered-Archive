import { render, screen, fireEvent } from '@testing-library/react';

import WorldPage from './WorldPage.js';

describe('WorldPage (Phase 6 + Phase 11 resolved links)', () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
      if (url.endsWith('/api/world')) {
        return json({
          areas: [
            {
              file: 'tiny.are',
              name: 'Tiny',
              minVnum: 100,
              maxVnum: 199,
              counts: { rooms: 2, mobs: 1, objects: 3, resets: 4, shops: 1, specials: 1, socials: 0, scripts: 2, helps: 0 },
              errors: [],
              warnings: ['room 100 exit references vnum 5000 outside this file'],
              external: [
                { kind: 'room', vnum: 3001, where: 'room 100 exit 0', file: 'midgaard.are', name: 'The Temple Square' },
              ],
            },
            {
              file: 'broken.are',
              counts: { rooms: 0, mobs: 0, objects: 0, resets: 0, shops: 0, specials: 0, socials: 0, scripts: 0, helps: 0 },
              errors: [],
              warnings: [],
              external: [],
              parseError: 'line 2: bad section',
            },
          ],
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;
  });

  it('renders one row per area with counts, totals, and a warning drill-down', async () => {
    render(<WorldPage />);
    expect(await screen.findByText('tiny.are')).toBeTruthy();
    expect(
      screen.getByText(/2 areas · 2 rooms · 1 mobs · 3 objects · 1 invalid refs · 0 limit flags · 1 resolved cross-area/),
    ).toBeTruthy();
    expect(screen.getByText('100-199')).toBeTruthy();

    fireEvent.click(screen.getByText('1 invalid, 1 links'));
    expect(screen.getByText(/vnum 5000 outside this file/)).toBeTruthy();

    expect(screen.getByText(/parse: line 2: bad section/)).toBeTruthy();
  });

  it('renders resolved cross-area refs as links that navigate via onOpenArea', async () => {
    const onOpenArea = jest.fn();
    render(<WorldPage onOpenArea={onOpenArea} />);
    expect(await screen.findByText('tiny.are')).toBeTruthy();

    fireEvent.click(screen.getByText('1 invalid, 1 links'));
    const link = screen.getByRole('button', { name: /room #3001 — The Temple Square \(midgaard\.are\)/ });
    fireEvent.click(link);
    expect(onOpenArea).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'room', vnum: 3001, file: 'midgaard.are', name: 'The Temple Square' }),
    );
  });
});
