import { parseAreaFile } from '@shatteredarchive/merc-area';
import { candidatesMap } from '../testing/neutralFixtures';
import { DEFAULT_FIRST, EXPORT_KEY, defaultFileName, defaultForm, loadForm, makeExport, requestBody, saveRange } from './builderExport';

const FORM = { fileName: 'north_farm.are', first: '31000', last: '31050' };

describe('the file name and the number range offered', () => {
  it.each([
    ['a-farm', 'a-farm.are'],
    ['area:gate road', 'area_gate_road.are'],
    ['  ', 'area.are'],
    ['é', 'area.are'],
    ['x'.repeat(80), `${'x'.repeat(40)}.are`],
  ])('turns the id %j into %j', (id, expected) => {
    expect(defaultFileName(id)).toBe(expected);
  });

  it('offers at least a hundred numbers, and twice the rooms for a big area', () => {
    expect(defaultForm('a', 4)).toEqual({ fileName: 'a.are', first: String(DEFAULT_FIRST), last: String(DEFAULT_FIRST + 99) });
    expect(defaultForm('a', 200).last).toBe(String(DEFAULT_FIRST + 400));
  });
});

describe('makeExport', () => {
  const audited = candidatesMap();

  it('exports the focused subzone and leaves the other subzone of the area out', () => {
    const result = makeExport(audited, { level: 'subzone', id: 's-fields' }, FORM);
    expect(result?.report.errors).toEqual([]);
    const text = result?.text as string;
    expect(result?.report).toMatchObject({ rooms: 3, level: 'subzone' });
    const rooms = parseAreaFile(text).sections.flatMap((s) => (s.kind === 'rooms' ? s.rooms : []));
    expect(rooms.map((r) => r.name)).toEqual(['The Gate', 'The Barn', 'The Well']);
    expect(rooms.map((r) => r.vnum)).toEqual([31000, 31001, 31002]);
  });

  it('exports the focused area, with the cellar of the second subzone', () => {
    expect(makeExport(audited, { level: 'area', id: 'a-farm' }, FORM)?.report.rooms).toBe(4);
  });

  it('is nothing at the other levels, or with no focus', () => {
    expect(makeExport(audited, { level: 'continent', id: 'c-green' }, FORM)).toBeNull();
    expect(makeExport(audited, { level: 'room', id: 'r-gate' }, FORM)).toBeNull();
    expect(makeExport(audited, null, FORM)).toBeNull();
  });

  it.each([
    ['', '31050'],
    ['abc', '31050'],
    ['31000', '31.5'],
    ['-5', '10'],
  ])('refuses the typed range %j to %j with a reason and no text', (first, last) => {
    const result = makeExport(audited, { level: 'area', id: 'a-farm' }, { ...FORM, first, last });
    expect(result?.text).toBeNull();
    expect(result?.report.errors[0]).toMatch(/whole numbers|range must satisfy/);
  });

  it('refuses a range too small for the rooms, saying by how much', () => {
    const result = makeExport(audited, { level: 'area', id: 'a-farm' }, { ...FORM, first: '10', last: '11' });
    expect(result?.text).toBeNull();
    expect(result?.report.errors[0]).toContain('2 numbers but 4 rooms need one (2 too few');
  });

  it('refuses a file name the Builder would not take, and trims spaces around a good one', () => {
    expect(makeExport(audited, { level: 'area', id: 'a-farm' }, { ...FORM, fileName: 'north farm.are' })?.report.errors[0]).toContain('not a file name');
    expect(makeExport(audited, { level: 'area', id: 'a-farm' }, { ...FORM, fileName: '  north_farm.are ' })?.text).not.toBeNull();
  });
});

describe('requestBody', () => {
  it('is the { file, text } body the Builder import takes, with the file name trimmed', () => {
    expect(JSON.parse(requestBody(' a.are ', '#AREA\n'))).toEqual({ file: 'a.are', text: '#AREA\n' });
  });
});

describe('remembering the number range', () => {
  const store = (initial: Record<string, string> = {}) => {
    const data = { ...initial };
    return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
  };

  it('saves the range and restores it with a file name that follows the area', () => {
    const s = store();
    saveRange(FORM, s);
    expect(JSON.parse(s.data[EXPORT_KEY])).toEqual({ first: '31000', last: '31050' });
    expect(loadForm('a-harbor', 1, s)).toEqual({ fileName: 'a-harbor.are', first: '31000', last: '31050' });
  });

  it.each([
    ['nothing saved', undefined],
    ['text that is not JSON', 'not json'],
    ['numbers that are not numbers', JSON.stringify({ first: 'x', last: 7 })],
  ])('falls back to the default for %s', (_name, raw) => {
    const s = store(raw === undefined ? {} : { [EXPORT_KEY]: raw });
    expect(loadForm('a-harbor', 1, s)).toEqual(defaultForm('a-harbor', 1));
  });

  it('judges each saved number on its own: one too long to be a room number is replaced, the other kept', () => {
    const s = store({ [EXPORT_KEY]: JSON.stringify({ first: '123456', last: '31050' }) });
    expect(loadForm('a', 1, s)).toMatchObject({ first: String(DEFAULT_FIRST), last: '31050' });
  });

  it('falls back when the browser will not read, and ignores a refused write', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(loadForm('a', 1, blocked)).toEqual(defaultForm('a', 1));
    expect(() => saveRange(FORM, blocked)).not.toThrow();
  });
});
