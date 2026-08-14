import { render, screen, fireEvent } from '@testing-library/react';
import { stockGroupsFile } from '@shatteredarchive/merc-area';

import SkillsPage from './SkillsPage.js';

/**
 * Groups sub-view on the Skills tab (Phase 8): stock fallback rendering, the
 * -1 "available" toggle, cycle rejection disabling save, prefix-resolution
 * hints, and the PUT body + copyover note.
 */
describe('GroupsView (Phase 8)', () => {
  let lastPut: { groups: { name: string; ratings: number[]; members: string[] }[] } | null = null;

  beforeEach(() => {
    lastPut = null;
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown, status = 200) =>
        ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
      if (url.endsWith('/api/capabilities')) return json({ writeEnabled: true, mercAreaPath: '/mud/area' });
      if (url.endsWith('/api/skills') && (!init || !init.method || init.method === 'GET')) {
        return json({ skills: [], source: 'stock' });
      }
      if (url.endsWith('/api/groups') && (!init || !init.method || init.method === 'GET')) {
        return json({ groups: stockGroupsFile().groups, source: 'stock' });
      }
      if (url.endsWith('/api/groups') && init?.method === 'PUT') {
        lastPut = JSON.parse(String(init.body)) as typeof lastPut;
        return json({ saved: true, backupPath: null, warnings: [], note: 'groups.dat loads at boot only — run a copyover to apply' });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;
  });

  async function openGroups() {
    render(<SkillsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Groups' }));
    fireEvent.click(await screen.findByRole('button', { name: 'attack' }));
  }

  it('lists the stock groups, edits the attack cleric cost, and saves with the copyover note', async () => {
    await openGroups();

    // attack is {-1, 5, -1, 8}: mage unavailable, cleric costs 5
    expect((screen.getByLabelText('Mage available') as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByLabelText('Mage cost')).toBeNull();
    const cleric = screen.getByLabelText('Cleric cost') as HTMLInputElement;
    expect(cleric.value).toBe('5');
    fireEvent.change(cleric, { target: { value: '3' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save groups.dat' }));
    expect(await screen.findByText(/copyover/)).toBeTruthy();
    const attack = lastPut!.groups.find((g) => g.name === 'attack')!;
    expect(attack.ratings).toEqual([-1, 3, -1, 8]);
  });

  it('round-trips the -1 sentinel via the available toggle into the emitted text', async () => {
    await openGroups();

    fireEvent.click(screen.getByLabelText('Cleric available')); // 5 → -1
    fireEvent.click(screen.getByRole('button', { name: 'Manual edit' }));
    const ta = screen.getByLabelText('groups.dat text') as HTMLTextAreaElement;
    expect(ta.value.startsWith('V1\n')).toBe(true);
    expect(ta.value).toContain('attack~\n-1 -1 -1 8 7');
  });

  it('rejects a membership cycle and disables save; shows prefix-resolution hints', async () => {
    await openGroups();

    // stock illusion lists 'invis' which prefix-resolves to the skill "invisibility"
    fireEvent.click(screen.getByRole('button', { name: 'illusion' }));
    expect(screen.getByText(/skill: invisibility/)).toBeTruthy();

    // beguiling + 'mage default' closes a cycle (mage default lists beguiling)
    fireEvent.click(screen.getByRole('button', { name: 'beguiling' }));
    fireEvent.change(screen.getByLabelText('New member'), { target: { value: 'mage default' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
    expect((await screen.findAllByText(/membership cycle/)).length).toBe(2); // both beguiling AND mage default sit on the cycle
    expect((screen.getByRole('button', { name: 'Save groups.dat' }) as HTMLButtonElement).disabled).toBe(true);

    // removing it again re-enables save
    fireEvent.click(screen.getByRole('button', { name: 'Remove member mage default' }));
    expect((screen.getByRole('button', { name: 'Save groups.dat' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('adds a proven member and reflects it in the manual pane', async () => {
    await openGroups();

    fireEvent.change(screen.getByLabelText('New member'), { target: { value: 'sanctuary' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));
    expect(screen.getByText(/Members \(8\/15\)/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Manual edit' }));
    const ta = screen.getByLabelText('groups.dat text') as HTMLTextAreaElement;
    expect(ta.value).toContain('attack~\n-1 5 -1 8 8');
    expect(ta.value).toContain('sanctuary~');
  });
});

describe('Groups conflict safety (Phase 12 baseHash)', () => {
  let putResponses: { status: number; body: unknown }[];
  let putBodies: string[];

  beforeEach(() => {
    putResponses = [];
    putBodies = [];
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const json = (body: unknown, status = 200) =>
        ({ ok: status < 400, status, json: async () => body }) as unknown as Response;
      if (url.endsWith('/api/capabilities')) return json({ writeEnabled: true, mercAreaPath: '/mud/area' });
      if (url.endsWith('/api/skills') && (!init || !init.method || init.method === 'GET')) {
        return json({ skills: [], source: 'stock', baseHash: null });
      }
      if (url.endsWith('/api/groups') && (!init || !init.method || init.method === 'GET')) {
        return json({ groups: stockGroupsFile().groups, source: 'stock', baseHash: null });
      }
      if (url.endsWith('/api/groups') && init?.method === 'PUT') {
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

  it('409 shows the conflict panel; save-anyway retries without a baseHash', async () => {
    putResponses.push({ status: 409, body: { error: 'groups.dat changed on disk', currentHash: 'HX' } });
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      render(<SkillsPage />);
      fireEvent.click(await screen.findByRole('button', { name: 'Groups' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Save groups.dat' }));

      expect(await screen.findByRole('alert', { name: 'Save conflict' })).toBeTruthy();
      expect((JSON.parse(putBodies[0]) as { baseHash: unknown }).baseHash).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Save anyway (overwrite theirs)' }));
      expect(await screen.findByText(/groups\.dat saved/)).toBeTruthy();
      expect('baseHash' in (JSON.parse(putBodies[1]) as object)).toBe(false);
    } finally {
      confirmSpy.mockRestore();
    }
  });
});
