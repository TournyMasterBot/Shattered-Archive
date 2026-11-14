// The Copilot server's walked rooms as the map window's history source: answers only while the switch is on, and only what the server knows.
import type { CopilotApi } from './api';
import { createCopilotHistorySource } from './mapHistory';

const signal = new AbortController().signal;
const obs = { title: 'Hall', exits: ['N'] };

function apiWith(answer: Awaited<ReturnType<CopilotApi['nearRooms']>>): { api: CopilotApi; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const api = { nearRooms: async (...args: unknown[]) => (calls.push(args), answer) } as unknown as CopilotApi;
  return { api, calls };
}

describe('createCopilotHistorySource', () => {
  it('turns the server rooms into history rooms, keeping the neighbours whose title is known', async () => {
    const { api, calls } = apiWith({
      ok: true,
      value: [
        { title: 'Hall', sector: 'inside', visits: 4, sameExits: true, exits: [{ dir: 'N', toTitle: 'Study' }, { dir: 'E' }] },
        { title: 'Hall', visits: 1, sameExits: false, exits: [] },
      ],
    });
    const source = createCopilotHistorySource(api, () => true);
    expect(source.label).toBe('your Copilot history');
    expect(await source.find('sandbox', obs, signal)).toEqual([
      { source: 'copilot', title: 'Hall', sector: 'inside', exits: ['N', 'E'], neighbours: [{ dir: 'N', title: 'Study' }], visits: 4, sameExits: true },
      { source: 'copilot', title: 'Hall', exits: [], neighbours: [], visits: 1, sameExits: false },
    ]);
    expect(calls).toEqual([['sandbox', 'Hall', ['N'], signal]]);
  });

  it('asks the server nothing while the Copilot switch is off', async () => {
    const { api, calls } = apiWith({ ok: true, value: [] });
    expect(await createCopilotHistorySource(api, () => false).find('dsl', obs, signal)).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('knows nothing when the server cannot be reached', async () => {
    const { api } = apiWith({ ok: false, reason: 'offline' });
    expect(await createCopilotHistorySource(api, () => true).find('dsl', obs, signal)).toEqual([]);
  });
});
