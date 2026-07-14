import { render, screen, fireEvent } from '@testing-library/react';
import { emitAreaFile, type AreaFile, type MudObject } from '@shatteredarchive/merc-area';

import ObjectEditor from './ObjectEditor.js';
import ObjectsPage from './ObjectsPage.js';

const WEAPON: MudObject = {
  vnum: 201,
  name: 'sword test',
  shortDescr: 'a test sword',
  description: 'A test sword lies here.',
  material: 'steel',
  itemType: 'weapon',
  extraFlags: 0,
  wearFlags: 1 | 8192, // take | wield
  values: ['sword', 1, 6, 'slash', 0],
  level: 5,
  weight: 10,
  cost: 100,
  condition: 'P',
  affects: [],
  flagAffects: [],
  extraDescrs: [],
};

const CONTAINER: MudObject = {
  vnum: 202,
  name: 'chest test',
  shortDescr: 'a test chest',
  description: 'A test chest sits here.',
  material: 'wood',
  itemType: 'container',
  extraFlags: 0,
  wearFlags: 0,
  values: [100, 0, 0, 10, 100],
  level: 0,
  weight: 50,
  cost: 20,
  condition: 'G',
  affects: [],
  flagAffects: [],
  extraDescrs: [{ keyword: 'chest', description: 'It looks sturdy.' }],
};

const AREA: AreaFile = {
  sections: [
    { kind: 'area', fileName: 'tiny.are', name: 'Tiny', credits: '{ 1 50} Test  Tiny', minVnum: 100, maxVnum: 199 },
    { kind: 'objects', objects: [WEAPON, CONTAINER] },
  ],
};

describe('ObjectEditor', () => {
  it('edits weapon damage dice as numbers and weapon class as a word', () => {
    const onChange = jest.fn();
    render(<ObjectEditor obj={WEAPON} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Damage dice sides'), { target: { value: '8' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ values: ['sword', 1, 8, 'slash', 0] }),
    );

    fireEvent.change(screen.getByLabelText('Weapon class'), { target: { value: 'axe' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ values: ['axe', 1, 6, 'slash', 0] }),
    );
  });

  it("edits a container's capacity and relabels values when the item type changes", () => {
    const onChange = jest.fn();
    render(<ObjectEditor obj={CONTAINER} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Capacity (weight)'), { target: { value: '250' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ values: [250, 0, 0, 10, 100] }),
    );

    // weapon labels are not shown for a container
    expect(screen.queryByLabelText('Weapon class')).toBeNull();
  });

  it('adds and removes extra descriptions', () => {
    const onChange = jest.fn();
    render(<ObjectEditor obj={CONTAINER} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '+ Add extra description' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        extraDescrs: [
          { keyword: 'chest', description: 'It looks sturdy.' },
          { keyword: '', description: '' },
        ],
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ extraDescrs: [] }));
  });

  it('emits an edited weapon back into valid area text (model → file round trip)', () => {
    let edited: MudObject | null = null;
    render(<ObjectEditor obj={WEAPON} onChange={(o) => (edited = o)} />);
    fireEvent.change(screen.getByLabelText('Damage dice sides'), { target: { value: '12' } });

    const text = emitAreaFile({
      sections: [AREA.sections[0], { kind: 'objects', objects: [edited!] }],
    });
    expect(text).toContain('sword 1 12 slash 0');
  });
});

describe('ObjectsPage', () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) =>
        ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
      if (url.endsWith('/api/capabilities')) return json({ writeEnabled: false, mercAreaPath: '/tmp' });
      if (url.endsWith('/api/areas')) return json({ areas: [{ file: 'tiny.are', name: 'Tiny' }] });
      if (url.endsWith('/api/areas/tiny.are')) {
        const { parseAreaFile } = await import('@shatteredarchive/merc-area');
        return json({ file: 'tiny.are', area: parseAreaFile(emitAreaFile(AREA)) });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;
  });

  it('lists objects, edits one, and keeps writes gated off', async () => {
    render(<ObjectsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Tiny/ }));

    fireEvent.click(await screen.findByRole('button', { name: /#202 a test chest/ }));
    expect((screen.getByLabelText('Capacity (weight)') as HTMLInputElement).value).toBe('100');

    fireEvent.change(screen.getByLabelText('Capacity (weight)'), { target: { value: '300' } });
    expect((screen.getByLabelText('Capacity (weight)') as HTMLInputElement).value).toBe('300');

    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Preview' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
