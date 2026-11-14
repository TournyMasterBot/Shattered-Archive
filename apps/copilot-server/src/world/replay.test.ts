import { inputLine, loginLine, MemoryWorldIo, viewJsonl } from '../testing/worldFixtures';
import { WorldMemory } from './memory';
import { connectTarget, DSL_TARGET, Replay } from './replay';

const T0 = Date.parse('2026-07-03T13:00:00Z');

const connectLine = (at: number, host: string, port: number): string =>
  JSON.stringify({ type: 'game:remote-server:connect', subtype: '', level: 'info', timestamp: new Date(at).toISOString(), payload: { host, port } });
const closedLine = (at: number): string =>
  JSON.stringify({ type: 'game:server:connection:client-closed', subtype: '', level: 'info', timestamp: new Date(at).toISOString(), payload: { code: 1001, reason: '' } });
const note = (at: number): string =>
  JSON.stringify({ type: '[game-server] Listening on port', subtype: '', level: 'info', timestamp: new Date(at).toISOString(), payload: { port: 31000 } });

async function setup(deps: { targets?: readonly string[] } = {}) {
  const io = new MemoryWorldIo();
  const { memory } = await WorldMemory.open({
    io,
    file: '/data/world.json',
    baseline: { minVisits: 5, minDays: 3, minRatio: 0.8, demoteAfterMisses: 3 },
    random: (() => {
      let n = 0;
      return () => ((n += 1) * 0.173) % 1;
    })(),
    deferWrites: true,
  });
  const replay = new Replay({ memory, ...deps });
  const feed = async (lines: string[]): Promise<void> => {
    for (const line of lines) await replay.line(line);
    await replay.drain();
  };
  return { memory, replay, feed, io };
}

const hall = (at: number): string[] => viewJsonl(at, { title: 'Hall', gmcpExits: ['N'], exitWords: ['north'] });
const study = (at: number): string[] => viewJsonl(at, { title: 'Study', gmcpExits: ['S'], exitWords: ['south'] });

