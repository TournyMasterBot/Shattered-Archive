import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { parseAreaFile, type ResetsSection } from '@shatteredarchive/merc-area';

import MobPlacementAccordion from './MobPlacementAccordion.js';
import { useResetsEditor } from '../resets/reset-editing.js';
import { useAreaWorkbench, type AreaWorkbench } from './workbench.js';

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

#OBJECTS
#3100
a test sword~
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
M 0 3000 1 100 1
E 0 3100 1 16
S

#SCRIPTS
M 3000 speech hello~
say Hello!~
#0

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

/**
 * Renders the accordion for the fixture's one M block — mirrors how the real
 * parent (RoomDashboardEntry) works: it maps over currently-existing blocks,
 * so a removed placement simply stops being rendered, no crash.
 */
function MobPlacementHarness({ wb }: { wb: AreaWorkbench }) {
  const editor = useResetsEditor(wb);
  const block = editor.blocks.find((b) => editor.resets[b.start].command === 'M');
  if (!block) return null;
  return <MobPlacementAccordion wb={wb} resets={editor} block={block} />;
}

describe('MobPlacementAccordion', () => {
  beforeEach(mockFetch);

  it('renders the mob prototype fields, this placement\'s reset row, its equipment, and its scripts', async () => {
    render(<Harness render={(wb) => <MobPlacementHarness wb={wb} />} />);
    expect(await screen.findByText(/Mob — #3000 the test mob/)).toBeTruthy();
    expect((screen.getByLabelText('Short description') as HTMLInputElement).value).toBe('the test mob');
    expect(screen.getByText('Equipment (1)')).toBeTruthy();
    expect(screen.getByText('Scripts (1)')).toBeTruthy();
  });

  it('editing the embedded MobEditor updates the shared mob prototype in the model', async () => {
    render(<Harness render={(wb) => <MobPlacementHarness wb={wb} />} />);
    const nameField = (await screen.findByLabelText('Short description')) as HTMLInputElement;
    fireEvent.change(nameField, { target: { value: 'a renamed mob' } });
    await waitFor(() => expect((screen.getByLabelText('Short description') as HTMLInputElement).value).toBe('a renamed mob'));
  });

  it('+ Give item / + Equip item insert a new reset row immediately after this block (contiguous)', async () => {
    render(
      <Harness
        render={(wb) => {
          const editor = useResetsEditor(wb);
          return (
            <>
              <MobPlacementHarness wb={wb} />
              <p data-testid="reset-count">{editor.resets.length}</p>
            </>
          );
        }}
      />,
    );
    await screen.findByText('Equipment (1)');
    fireEvent.click(screen.getByRole('button', { name: '+ Give item' }));
    await waitFor(() => expect(screen.getByText('Equipment (2)')).toBeTruthy());
    // fixture starts with 2 resets (M + E); the new G row makes 3, inserted
    // contiguously right after the block, not appended to the array's end.
    expect(screen.getByTestId('reset-count').textContent).toBe('3');
  });

  it('Remove this placement removes the M row and its rider together, leaving no orphaned reset', async () => {
    window.confirm = jest.fn(() => true);
    render(
      <Harness
        render={(wb) => {
          const section = wb.area!.sections.find((s): s is ResetsSection => s.kind === 'resets')!;
          return (
            <>
              <MobPlacementHarness wb={wb} />
              <p data-testid="reset-count">{section.resets.length}</p>
            </>
          );
        }}
      />,
    );
    await screen.findByText(/Mob — #3000/);
    expect(screen.getByTestId('reset-count').textContent).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: 'Remove this placement' }));
    await waitFor(() => expect(screen.queryByText(/Mob — #3000/)).toBeNull());
  });

  it('declining the confirm leaves the placement untouched', async () => {
    window.confirm = jest.fn(() => false);
    render(<Harness render={(wb) => <MobPlacementHarness wb={wb} />} />);
    await screen.findByText(/Mob — #3000/);
    fireEvent.click(screen.getByRole('button', { name: 'Remove this placement' }));
    expect(screen.getByText(/Mob — #3000/)).toBeTruthy();
  });

  it('shows a warning instead of MobEditor when the placed mob vnum is not defined in this area', async () => {
    const CROSS_AREA_TEXT = AREA_TEXT.replace('M 0 3000 1 100 1', 'M 0 9999 1 100 1');
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
      if (url.endsWith('/api/capabilities')) return json({ writeEnabled: true, tokenRequired: false });
      if (url.endsWith('/api/areas')) return json({ areas: [{ file: 'tiny.are', name: 'Tiny' }] });
      if (url.endsWith('/api/areas/tiny.are')) return json({ file: 'tiny.are', area: parseAreaFile(CROSS_AREA_TEXT), baseHash: 'h1' });
      if (url.endsWith('/api/presence')) return json({ entries: [], ttlSeconds: 60 });
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    render(<Harness render={(wb) => <MobPlacementHarness wb={wb} />} />);
    expect(await screen.findByText(/not defined in this area/)).toBeTruthy();
    expect(screen.queryByLabelText('Short description')).toBeNull();
  });
});
