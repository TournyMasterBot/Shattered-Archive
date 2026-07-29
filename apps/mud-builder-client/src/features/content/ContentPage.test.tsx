import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import ContentPage from './ContentPage.js';

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, statusText: 'x', json: async () => body }) as unknown as Response;

const ROOM_SNIPPET = {
  id: 's1',
  kind: 'room',
  name: 'Cave entrance',
  data: { vnum: 1, name: 'Cave entrance' },
  createdAt: '2026-07-28T00:00:00Z',
  updatedAt: '2026-07-28T00:00:00Z',
};

describe('ContentPage (Phase G)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows an empty-state message with no snippets', async () => {
    globalThis.fetch = jest.fn(async () => json({ snippets: [] })) as unknown as typeof fetch;
    render(<ContentPage onLoad={jest.fn()} />);
    expect(await screen.findByText(/No snippets yet/)).toBeTruthy();
  });

  it('groups snippets by kind and calls onLoad with the snippet data', async () => {
    globalThis.fetch = jest.fn(async () => json({ snippets: [ROOM_SNIPPET] })) as unknown as typeof fetch;
    const onLoad = jest.fn();
    render(<ContentPage onLoad={onLoad} />);

    expect(await screen.findByText('Rooms')).toBeTruthy();
    expect(screen.getByText('Cave entrance')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Load into editor' }));
    expect(onLoad).toHaveBeenCalledWith('room', ROOM_SNIPPET.data);
  });

  it('renames a snippet', async () => {
    let saved: { name: string }[] = [];
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!init?.method || init.method === 'GET') return json({ snippets: saved.length ? saved : [ROOM_SNIPPET] });
      const body = JSON.parse(String(init.body)) as { snippets: { name: string }[] };
      saved = body.snippets;
      return json({ snippets: saved });
    }) as unknown as typeof fetch;
    jest.spyOn(window, 'prompt').mockReturnValue('Renamed cave');

    render(<ContentPage onLoad={jest.fn()} />);
    await screen.findByText('Cave entrance');
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    await waitFor(() => expect(screen.getByText('Renamed cave')).toBeTruthy());
  });

  it('deletes a snippet behind a confirm', async () => {
    let deleted = false;
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!init?.method || init.method === 'GET') return json({ snippets: deleted ? [] : [ROOM_SNIPPET] });
      const body = JSON.parse(String(init.body)) as { snippets: unknown[] };
      deleted = body.snippets.length === 0;
      return json({ snippets: body.snippets });
    }) as unknown as typeof fetch;
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    render(<ContentPage onLoad={jest.fn()} />);
    await screen.findByText('Cave entrance');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByText(/No snippets yet/)).toBeTruthy());
  });
});
