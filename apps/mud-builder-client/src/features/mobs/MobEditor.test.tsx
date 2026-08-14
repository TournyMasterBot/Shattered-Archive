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

  it('adds a mob at the next free vnum and deletes it while unreferenced', async () => {
    render(<MobsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Tiny/ }));

    // Range is 100-199 and only mob 101 exists → the new mob gets vnum 100.
    fireEvent.click(await screen.findByRole('button', { name: '+ Add mob' }));
    expect(await screen.findByRole('button', { name: /#100 a new mob/ })).toBeTruthy();
    expect((screen.getByLabelText('Short description') as HTMLInputElement).value).toBe('a new mob');

    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete mob #100' }));
    confirmSpy.mockRestore();
    expect(screen.queryByRole('button', { name: /#100 a new mob/ })).toBeNull();
  });

  it('attaches a shop and a spec_fun to a mob and emits the sections (Phase 5)', async () => {
    render(<MobsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Tiny/ }));
    fireEvent.click(await screen.findByRole('button', { name: /#101 the test guard/ }));

    fireEvent.click(screen.getByRole('button', { name: '+ Make shopkeeper' }));
    fireEvent.change(screen.getByLabelText('Profit buy %'), { target: { value: '150' } });
    fireEvent.change(screen.getByLabelText('Buy type 1'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Special function'), { target: { value: 'spec_guard' } });

    // The generated file (manual-edit pane shows the exact emit) gains both sections.
    fireEvent.click(screen.getByRole('button', { name: /Manual edit/ }));
    const ta = screen.getByLabelText('Raw area file text') as HTMLTextAreaElement;
    expect(ta.value).toContain('#SHOPS');
    expect(ta.value).toContain('101 5 0 0 0 0 150 100 0 23');
    expect(ta.value).toContain('M 101 spec_guard');
    fireEvent.click(screen.getByRole('button', { name: /Manual edit/ })); // close pane

    // Detach both again.
    fireEvent.click(screen.getByRole('button', { name: 'Remove shop' }));
    fireEvent.change(screen.getByLabelText('Special function'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: '+ Make shopkeeper' })).toBeTruthy();
  });

  it('manual edit shows the generated code and back-applies valid edits to the form', async () => {
    render(<MobsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Tiny/ }));
    fireEvent.click(await screen.findByRole('button', { name: /#101 the test guard/ }));

    fireEvent.click(screen.getByRole('button', { name: /Manual edit/ }));
    const ta = screen.getByLabelText('Raw area file text') as HTMLTextAreaElement;
    expect(ta.value).toContain('#MOBILES');
    expect(ta.value).toContain('the test guard~');

    // Valid raw edit → applied to the model → the form and list reflect it.
    fireEvent.change(ta, { target: { value: ta.value.replace(/the test guard/g, 'the manually renamed guard') } });
    fireEvent.click(screen.getByRole('button', { name: 'Parse & apply' }));
    expect(await screen.findByText(/parsed and applied/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /#101 the manually renamed guard/ }));
    expect((screen.getByLabelText('Short description') as HTMLInputElement).value).toBe('the manually renamed guard');
    expect(screen.getByText('MANUAL EDITS')).toBeTruthy();

    // Invalid raw text → rejected with a parse error, model untouched.
    fireEvent.click(screen.getByRole('button', { name: /Manual edit/ }));
    fireEvent.change(screen.getByLabelText('Raw area file text'), { target: { value: '#GARBAGE\nnot an area file' } });
    fireEvent.click(screen.getByRole('button', { name: 'Parse & apply' }));
    expect(await screen.findByText(/does not parse/)).toBeTruthy();
    // Close the pane (the list is hidden while it is open) and check the model kept the valid edit.
    fireEvent.click(screen.getByRole('button', { name: /Manual edit/ }));
    expect(screen.getByRole('button', { name: /#101 the manually renamed guard/ })).toBeTruthy();
  });
});
