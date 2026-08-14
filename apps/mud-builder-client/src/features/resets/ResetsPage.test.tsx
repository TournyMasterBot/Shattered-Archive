import { render, screen, fireEvent } from '@testing-library/react';
import { emitAreaFile, parseAreaFile } from '@shatteredarchive/merc-area';

import ResetsPage from './ResetsPage.js';

const AREA_TEXT = `#AREA
tiny.are~
Tiny~
{ 1 50} Test  Tiny~
100 199

#MOBILES
#101
guard test~
the test guard~
A test guard stands here.
~
He looks thoroughly bored.
~
human~
A 0 0 0 1 0 1d1+1 1d1+1 1d1+1 slash 0 0 0 0 0 0 0 0 stand stand male 0 0 0 medium unknown
#0

#OBJECTS
#102
sword test~
a test sword~
A test sword lies here.~
steel~
weapon A AN
sword 1 6 slash 0
5 10 100 P
#0

#ROOMS
#100
The Test Room~
A perfectly ordinary test room.
~
0 0 1
S
#0

#RESETS
M 0 101 1 100 1
G 0 102 1
S

#$
`;

let lastPut: unknown = null;

beforeEach(() => {
  lastPut = null;
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
    if (url.endsWith('/api/capabilities')) return json({ writeEnabled: true, mercAreaPath: '/tmp' });
    if (url.endsWith('/api/areas')) return json({ areas: [{ file: 'tiny.are', name: 'Tiny' }] });
    if (url.endsWith('/api/areas/tiny.are') && init?.method === 'PUT') {
      lastPut = JSON.parse(String(init.body));
      return json({ file: 'tiny.are', saved: true, backupPath: null });
    }
    if (url.endsWith('/api/areas/tiny.are')) return json({ file: 'tiny.are', area: parseAreaFile(AREA_TEXT) });
    if (url.endsWith('/spawn')) return json({ rooms: [], doors: [], randomizedExits: [], warnings: [] });
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
});

async function openArea() {
  render(<ResetsPage />);
  fireEvent.click(await screen.findByRole('button', { name: /Tiny/ }));
  await screen.findByRole('button', { name: '+ Add reset' });
}

describe('ResetsPage', () => {
  it('renders the M and G resets with resolved entity captions', async () => {
    await openArea();
    expect((screen.getByLabelText('Reset 1 mob') as HTMLInputElement).value).toBe('101');
    expect((screen.getByLabelText('Reset 1 room') as HTMLInputElement).value).toBe('100');
    expect((screen.getByLabelText('Reset 2 object') as HTMLInputElement).value).toBe('102');
    expect(screen.getAllByText('#101 the test guard').length).toBeGreaterThan(0);
  });

  it('edits a reset arg and emits it back into the file (model → file round trip)', async () => {
    await openArea();
    fireEvent.change(screen.getByLabelText('Reset 1 world limit'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/saved tiny.are/);

    const put = lastPut as { area: Parameters<typeof emitAreaFile>[0] };
    const text = emitAreaFile(put.area);
    expect(text).toContain('M 0 101 4 100 1');
    expect(text).toContain('G 0 102 1');
  });

  it('reorders resets (emit order follows the arrows)', async () => {
    await openArea();
    fireEvent.click(screen.getByRole('button', { name: 'Move reset 2 up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/saved tiny.are/);

    const text = emitAreaFile((lastPut as { area: Parameters<typeof emitAreaFile>[0] }).area);
    expect(text.indexOf('G 0 102 1')).toBeLessThan(text.indexOf('M 0 101'));
  });

  it('adds and removes a reset', async () => {
    await openArea();
    fireEvent.click(screen.getByRole('button', { name: '+ Add reset' })); // default M template
    expect((screen.getByLabelText('Reset 3 mob') as HTMLInputElement).value).toBe('101');

    fireEvent.click(screen.getByRole('button', { name: 'Remove reset 3' }));
    expect(screen.queryByLabelText('Reset 3 mob')).toBeNull();
  });
});

describe('ResetsPage grouping (Phase 12b)', () => {
  const GROUPED_TEXT = AREA_TEXT.replace(
    'M 0 101 1 100 1\nG 0 102 1\nS',
    'M 0 101 1 100 1\nG 0 102 1\nE 0 102 1 16\nO 0 102 0 100\nM 0 101 2 100 1\nS',
  );

  beforeEach(() => {
    (globalThis.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
      if (url.endsWith('/api/capabilities')) return json({ writeEnabled: true, mercAreaPath: '/tmp' });
      if (url.endsWith('/api/areas')) return json({ areas: [{ file: 'tiny.are', name: 'Tiny' }] });
      if (url.endsWith('/api/areas/tiny.are') && init?.method === 'PUT') {
        lastPut = JSON.parse(String(init.body));
        return json({ file: 'tiny.are', saved: true, backupPath: null });
      }
      if (url.endsWith('/api/areas/tiny.are')) return json({ file: 'tiny.are', area: parseAreaFile(GROUPED_TEXT) });
      throw new Error(`unexpected fetch ${url}`);
    });
  });

  it('colors only grouped rows: one anchor with two members, lone M/O rows plain', async () => {
    const { container } = render(<ResetsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Tiny/ }));
    await screen.findByRole('button', { name: '+ Add reset' });

    expect(container.querySelectorAll('.mb-reset-row--anchor')).toHaveLength(1);
    expect(container.querySelectorAll('.mb-reset-row--member')).toHaveLength(2);
  });

  it('moves an M with its G/E riders as one unit', async () => {
    render(<ResetsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Tiny/ }));
    await screen.findByRole('button', { name: '+ Add reset' });

    // Reset 1 is the grouped M anchor; moving it down jumps the whole
    // [M,G,E] block past the O row.
    fireEvent.click(screen.getByRole('button', { name: 'Move reset 1 down' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/saved tiny.are/);

    const text = emitAreaFile((lastPut as { area: Parameters<typeof emitAreaFile>[0] }).area);
    expect(text.indexOf('O 0 102 0 100')).toBeLessThan(text.indexOf('G 0 102 1'));
    expect(text.indexOf('G 0 102 1')).toBeLessThan(text.indexOf('E 0 102 1 16'));
  });
});
