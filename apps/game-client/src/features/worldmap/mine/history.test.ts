// The history sources of the add-room flow: tried in the order registered, the first with an answer wins, a failing one counts as knowing nothing.
import { __resetHistorySourcesForTests, findHistory, registerHistorySource, type HistoryRoom, type HistorySource } from './history';

const signal = new AbortController().signal;
const obs = { title: 'Hall', exits: ['N'] };
const room = (source: string): HistoryRoom => ({ source, title: 'Hall', exits: ['N'], neighbours: [], visits: 1, sameExits: true });
const source = (label: string, answer: () => Promise<HistoryRoom[]>): HistorySource => ({ label, find: jest.fn(answer) });

beforeEach(() => __resetHistorySourcesForTests());

describe('findHistory', () => {
  it('answers null when no source is registered', async () => {
    expect(await findHistory('dsl', obs, signal)).toBeNull();
  });

  it('takes the first source that has rooms and does not ask the later ones', async () => {
    const first = source('first', async () => [room('first')]);
    const second = source('second', async () => [room('second')]);
    registerHistorySource(first);
    registerHistorySource(second);
    expect(await findHistory('dsl', obs, signal)).toEqual({ label: 'first', rooms: [room('first')] });
    expect(second.find).not.toHaveBeenCalled();
    expect(first.find).toHaveBeenCalledWith('dsl', obs, signal);
  });

  it('goes on to the next source when one knows nothing or fails', async () => {
    registerHistorySource(source('empty', async () => []));
    registerHistorySource(source('broken', async () => Promise.reject(new Error('down'))));
    registerHistorySource(source('last', async () => [room('last')]));
    expect((await findHistory('dsl', obs, signal))?.label).toBe('last');
  });

  it('answers null when every source has nothing', async () => {
    registerHistorySource(source('empty', async () => []));
    expect(await findHistory('dsl', obs, signal)).toBeNull();
  });

  it('stops asking once the request was cancelled', async () => {
    const controller = new AbortController();
    const first = source('first', async () => {
      controller.abort();
      return [];
    });
    const second = source('second', async () => [room('second')]);
    registerHistorySource(first);
    registerHistorySource(second);
    expect(await findHistory('dsl', obs, controller.signal)).toBeNull();
    expect(second.find).not.toHaveBeenCalled();
  });

  it('forgets a source that was removed, and removing it twice does nothing', async () => {
    const off = registerHistorySource(source('one', async () => [room('one')]));
    off();
    off();
    expect(await findHistory('dsl', obs, signal)).toBeNull();
  });
});

describe('fallback sources', () => {
  it('are asked after every other source, whenever they were added', async () => {
    const asked: string[] = [];
    registerHistorySource({ label: 'trail', find: async () => (asked.push('trail'), [room('trail')]) }, { fallback: true });
    registerHistorySource({ label: 'copilot', find: async () => (asked.push('copilot'), []) });
    expect((await findHistory('dsl', obs, signal))?.label).toBe('trail');
    expect(asked).toEqual(['copilot', 'trail']);
  });

  it('are not asked when an ordinary source answers, and are forgotten when removed', async () => {
    const trail = source('trail', async () => [room('trail')]);
    const off = registerHistorySource(trail, { fallback: true });
    registerHistorySource(source('copilot', async () => [room('copilot')]));
    expect((await findHistory('dsl', obs, signal))?.label).toBe('copilot');
    expect(trail.find).not.toHaveBeenCalled();
    off();
    __resetHistorySourcesForTests();
    expect(await findHistory('dsl', obs, signal)).toBeNull();
  });
});
