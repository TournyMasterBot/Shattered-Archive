import { parseScrumClientMessage } from './protocol.js';

describe('parseScrumClientMessage', () => {
  it('parses a minimal join', () => {
    expect(parseScrumClientMessage('{"type":"join","roomId":"12345678","name":"Ada"}')).toEqual({
      type: 'join',
      roomId: '12345678',
      name: 'Ada',
    });
  });

  it('carries participantSecret and hostToken through a reconnect join', () => {
    expect(
      parseScrumClientMessage('{"type":"join","roomId":"1","name":"Ada","participantSecret":"s0","hostToken":"h"}'),
    ).toEqual({ type: 'join', roomId: '1', name: 'Ada', participantSecret: 's0', hostToken: 'h' });
  });

  it('rejects a join with a non-string field', () => {
    expect(parseScrumClientMessage('{"type":"join","roomId":1,"name":"Ada"}')).toBeUndefined();
    expect(parseScrumClientMessage('{"type":"join","roomId":"1","name":"Ada","participantSecret":7}')).toBeUndefined();
  });

  it('accepts a null vote but not a numeric one', () => {
    expect(parseScrumClientMessage('{"type":"vote","card":null}')).toEqual({ type: 'vote', card: null });
    expect(parseScrumClientMessage('{"type":"vote","card":5}')).toBeUndefined();
  });

  it('parses the no-payload commands', () => {
    for (const type of ['reveal', 'hide', 'resetEstimates', 'clearUsers', 'ping', 'leave']) {
      expect(parseScrumClientMessage(`{"type":"${type}"}`)).toEqual({ type });
    }
  });

  it('keeps only known settings keys and drops the rest', () => {
    const msg = parseScrumClientMessage('{"type":"updateSettings","settings":{"showAverage":false,"evil":"x"}}');
    expect(msg).toEqual({ type: 'updateSettings', settings: { showAverage: false } });
  });

  it('rejects a settings patch with a wrongly-typed value', () => {
    expect(parseScrumClientMessage('{"type":"updateSettings","settings":{"showAverage":"yes"}}')).toBeUndefined();
    expect(parseScrumClientMessage('{"type":"updateSettings","settings":{"deck":[1,2]}}')).toBeUndefined();
  });

  it('returns undefined for garbage rather than throwing', () => {
    expect(parseScrumClientMessage('not json')).toBeUndefined();
    expect(parseScrumClientMessage('[]')).toBeUndefined();
    expect(parseScrumClientMessage('{"type":"launchMissiles"}')).toBeUndefined();
    expect(parseScrumClientMessage('null')).toBeUndefined();
  });
});
