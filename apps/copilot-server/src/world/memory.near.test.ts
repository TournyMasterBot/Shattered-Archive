// The map window's "add this room from my history": walked rooms with a title, best match first, each with the titles its exits lead to.
import { MemoryWorldIo, viewEvents, type ViewSpec } from '../testing/worldFixtures';
import { parseRoomView, type ParsedRoomView } from './parseRoom';
import { WorldMemory, type ApplyContext } from './memory';

function seeded(seed = 5): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

async function open(): Promise<WorldMemory> {
  const { memory } = await WorldMemory.open({
    io: new MemoryWorldIo(),
    file: '/data/world/memory.json',
    baseline: { minVisits: 5, minDays: 3, minRatio: 0.8, demoteAfterMisses: 3 },
    random: seeded(),
    now: () => Date.parse('2026-11-07T12:00:00.000Z'),
  });
  return memory;
}

function view(spec: ViewSpec & { exits?: string[] }): ParsedRoomView {
  const { exits, ...rest } = spec;
  return parseRoomView(viewEvents(1, { ...rest, ...(exits ? { gmcpExits: exits } : {}) })) as ParsedRoomView;
}

const ctx = (day: string, arrivalDir?: 'N' | 'S'): ApplyContext => ({ day, session: `${day}:Agate-F`, ...(arrivalDir ? { arrivalDir } : {}) });

describe('WorldMemory.near', () => {
  it('finds a walked room by title (case and spacing ignored) with the titles its exits lead to', async () => {
    const memory = await open();
    await memory.apply(view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-01'));
    await memory.apply(view({ title: 'Study', exits: ['S'] }), ctx('2026-11-01', 'N'));
    const found = memory.near('  hall ', ['N']);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ title: 'Hall', sameExits: true });
    expect(found[0].exits).toMatchObject([{ dir: 'N', toTitle: 'Study', traversals: 1 }]);
  });

  it('puts the room with the same exits first, then the more visited one, and stops at the limit', async () => {
    const memory = await open();
    // three rooms with the title "Corridor" kept apart by their exits (nothing says they are one room)
    await memory.apply(view({ title: 'Corridor', exits: ['E', 'W'] }), ctx('2026-11-01'));
    memory.endSession();
    for (let i = 0; i < 3; i += 1) await memory.apply(view({ title: 'Corridor', exits: ['N', 'S'] }), ctx('2026-11-01'));
    memory.endSession();
    const found = memory.near('Corridor', ['E', 'W']);
    expect(found.map((r) => [r.sameExits, r.visits])).toEqual([
      [true, 1],
      [false, 3],
    ]);
    expect(memory.near('Corridor', ['E', 'W'], 1)).toHaveLength(1);
    expect(memory.near('Corridor', ['U']).map((r) => r.visits)).toEqual([3, 1]); // neither matches: the more visited first
  });

  it('answers nothing for a blank title or a title never walked, and ignores the case of the exit letters', async () => {
    const memory = await open();
    await memory.apply(view({ title: 'Hall', exits: ['N'] }), ctx('2026-11-01'));
    expect(memory.near('   ', [])).toEqual([]);
    expect(memory.near('Nowhere', [])).toEqual([]);
    expect(memory.near('Hall', ['n'])[0].sameExits).toBe(true);
    expect(memory.near('Hall', [])[0].sameExits).toBe(false);
  });
});
