/**
 * apps/game-client/src/features/gmcp/gmcpRouter.test.ts
 */

const dispatchCalls: Array<{ name: string; payload: any }> = [];
const listenEventCalls: Array<{ name: string; handler: (payload: any) => void; options?: { key?: string } }> = [];

jest.mock('../event-emitter/event-dispatcher', () => ({
  DispatchEvent: jest.fn((name: string, payload: any) => {
    dispatchCalls.push({ name, payload });
  }),
  ListenEvent: jest.fn((name: string, handler: (payload: any) => void, options?: { key?: string }) => {
    listenEventCalls.push({ name, handler, options });
    return () => {};
  }),
}));

import { attachGmcpRouter, parseGmcpMessage, routeGmcpMessage } from './gmcpRouter';

describe('gmcpRouter', () => {
  beforeEach(() => {
    dispatchCalls.length = 0;
    listenEventCalls.length = 0;
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('parseGmcpMessage', () => {
    it('parses a well-formed char_data message', () => {
      const parsed = parseGmcpMessage('char_data {"hp":100,"max_hp":100}');
      expect(parsed).toEqual({ pkg: 'char_data', data: { hp: 100, max_hp: 100 } });
    });

    it('returns null for an unknown package name', () => {
      expect(parseGmcpMessage('login_data {"name":"Bob"}')).toBeNull();
    });

    it('returns null for malformed JSON without throwing', () => {
      expect(parseGmcpMessage('char_data {not json')).toBeNull();
    });

    it('returns null when the payload has no space (no JSON body)', () => {
      expect(parseGmcpMessage('char_data')).toBeNull();
    });

    it('returns null when the JSON parses to a non-object (e.g. a bare number)', () => {
      expect(parseGmcpMessage('tick 42')).toBeNull();
    });
  });

  describe('routeGmcpMessage', () => {
    it('dispatches char_data to game:char-data', () => {
      routeGmcpMessage('char_data {"hp":50,"max_hp":100}');
      expect(dispatchCalls).toEqual([{ name: 'game:char-data', payload: { hp: 50, max_hp: 100 } }]);
    });

    it('dispatches room_data to game:room-data', () => {
      routeGmcpMessage('room_data {"room":"Chamber of Rest","sector":"inside","exits":["S","W","D"]}');
      expect(dispatchCalls).toEqual([
        { name: 'game:room-data', payload: { room: 'Chamber of Rest', sector: 'inside', exits: ['S', 'W', 'D'] } },
      ]);
    });

    it('dispatches tick to game:tick', () => {
      routeGmcpMessage('tick {"time":"4:30pm"}');
      expect(dispatchCalls).toEqual([{ name: 'game:tick', payload: { time: '4:30pm' } }]);
    });

    it('dispatches affect_data to game:affects-trueup', () => {
      routeGmcpMessage('affect_data {"affects":[{"n":"sanctuary","d":8,"m":0,"lc":"none","t":0}]}');
      expect(dispatchCalls).toEqual([
        {
          name: 'game:affects-trueup',
          payload: { affects: [{ n: 'sanctuary', d: 8, m: 0, lc: 'none', t: 0 }] },
        },
      ]);
    });

    it('dispatches add_affect to game:affect-added, wrapped as {affect: ...}', () => {
      routeGmcpMessage('add_affect {"n":"sanctuary","d":8,"m":0,"lc":"none","t":0}');
      expect(dispatchCalls).toEqual([
        {
          name: 'game:affect-added',
          payload: { affect: { n: 'sanctuary', d: 8, m: 0, lc: 'none', t: 0 } },
        },
      ]);
    });

    it('dispatches remove_affect to game:affect-removed, bare', () => {
      routeGmcpMessage('remove_affect {"n":"sanctuary"}');
      expect(dispatchCalls).toEqual([{ name: 'game:affect-removed', payload: { n: 'sanctuary' } }]);
    });

    it('does not dispatch anything for malformed JSON', () => {
      routeGmcpMessage('char_data {not json');
      expect(dispatchCalls).toEqual([]);
    });

    it('does not dispatch anything for an unknown package', () => {
      routeGmcpMessage('some_unknown_pkg {"a":1}');
      expect(dispatchCalls).toEqual([]);
    });
  });

  describe('attachGmcpRouter', () => {
    it('registers a ListenEvent on game:remote-server:gmcp with a stable key', () => {
      attachGmcpRouter();

      expect(listenEventCalls).toHaveLength(1);
      expect(listenEventCalls[0].name).toBe('game:remote-server:gmcp');
      expect(listenEventCalls[0].options?.key).toBe('gmcpRouter::game:remote-server:gmcp');
    });

    it('routes through when the registered handler fires', () => {
      attachGmcpRouter();

      listenEventCalls[0].handler({ type: 'gmcp', receivedTimestamp: 'x', payload: 'tick {"time":"9:00am"}' });

      expect(dispatchCalls).toEqual([{ name: 'game:tick', payload: { time: '9:00am' } }]);
    });
  });
});
