import { fireEvent, render, screen, within } from '@testing-library/react';
import { parseAreaFile } from '@shatteredarchive/merc-area';
import { candidatesMap } from '../../testing/neutralFixtures';
import { EXPORT_KEY } from '../builderExport';
import { NeutralProvider } from '../state';
import { initialState, neutralReducer, type NeutralAction, type NeutralState } from '../store';
import ExportPanel from './ExportPanel';

/** The export panel inside the provider, on the audited map. */

const start = (...actions: NeutralAction[]): NeutralState =>
  [{ type: 'open-audited', map: candidatesMap() } as NeutralAction, ...actions].reduce(neutralReducer, initialState());

function show(state: NeutralState) {
  render(
    <NeutralProvider initial={state}>
      <ExportPanel />
    </NeutralProvider>,
  );
}
const read = (b: Blob): Promise<string> =>
  new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsText(b);
  });
const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const make = () => fireEvent.click(screen.getByRole('button', { name: 'Make the Builder file' }));

beforeEach(() => {
  localStorage.clear();
});

describe('where the panel appears', () => {
  it('asks for a zoom to an area or a subzone at the continent and room levels', () => {
    show(start({ type: 'focus', focus: { level: 'continent', id: 'c-green' } }));
    expect(screen.getByText(/Zoom to an area or a subzone/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Make the Builder file' })).toBeNull();
  });

  it('is not there while candidates are shown: only the audited map is exported', () => {
    show(start({ type: 'open-candidates', map: candidatesMap(), name: 'azah.json' }, { type: 'view', view: 'candidates' } as NeutralAction));
    expect(screen.queryByRole('region', { name: 'Export to the Builder' })).toBeNull();
  });

  it('offers the file name of the focused area and a number range', () => {
    show(start({ type: 'focus', focus: { level: 'area', id: 'a-farm' } }));
    expect(field('File name').value).toBe('a-farm.are');
    expect(field('First room number').value).toBe('30000');
    expect(field('Last room number').value).toBe('30099');
    expect(screen.getByText('North Farm').tagName).toBe('STRONG');
  });
});

describe('making the file', () => {
  const blobs: Blob[] = [];
  const names: string[] = [];
  beforeEach(() => {
    blobs.length = 0;
    names.length = 0;
    Object.assign(URL, {
      createObjectURL: jest.fn((b: Blob) => {
        blobs.push(b);
        return 'blob:test';
      }),
      revokeObjectURL: jest.fn(),
    });
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
  });

  it('reports the rooms, the numbers, and what the file leaves out, and downloads the text and the request', async () => {
    show(start({ type: 'focus', focus: { level: 'subzone', id: 's-fields' } }));
    fireEvent.change(field('First room number'), { target: { value: '31000' } });
    fireEvent.change(field('Last room number'), { target: { value: '31020' } });
    make();
    const result = screen.getByRole('status');
    expect(within(result).getByText(/numbers 31000 to 31020/).textContent).toContain('3 rooms and 2 exits');
    // The Gate had room number 100, outside the range
    expect(result.textContent).toContain('1 had a number that did not fit and got a new one');
    expect(result.textContent).toContain('3 rooms with a position on the map grid');
    expect(result.textContent).toContain('1 exits whose target is not known (left out)');
    expect(result.textContent).toContain('a separate step');
    expect(localStorage.getItem(EXPORT_KEY)).toBe(JSON.stringify({ first: '31000', last: '31020' }));

    fireEvent.click(screen.getByRole('button', { name: 'Download the .are file' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download as an import request' }));
    expect(names).toEqual(['s-fields.are', 's-fields.are.request.json']);
    expect(blobs.map((b) => b.type)).toEqual(['text/plain', 'application/json']);
    const text = await read(blobs[0]);
    expect(parseAreaFile(text).sections[0]).toMatchObject({ kind: 'area', fileName: 's-fields.are', minVnum: 31000, maxVnum: 31020 });
    expect(JSON.parse(await read(blobs[1]))).toEqual({ file: 's-fields.are', text });
  });

  it('shows what stops the export and offers no download', () => {
    show(start({ type: 'focus', focus: { level: 'area', id: 'a-farm' } }));
    fireEvent.change(field('Last room number'), { target: { value: '30001' } });
    make();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('2 numbers but 4 rooms need one');
    expect(screen.queryByRole('button', { name: 'Download the .are file' })).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows a number that is not a number, and a file name the Builder would not take', () => {
    show(start({ type: 'focus', focus: { level: 'area', id: 'a-farm' } }));
    fireEvent.change(field('First room number'), { target: { value: 'abc' } });
    make();
    expect(screen.getByRole('alert').textContent).toContain('whole numbers');
    fireEvent.change(field('First room number'), { target: { value: '30000' } });
    fireEvent.change(field('File name'), { target: { value: 'north farm' } });
    make();
    expect(screen.getByRole('alert').textContent).toContain('not a file name the Builder accepts');
  });

  it('says nothing is left out when the export is complete, and names exits that go to rooms outside the export', () => {
    const audited = candidatesMap();
    const rooms = audited.continents[0].areas.flatMap((a) => a.subzones.flatMap((s) => s.rooms));
    for (const r of rooms) {
      delete r.coords;
      r.sources = [];
      delete r.baseline;
      delete r.history;
      r.description = 'A place.';
      r.sector = 'city';
    }
    audited.links = audited.links.filter((l) => l.state === 'confirmed' || l.id === 'l4');
    rooms.find((r) => r.id === 'r-quay')!.vnum = 9000;
    rooms.find((r) => r.id === 'r-well')!.exits = { E: 'l4' };
    rooms.find((r) => r.id === 'r-gate')!.exits = { E: 'l1' };
    rooms.find((r) => r.id === 'r-barn')!.exits = { W: 'l2' };
    const state = [
      { type: 'open-audited', map: audited } as NeutralAction,
      { type: 'focus', focus: { level: 'subzone', id: 's-fields' } } as NeutralAction,
    ].reduce(neutralReducer, initialState());
    show(state);
    make();
    const result = screen.getByRole('status');
    expect(result.textContent).toContain('1 exits lead to rooms outside this export');
    expect(within(result).getByText('Nothing.')).toBeTruthy();
  });

  it('starts a new form when the focus moves to another area, so the file name follows', () => {
    const view = (focusId: string) => (
      <NeutralProvider initial={start({ type: 'focus', focus: { level: 'area', id: focusId } })}>
        <ExportPanel />
      </NeutralProvider>
    );
    const { unmount } = render(view('a-farm'));
    expect(field('File name').value).toBe('a-farm.are');
    unmount();
    render(view('a-harbor'));
    expect(field('File name').value).toBe('a-harbor.are');
  });
});
