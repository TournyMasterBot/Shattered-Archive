import { render, screen, fireEvent } from '@testing-library/react';

import SkillsPage from './SkillsPage.js';

/**
 * Codegen sub-view on the Skills tab (Phase 14a): spec authoring, archetype
 * switching, live validation/preview, and the spec-manifest save + conflict flow.
 * The generated patch/skills.dat-shape preview come from merc-area functions called
 * directly client-side (generateSpellC/generateOverlayRow) — no network round trip.
 */
describe('CodegenView (Phase 14a)', () => {
  let lastPut: { specs: { name: string; funName: string }[]; baseHash?: string | null } | null = null;

  function mockFetch(overrides: { putStatus?: number; putBody?: unknown } = {}) {
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
      if (url.endsWith('/api/capabilities')) return json({ writeEnabled: true, mercAreaPath: '/mud/area' });
      if (url.endsWith('/api/skills') && (!init || !init.method || init.method === 'GET')) return json({ skills: [], source: 'stock' });
      if (url.endsWith('/api/groups') && (!init || !init.method || init.method === 'GET')) return json({ groups: [], source: 'stock' });
      if (url.endsWith('/api/codegen/spells') && (!init || !init.method || init.method === 'GET')) {
        return json({ specs: [], baseHash: null });
      }
      if (url.endsWith('/api/codegen/spells') && init?.method === 'PUT') {
        lastPut = JSON.parse(String(init.body)) as typeof lastPut;
        if (overrides.putStatus && overrides.putStatus >= 400) return json(overrides.putBody ?? { error: 'conflict' }, overrides.putStatus);
        return json(overrides.putBody ?? { saved: true, warnings: [], hash: 'H1' });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;
  }

  beforeEach(() => {
    lastPut = null;
  });

  async function openCodegen() {
    render(<SkillsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'New spell (codegen)' }));
    await screen.findByText(/Author a brand-new spell/);
  }

  it('adds a spec, defaults to the damage archetype, and shows a live 4-section patch preview', async () => {
    mockFetch();
    await openCodegen();

    fireEvent.click(screen.getByRole('button', { name: 'Add spec' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'test bolt' } });
    fireEvent.change(screen.getByLabelText('Fun name'), { target: { value: 'spell_test_bolt' } });

    expect(await screen.findByText(/--- magic.h/)).toBeTruthy();
    const pre = screen.getByText(/void spell_test_bolt/);
    expect(pre.textContent).toContain('--- const.c');
    expect(pre.textContent).toContain('dice(6 + level / 2, 8)');
  });

  it('switching archetype to buff swaps the fieldset and the guard-message fields', async () => {
    mockFetch();
    await openCodegen();
    fireEvent.click(screen.getByRole('button', { name: 'Add spec' }));

    fireEvent.change(screen.getByLabelText('Archetype'), { target: { value: 'buff' } });
    expect(screen.getByLabelText('Already-affected (self)')).toBeTruthy();
    expect(screen.queryByLabelText('Save type')).toBeNull();
  });

  it('flags a name collision with a stock skill and disables save', async () => {
    mockFetch();
    await openCodegen();
    fireEvent.click(screen.getByRole('button', { name: 'Add spec' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'armor' } });
    fireEvent.change(screen.getByLabelText('Fun name'), { target: { value: 'spell_test_bolt' } });

    expect(await screen.findByText(/collides with a stock skill/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save spec manifest' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('saves the spec manifest with baseHash and reflects the new hash', async () => {
    mockFetch();
    await openCodegen();
    fireEvent.click(screen.getByRole('button', { name: 'Add spec' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'test bolt' } });
    fireEvent.change(screen.getByLabelText('Fun name'), { target: { value: 'spell_test_bolt' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save spec manifest' }));
    expect(await screen.findByText('spec manifest saved')).toBeTruthy();
    expect(lastPut!.specs[0].name).toBe('test bolt');
    expect(lastPut!.baseHash).toBeNull();
  });

  it('shows the conflict panel on a 409 and retries unconditionally on save-anyway', async () => {
    mockFetch({ putStatus: 409, putBody: { error: 'codegen/spells.json changed on disk', currentHash: 'HX' } });
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      await openCodegen();
      fireEvent.click(screen.getByRole('button', { name: 'Add spec' }));
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'test bolt' } });
      fireEvent.change(screen.getByLabelText('Fun name'), { target: { value: 'spell_test_bolt' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save spec manifest' }));

      expect(await screen.findByRole('alert', { name: 'Save conflict' })).toBeTruthy();

      mockFetch({ putBody: { saved: true, warnings: [], hash: 'H2' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save anyway (overwrite theirs)' }));
      expect(await screen.findByText('spec manifest saved')).toBeTruthy();
      expect('baseHash' in lastPut!).toBe(false);
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it('removes a spec from the list', async () => {
    mockFetch();
    await openCodegen();
    fireEvent.click(screen.getByRole('button', { name: 'Add spec' }));
    expect(screen.getByText('Specs (1)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByText('Specs (0)')).toBeTruthy();
  });
});
