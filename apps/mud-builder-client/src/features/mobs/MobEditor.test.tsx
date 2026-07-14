import { render, screen, fireEvent } from '@testing-library/react';
import type { Mobile } from '@shatteredarchive/merc-area';

import MobEditor from './MobEditor.js';
import MobsPage from './MobsPage.js';

const MOB: Mobile = {
  vnum: 101,
  name: 'guard test',
  shortDescr: 'the test guard',
  longDescr: 'A test guard stands here.',
  description: 'He looks thoroughly bored.',
  race: 'human',
  act: 1, // ACT_IS_NPC only
  affectedBy: 0,
  alignment: 0,
  group: 0,
  level: 1,
  hitroll: 0,
  hit: { number: 1, type: 1, bonus: 1 },
  mana: { number: 1, type: 1, bonus: 1 },
  damage: { number: 1, type: 1, bonus: 1 },
  damType: 'slash',
  ac: [0, 0, 0, 0],
  offFlags: 0,
  immFlags: 0,
  resFlags: 0,
  vulnFlags: 0,
  startPos: 'stand',
  defaultPos: 'stand',
  sex: 'male',
  wealth: 0,
  form: 0,
  parts: 0,
  size: 'medium',
  material: 'unknown',
  flagRemovals: [],
};

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
1 0 0 0 1 0 1d1+1 1d1+1 1d1+1 slash 0 0 0 0 0 0 0 0 stand stand male 0 0 0 medium unknown
#0

#$
`;

describe('MobEditor', () => {
  it('round-trips stat edits through onChange', () => {
    const onChange = jest.fn();
    render(<MobEditor mob={MOB} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Level'), { target: { value: '13' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ level: 13 }));

    fireEvent.change(screen.getByLabelText('Short description'), { target: { value: 'the elite guard' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ shortDescr: 'the elite guard' }));

    fireEvent.change(screen.getByLabelText('Damage dice sides'), { target: { value: '6' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ damage: { number: 1, type: 6, bonus: 1 } }),
    );

    fireEvent.change(screen.getByLabelText('Sex'), { target: { value: 'female' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sex: 'female' }));
  });

  it('toggles flag bits without disturbing unlisted ones', () => {
    const onChange = jest.fn();
    // 1 << 30 is not in any table: it must survive edits untouched.
    render(<MobEditor mob={{ ...MOB, act: 1 | (1 << 30) }} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText('Sentinel'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ act: 1 | 2 | (1 << 30) }));
  });

  it('keeps verbatim words editable as free text (unknown race preserved)', () => {
    const onChange = jest.fn();
    render(<MobEditor mob={{ ...MOB, race: 'gelatinous cube' }} onChange={onChange} />);

    const race = screen.getByLabelText('Race') as HTMLInputElement;
    expect(race.value).toBe('gelatinous cube');
    fireEvent.change(race, { target: { value: 'ooze' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ race: 'ooze' }));
  });
});

describe('MobsPage', () => {
  beforeEach(() => {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) =>
        ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
      if (url.endsWith('/api/capabilities')) return json({ writeEnabled: false, mercAreaPath: '/tmp' });
      if (url.endsWith('/api/areas')) return json({ areas: [{ file: 'tiny.are', name: 'Tiny' }] });
      if (url.endsWith('/api/areas/tiny.are')) {
        const { parseAreaFile } = await import('@shatteredarchive/merc-area');
        return json({ file: 'tiny.are', area: parseAreaFile(AREA_TEXT) });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;
  });

  it('lists mobs, edits one, and keeps writes gated off', async () => {
    render(<MobsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Tiny/ }));

    fireEvent.click(await screen.findByRole('button', { name: /#101 the test guard/ }));
    expect((screen.getByLabelText('Level') as HTMLInputElement).value).toBe('1');

    fireEvent.change(screen.getByLabelText('Level'), { target: { value: '13' } });
    expect((screen.getByLabelText('Level') as HTMLInputElement).value).toBe('13');

    // writes gated off → Save/reload disabled, Preview/Download enabled
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Hot reload' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Preview' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Download' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
