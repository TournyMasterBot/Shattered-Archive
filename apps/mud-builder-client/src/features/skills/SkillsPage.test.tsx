import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { stockSkillsFile } from '@shatteredarchive/merc-area';

import SkillsPage from './SkillsPage.js';

/**
 * Skills tab (Phase 7): stock fallback rendering, form edits reflected in the
 * emitted skills.dat (manual pane), the unproven-pair error path, and the
 * msg_obj null checkbox.
 */
describe('SkillsPage (Phase 7)', () => {
  let lastPut: { skills: { name: string; minMana: number }[] } | null = null;

  beforeEach(() => {
    lastPut = null;
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown, status = 200) =>
        ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
      if (url.endsWith('/api/capabilities')) return json({ writeEnabled: true, mercAreaPath: '/mud/area' });
      if (url.endsWith('/api/skills') && (!init || !init.method || init.method === 'GET')) {
        return json({ skills: stockSkillsFile().skills, source: 'stock' });
      }
      if (url.endsWith('/api/skills') && init?.method === 'PUT') {
        lastPut = JSON.parse(String(init.body)) as typeof lastPut;
        return json({ saved: true, backupPath: null, warnings: [], note: 'skills.dat loads at boot only — run a copyover to apply' });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;
  });

  it('lists the stock table, edits armor mana, and saves with the copyover note', async () => {
    render(<SkillsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'armor' }));

    const mana = screen.getByLabelText('Min mana') as HTMLInputElement;
    expect(mana.value).toBe('5');
    fireEvent.change(mana, { target: { value: '42' } });

    // compiled-in metadata surfaced read-only
    expect(screen.getByText(/slot 1/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save skills.dat' }));
    expect(await screen.findByText(/copyover/)).toBeTruthy();
    expect(lastPut!.skills.find((s) => s.name === 'armor')!.minMana).toBe(42);
  });

  it('shows the emitted file in the manual pane and applies manual edits back to the forms', async () => {
    render(<SkillsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'armor' }));
    const mana = screen.getByLabelText('Min mana') as HTMLInputElement;
    fireEvent.change(mana, { target: { value: '33' } });

    fireEvent.click(screen.getByRole('button', { name: 'Manual edit' }));
    const ta = screen.getByLabelText('skills.dat text') as HTMLTextAreaElement;
    expect(ta.value.startsWith('V1\n')).toBe(true);
    expect(ta.value).toContain('spell_armor 2 8 7 2 10 5 1 1 2 2 33 12');

    fireEvent.change(ta, { target: { value: ta.value.replace('1 1 2 2 33 12', '1 1 2 2 77 12') } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply to forms' }));
    fireEvent.click(await screen.findByRole('button', { name: 'armor' }));
    expect((screen.getByLabelText('Min mana') as HTMLInputElement).value).toBe('77');
  });

  it('flags an unproven (spellFun, target) pair and disables save', async () => {
    render(<SkillsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'armor' }));

    fireEvent.change(screen.getByLabelText('Spell function'), { target: { value: 'spell_acid_blast' } });
    expect(await screen.findByText(/not a combination the stock table uses/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save skills.dat' }) as HTMLButtonElement).disabled).toBe(true);

    // a proven pair only warns
    fireEvent.change(screen.getByLabelText('Spell function'), { target: { value: 'spell_shield' } });
    expect(await screen.findByText(/changed from stock spell_armor to spell_shield/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save skills.dat' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('maps the msg_obj null checkbox to unset and back', async () => {
    render(<SkillsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'acid blast' }));

    // stock acid blast has msg_obj NULL → checkbox checked, no text field
    const unset = screen.getByLabelText('Object wear-off unset') as HTMLInputElement;
    expect(unset.checked).toBe(true);
    expect(screen.queryByLabelText('Object wear-off message')).toBeNull();

    fireEvent.click(unset);
    const field = screen.getByLabelText('Object wear-off message') as HTMLInputElement;
    expect(field.value).toBe('');
    fireEvent.change(field, { target: { value: '$p stops sizzling.' } });

    fireEvent.click(screen.getByRole('button', { name: 'Manual edit' }));
    expect((screen.getByLabelText('skills.dat text') as HTMLTextAreaElement).value).toContain('$p stops sizzling.~');
  });
});

describe('SkillsPage conflict safety (Phase 12 baseHash)', () => {
  let putResponses: { status: number; body: unknown }[];
  let putBodies: string[];
  let getCount: number;

  beforeEach(() => {
    putResponses = [];
    putBodies = [];
    getCount = 0;
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown, status = 200) =>
        ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
      if (url.endsWith('/api/capabilities')) return json({ writeEnabled: true, mercAreaPath: '/mud/area' });
      if (url.endsWith('/api/skills') && (!init || !init.method || init.method === 'GET')) {
        getCount += 1;
        return json({ skills: stockSkillsFile().skills, source: 'stock', baseHash: null });
      }
      if (url.endsWith('/api/skills') && init?.method === 'PUT') {
        putBodies.push(String(init.body));
        const next = putResponses.shift() ?? {
          status: 200,
          body: { saved: true, backupPath: null, warnings: [], note: 'run a copyover to apply', hash: 'H-NEW' },
        };
        return json(next.body, next.status);
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;
  });

  it('sends the held baseHash, shows the conflict panel on 409, save-anyway retries unconditionally', async () => {
    putResponses.push({ status: 409, body: { error: 'skills.dat changed on disk', currentHash: 'HX' } });
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      render(<SkillsPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Save skills.dat' }));

      expect(await screen.findByRole('alert', { name: 'Save conflict' })).toBeTruthy();
      // loaded as stock → the conditional save carried baseHash null
      expect((JSON.parse(putBodies[0]) as { baseHash: unknown }).baseHash).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Save anyway (overwrite theirs)' }));
      expect(await screen.findByText(/skills\.dat saved/)).toBeTruthy();
      // the forced retry is a legacy save: no baseHash in the body at all
      expect('baseHash' in (JSON.parse(putBodies[1]) as object)).toBe(false);
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it('reload-from-disk refetches and dismisses the conflict panel', async () => {
    putResponses.push({ status: 409, body: { error: 'conflict', currentHash: 'HX' } });
    render(<SkillsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save skills.dat' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reload from disk (discard mine)' }));

    await waitFor(() => expect(screen.queryByRole('alert', { name: 'Save conflict' })).toBeNull());
    expect(getCount).toBe(2);
  });
});