describe('Replay: one world from one target', () => {
  it('builds rooms and a walked link from a session to the DSL, and counts the connection', async () => {
    const { memory, replay, feed } = await setup();
    await feed([
      note(T0),
      connectLine(T0 + 1, 'dsl-mud.org', 4000),
      loginLine(T0 + 2, 'Someone'),
      ...hall(T0 + 3),
      note(T0 + 3),
      inputLine(T0 + 4, 'north'),
      ...study(T0 + 5),
    ]);
    expect(memory.counts.rooms).toBe(2);
    expect(memory.stats).toMatchObject({ views: 2, newRooms: 2, traversals: 1 });
    expect(replay.counters.connections).toEqual({ [DSL_TARGET]: 1 });
    expect(replay.counters.fed).toBeGreaterThan(10);
    // the server's own notes are never fed, before the connection or inside it
    expect(replay.counters.skipped).toBe(2);
  });

  it('adds nothing from a session to another target, and counts it by name', async () => {
    const { memory, replay, feed } = await setup();
    await feed([connectLine(T0, 'simulacrum.shatteredarchive.dev', 4000), ...hall(T0 + 1), closedLine(T0 + 2)]);
    await feed([connectLine(T0 + 3, 'dsl-mud.org', 8000), ...study(T0 + 4), closedLine(T0 + 5)]);
    expect(memory.counts.rooms).toBe(0);
    expect(memory.stats.views).toBe(0);
    expect(replay.counters.connections).toEqual({ 'simulacrum.shatteredarchive.dev:4000': 1, 'dsl-mud.org:8000': 1 });
    expect(replay.counters.fed).toBe(0);
    expect(replay.counters.skipped).toBe(replay.counters.lines);
  });

  it('takes records only between a connect to the target and the close: later records belong to no connection', async () => {
    const { memory, feed } = await setup();
    await feed([connectLine(T0, 'dsl-mud.org', 4000), ...hall(T0 + 1), closedLine(T0 + 2), ...study(T0 + 3)]);
    expect(memory.counts.rooms).toBe(1);
    expect(memory.stats.views).toBe(1);
  });

  it('follows the connection across a change of target in one file: DSL, Simulacrum, DSL again', async () => {
    const { memory, replay, feed } = await setup();
    await feed([
      connectLine(T0, 'dsl-mud.org', 4000),
      ...hall(T0 + 1),
      connectLine(T0 + 2, 'host.docker.internal', 4000),
      ...study(T0 + 3),
      connectLine(T0 + 4, 'dsl-mud.org', 4000),
      ...hall(T0 + 5),
    ]);
    expect(memory.counts.rooms).toBe(1);
    expect(memory.stats.views).toBe(2);
    expect(replay.counters.connections).toEqual({ [DSL_TARGET]: 2, 'host.docker.internal:4000': 1 });
  });

  it('can be pointed at another target (the sandbox world) and then ignores the DSL', async () => {
    const { memory, feed } = await setup({ targets: ['simulacrum.shatteredarchive.dev:4000'] });
    await feed([
      connectLine(T0, 'dsl-mud.org', 4000),
      ...hall(T0 + 1),
      closedLine(T0 + 2),
      connectLine(T0 + 3, 'simulacrum.shatteredarchive.dev', 4000),
      ...study(T0 + 4),
    ]);
    expect(memory.counts.rooms).toBe(1);
    expect(memory.candidates().continents[0].areas[0].subzones[0].rooms[0].title).toBe('Study');
  });

  it('hands records to the pipeline in batches without losing or reordering any (many views, one drain at the end)', async () => {
    const { memory, replay, feed } = await setup();
    const lines = [connectLine(T0, 'dsl-mud.org', 4000)];
    for (let i = 0; i < 300; i += 1) lines.push(...(i % 2 === 0 ? hall(T0 + 10 + i * 10) : study(T0 + 10 + i * 10)));
    await feed(lines);
    expect(replay.counters.fed).toBe(lines.length);
    expect(memory.stats.views).toBe(300);
    expect(memory.counts.rooms).toBe(2);
  });

  it('labels what a room holds as unknown (a replay has no Archive names to ask)', async () => {
    const { memory, feed } = await setup();
    await feed([connectLine(T0, 'dsl-mud.org', 4000), ...viewJsonl(T0 + 1, { title: 'Hall', contents: ['     A brass bell.'], gmcpExits: ['N'], exitWords: ['north'] })]);
    const id = memory.candidates().continents[0].areas[0].subzones[0].rooms[0].id;
    expect(memory.room(id)!.transient).toMatchObject([{ label: 'A brass bell.', kind: 'unknown' }]);
  });

  it('drain with nothing waiting does nothing', async () => {
    const { replay, memory } = await setup();
    await replay.drain();
    expect(memory.stats.views).toBe(0);
  });
});

describe('connectTarget', () => {
  it('reads host and port', () => {
    expect(connectTarget(connectLine(T0, 'dsl-mud.org', 4000))).toBe('dsl-mud.org:4000');
  });
  it.each([
    ['not json', '{"type":"game:remote-server:connect", oops'],
    ['no payload', '{"type":"game:remote-server:connect"}'],
    ['a port that is not a number', '{"type":"game:remote-server:connect","payload":{"host":"dsl-mud.org","port":"4000"}}'],
    ['no host', '{"type":"game:remote-server:connect","payload":{"port":4000}}'],
  ])('is "unknown" for %s', (_name, raw) => {
    expect(connectTarget(raw)).toBe('unknown');
  });

  it('a connect that cannot be read is never taken for the target', async () => {
    const { memory, replay, feed } = await setup();
    await feed(['{"type":"game:remote-server:connect","payload":{"host":"dsl-mud.org"}}', ...hall(T0 + 1)]);
    expect(memory.counts.rooms).toBe(0);
    expect(replay.counters.connections).toEqual({ unknown: 1 });
  });
});
