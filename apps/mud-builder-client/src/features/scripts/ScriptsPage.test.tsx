import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { parseAreaFile } from '@shatteredarchive/merc-area';

import ScriptsPage from './ScriptsPage.js';

const AREA_TEXT = `#AREA
tiny.are~
Tiny~
{ 1 50} Test  Tiny~
100 199

#MOBILES
#3000
a test mob~
the test mob~
A test mob stands here.
~
It looks ordinary.
~
human~
A 0 0 0 1 0 1d1+1 1d1+1 1d1+1 slash 0 0 0 0 0 0 0 0 stand stand male 0 0 0 medium unknown
#0

#ROOMS
#100
The Test Room~
A perfectly ordinary test room.
~
0 0 1
S
#0

#$
`;

const SECOND_AREA_TEXT = `#AREA
second.are~
Second~
{ 1 50} Test  Second~
200 299

#ROOMS
#200
Second Room~
Another area entirely.
~
0 0 1
S
#0

#$
`;

function mockFetch() {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
    if (url.endsWith('/api/capabilities')) return json({ writeEnabled: true, tokenRequired: false });
    if (url.endsWith('/api/areas')) return json({ areas: [{ file: 'tiny.are', name: 'Tiny' }, { file: 'second.are', name: 'Second' }] });
    if (url.endsWith('/api/areas/tiny.are')) return json({ file: 'tiny.are', area: parseAreaFile(AREA_TEXT), baseHash: 'h1' });
    if (url.endsWith('/api/areas/second.are')) return json({ file: 'second.are', area: parseAreaFile(SECOND_AREA_TEXT), baseHash: 'h2' });
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
}

async function openAreaAndAddScript() {
  render(<ScriptsPage />);
  fireEvent.click(await screen.findByRole('button', { name: /Tiny/ }));
  fireEvent.click(await screen.findByRole('button', { name: '+ Add mob script' }));
  await screen.findByLabelText('Script trigger');
}

describe('ScriptsPage delete confirmation', () => {
  beforeEach(mockFetch);

  it('adding a script shows a success toast', async () => {
    await openAreaAndAddScript();
    expect(screen.getByText(/added a script for mob/)).toBeTruthy();
  });

  it('deletes the script when the confirm is accepted', async () => {
    window.confirm = jest.fn(() => true);
    await openAreaAndAddScript();

    fireEvent.click(screen.getByRole('button', { name: 'Delete script' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Delete this mob script'));
    await waitFor(() => expect(screen.getByText('Scripts (0)')).toBeTruthy());
    expect(screen.getByText('script deleted')).toBeTruthy();
  });

  it('keeps the script when the confirm is declined', async () => {
    window.confirm = jest.fn(() => false);
    await openAreaAndAddScript();

    fireEvent.click(screen.getByRole('button', { name: 'Delete script' }));
    expect(screen.getByText('Scripts (1)')).toBeTruthy();
  });
});

describe('ScriptsPage dirty-guard on area switch', () => {
  beforeEach(mockFetch);

  it('prompts before discarding an unsaved add, and cancel keeps the current area open', async () => {
    await openAreaAndAddScript();

    window.confirm = jest.fn(() => false);
    fireEvent.click(screen.getByRole('button', { name: /Second$/ }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('unsaved changes'));
    expect(screen.getByText('Scripts (1)')).toBeTruthy();

    window.confirm = jest.fn(() => true);
    fireEvent.click(screen.getByRole('button', { name: /Second$/ }));
    await waitFor(() => expect(screen.getByText('Scripts (0)')).toBeTruthy());
  });
});
