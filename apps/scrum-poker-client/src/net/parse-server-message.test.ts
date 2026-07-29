import { parseScrumServerMessage } from './parse-server-message.js';

describe('parseScrumServerMessage', () => {
  it('accepts the frames the server actually sends', () => {
    expect(parseScrumServerMessage('{"type":"pong"}')).toEqual({ type: 'pong' });
    expect(
      parseScrumServerMessage(
        '{"type":"joined","roomId":"1","participantId":"p0","participantSecret":"s0","isHost":true,"protocolVersion":1}',
      ),
    ).toMatchObject({ type: 'joined', participantId: 'p0', participantSecret: 's0', isHost: true });
    expect(parseScrumServerMessage('{"type":"state","room":{"id":"1","participants":[]}}')).toMatchObject({
      type: 'state',
    });
    expect(parseScrumServerMessage('{"type":"error","code":"forbidden","message":"nope"}')).toMatchObject({
      code: 'forbidden',
    });
  });

  it('ignores unknown or malformed frames instead of throwing (version skew, not attack)', () => {
    expect(parseScrumServerMessage('nonsense')).toBeUndefined();
    expect(parseScrumServerMessage('{"type":"somethingNew","payload":1}')).toBeUndefined();
    expect(parseScrumServerMessage('{"type":"error","message":"no code"}')).toBeUndefined();
    expect(parseScrumServerMessage('{"type":"state","room":{"id":"1"}}')).toBeUndefined();
  });
});
