import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { parseAreaFile, type ResetsSection } from '@shatteredarchive/merc-area';

import ObjectPlacementAccordion from './ObjectPlacementAccordion.js';
import { useResetsEditor } from '../resets/reset-editing.js';
import { useAreaWorkbench, type AreaWorkbench } from './workbench.js';

const AREA_TEXT = `#AREA
tiny.are~
Tiny~
{ 1 50} Test  Tiny~
100 199

#OBJECTS
#3100
a test pouch~
a test pouch~
A test pouch lies here.~
leather~
weapon A AN
sword 1 6 slash 0
5 10 100 P
#3200
a test coin~
a test coin~
A test coin lies here.~
gold~
weapon A AN
sword 1 6 slash 0
1 1 1 P
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
O 0 3100 0 100
P 0 3200 1 3100 1
S

#$
`;

function mockFetch() {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
    if (url.endsWith('/api/capabilities')) return json({ writeEnabled: true, tokenRequired: false });
    if (url.endsWith('/api/areas')) return json({ areas: [{ file: 'tiny.are', name: 'Tiny' }] });
    if (url.endsWith('/api/areas/tiny.are')) return json({ file: 'tiny.are', area: parseAreaFile(AREA_TEXT), baseHash: 'h1' });
    if (url.endsWith('/api/presence')) return json({ entries: [], ttlSeconds: 60 });
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
}

function Harness({ render: renderFn }: { render: (wb: AreaWorkbench) => React.ReactNode }) {
  const wb = useAreaWorkbench();
  useEffect(() => {
    void wb.openArea('tiny.are');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!wb.area) return <p>loading</p>;
  return <>{renderFn(wb)}</>;
}

/** Mirrors the real parent's mapping — a removed placement just stops rendering, no crash. */
function ObjectPlacementHarness({ wb }: { wb: AreaWorkbench }) {
  const editor = useResetsEditor(wb);
  const index = editor.resets.findIndex((r) => r.command === 'O');
  if (index === -1) return null;
  return <ObjectPlacementAccordion wb={wb} resets={editor} index={index} />;
}

describe('ObjectPlacementAccordion', () => {
  beforeEach(mockFetch);

  it('renders the object prototype fields, this placement\'s reset row, and its contents', async () => {
    render(<Harness render={(wb) => <ObjectPlacementHarness wb={wb} />} />);
    expect(await screen.findByText(/Object — #3100 a test pouch/)).toBeTruthy();
    expect((screen.getByLabelText('Short description') as HTMLInputElement).value).toBe('a test pouch');
    const contents = screen.getByText('Contents (1)').closest('details')!;
    expect(within(contents).getByLabelText('Reset 2 object')).toBeTruthy();
  });

  it('+ Add item inside inserts a new P row contiguous with the existing contents', async () => {
    render(
      <Harness
        render={(wb) => {
          const section = wb.area!.sections.find((s): s is ResetsSection => s.kind === 'resets')!;
          return (
            <>
              <ObjectPlacementHarness wb={wb} />
              <p data-testid="reset-count">{section.resets.length}</p>
            </>
          );
        }}
      />,
    );
    await screen.findByText('Contents (1)');
    fireEvent.click(screen.getByRole('button', { name: '+ Add item inside' }));
    await waitFor(() => expect(screen.getByText('Contents (2)')).toBeTruthy());
    expect(screen.getByTestId('reset-count').textContent).toBe('3');
  });

  it('Remove this placement removes the O row and its P contents together', async () => {
    window.confirm = jest.fn(() => true);
    render(
      <Harness
        render={(wb) => {
          const section = wb.area!.sections.find((s): s is ResetsSection => s.kind === 'resets')!;
          return (
            <>
              <ObjectPlacementHarness wb={wb} />
              <p data-testid="reset-count">{section.resets.length}</p>
            </>
          );
        }}
      />,
    );
    await screen.findByText(/Object — #3100/);
    expect(screen.getByTestId('reset-count').textContent).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: 'Remove this placement' }));
    await waitFor(() => expect(screen.getByTestId('reset-count').textContent).toBe('0'));
  });

  it('declining the confirm leaves the placement untouched', async () => {
    window.confirm = jest.fn(() => false);
    render(<Harness render={(wb) => <ObjectPlacementHarness wb={wb} />} />);
    await screen.findByText(/Object — #3100/);
    fireEvent.click(screen.getByRole('button', { name: 'Remove this placement' }));
    expect(screen.getByText(/Object — #3100/)).toBeTruthy();
  });
});
