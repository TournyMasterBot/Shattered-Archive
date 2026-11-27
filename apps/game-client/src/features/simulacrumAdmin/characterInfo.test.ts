import { DispatchEvent } from '../event-emitter/event-dispatcher';
import { characterInfoFromLogin, createCharacterInfo, type CharacterInfoStore } from './characterInfo';
import { createGmcpCapture, type GmcpCapture } from './gmcpCapture';

const gmcp = (payload: string): void => DispatchEvent('game:remote-server:gmcp', { type: 'gmcp', payload });
const login = (extra: Record<string, unknown> = {}): string =>
  `login_data ${JSON.stringify({ name: '<character>', is_clan: false, is_kingdom: false, level: 60, time: '3:30pm', ...extra })}`;

describe('characterInfoFromLogin', () => {
  it('takes the level, the clan flag and the game clock', () => {
    expect(characterInfoFromLogin({ name: 'x', is_clan: true, level: 51, time: '9:00pm' })).toEqual({ level: 51, inClan: true, gameTime: '9:00pm' });
  });

  it('treats a missing clan flag as not in a clan, and a missing time as unknown', () => {
    expect(characterInfoFromLogin({ level: 7 })).toEqual({ level: 7, inClan: false });
  });

  it('never carries the name', () => {
    expect(JSON.stringify(characterInfoFromLogin({ name: 'secret-name', level: 7 }))).not.toContain('secret-name');
  });

  it('refuses anything without a usable integer level', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}, { level: '60' }, { level: 1.5 }, { level: -1 }, { level: 5000 }, { level: null }]) {
      expect(characterInfoFromLogin(bad)).toBeUndefined();
    }
  });
});

describe('createCharacterInfo', () => {
  let capture: GmcpCapture;
  let store: CharacterInfoStore;
  beforeEach(() => {
    capture = createGmcpCapture({ isActive: () => true });
    store = createCharacterInfo(capture);
  });
  afterEach(() => {
    store.dispose();
    capture.dispose();
  });

  it('starts empty', () => {
    expect(store.getState()).toEqual({ inClan: false });
  });

  it('learns the level from a login_data message and tells subscribers', () => {
    const changed = jest.fn();
    store.subscribe(changed);
    gmcp(login({ level: 60, is_clan: true }));
    expect(store.getState()).toEqual({ level: 60, inClan: true, gameTime: '3:30pm' });
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('ignores every other package, and a login_data it cannot use keeps the earlier info', () => {
    gmcp(login({ level: 55 }));
    gmcp('char_data {"level":99}');
    gmcp('login_data {not json');
    gmcp('login_data {"level":"high"}');
    expect(store.getState().level).toBe(55);
  });

  it('a later login replaces the earlier one (a second character, a reconnect)', () => {
    gmcp(login({ level: 55 }));
    gmcp(login({ level: 60 }));
    expect(store.getState().level).toBe(60);
  });

  it('still learns the level while the GMCP list is paused', () => {
    capture.pause();
    gmcp(login({ level: 52 }));
    expect(store.getState().level).toBe(52);
    expect(capture.getEntries()).toEqual([]);
  });

  it('clear forgets it, notifies once, and is quiet when there is nothing to forget', () => {
    const changed = jest.fn();
    store.subscribe(changed);
    store.clear();
    expect(changed).not.toHaveBeenCalled();
    gmcp(login());
    changed.mockClear();
    store.clear();
    expect(store.getState()).toEqual({ inClan: false });
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('keeps the same state object until something changes', () => {
    const before = store.getState();
    expect(store.getState()).toBe(before);
    gmcp(login());
    expect(store.getState()).not.toBe(before);
  });

  it('after dispose it no longer follows the capture, and subscribers are not called', () => {
    const changed = jest.fn();
    store.subscribe(changed);
    store.dispose();
    gmcp(login());
    expect(store.getState().level).toBeUndefined();
    expect(changed).not.toHaveBeenCalled();
  });

  it('subscribers can unsubscribe', () => {
    const changed = jest.fn();
    const stop = store.subscribe(changed);
    stop();
    gmcp(login());
    expect(changed).not.toHaveBeenCalled();
  });
});
