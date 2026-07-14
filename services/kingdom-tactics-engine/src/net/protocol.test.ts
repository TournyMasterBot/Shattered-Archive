import {
  KT_PROTOCOL_VERSION,
  isKtClientMessage,
  parseKtClientMessage,
  isKtServerMessage,
  parseKtServerMessage,
} from './protocol.js';

describe('KT protocol', () => {
  it('pins the protocol version at 1', () => {
    expect(KT_PROTOCOL_VERSION).toBe(1);
  });

  it('round-trips a valid join message', () => {
    const msg = parseKtClientMessage(JSON.stringify({ type: 'join', matchId: 'm1', side: 0 }));
    expect(msg).toEqual({ type: 'join', matchId: 'm1', side: 0 });
  });

  it('round-trips a valid action message', () => {
    const action = { type: 'move', tokenId: 'a', to: { x: 1, y: 1 } };
    const msg = parseKtClientMessage(JSON.stringify({ type: 'action', matchId: 'm1', action }));
    expect(msg).toEqual({ type: 'action', matchId: 'm1', action });
  });

  it('round-trips a set-stance action message', () => {
    const action = { type: 'set-stance', tokenId: 'a', stance: 'offensive' };
    const msg = parseKtClientMessage(JSON.stringify({ type: 'action', matchId: 'm1', action }));
    expect(msg).toEqual({ type: 'action', matchId: 'm1', action });
  });

  it('accepts join without an explicit side', () => {
    expect(isKtClientMessage({ type: 'join', matchId: 'm1' })).toBe(true);
  });

  it('returns null for malformed JSON', () => {
    expect(parseKtClientMessage('{not json')).toBeNull();
  });

  it('rejects a missing/unknown type', () => {
    expect(isKtClientMessage({ matchId: 'm1' })).toBe(false);
    expect(isKtClientMessage({ type: 'nope', matchId: 'm1' })).toBe(false);
  });

  it('rejects an action message whose action is not an engine action', () => {
    expect(isKtClientMessage({ type: 'action', matchId: 'm1', action: { type: 'dance' } })).toBe(false);
    expect(isKtClientMessage({ type: 'action', matchId: 'm1' })).toBe(false);
  });

  it('rejects a join with a missing matchId', () => {
    expect(isKtClientMessage({ type: 'join' })).toBe(false);
  });

  // ── Server → client frames ──────────────────────────────────────────────
  const state = { activeSide: 0 };

  it('round-trips a valid joined message', () => {
    const frame = { type: 'joined', matchId: 'm1', side: 0, state, protocol: KT_PROTOCOL_VERSION };
    expect(parseKtServerMessage(JSON.stringify(frame))).toEqual(frame);
  });

  it('round-trips a valid snapshot message (with and without lastAction)', () => {
    const bare = { type: 'snapshot', matchId: 'm1', state };
    expect(parseKtServerMessage(JSON.stringify(bare))).toEqual(bare);
    const action = { type: 'move', tokenId: 'a', to: { x: 1, y: 1 } };
    const withAction = { type: 'snapshot', matchId: 'm1', state, lastAction: action };
    expect(parseKtServerMessage(JSON.stringify(withAction))).toEqual(withAction);
  });

  it('round-trips an error message (matchId optional)', () => {
    expect(isKtServerMessage({ type: 'error', message: 'nope' })).toBe(true);
    expect(isKtServerMessage({ type: 'error', matchId: 'm1', message: 'nope' })).toBe(true);
  });

  it('round-trips an over message with a seat winner and a draw', () => {
    expect(isKtServerMessage({ type: 'over', matchId: 'm1', state, winner: 1 })).toBe(true);
    expect(isKtServerMessage({ type: 'over', matchId: 'm1', state, winner: 'draw' })).toBe(true);
  });

  it('returns null for malformed server JSON', () => {
    expect(parseKtServerMessage('{not json')).toBeNull();
  });

  it('rejects a server frame with a missing/unknown type', () => {
    expect(isKtServerMessage({ matchId: 'm1', state })).toBe(false);
    expect(isKtServerMessage({ type: 'nope', matchId: 'm1', state })).toBe(false);
  });

  it('rejects server frames missing required fields', () => {
    expect(isKtServerMessage({ type: 'joined', matchId: 'm1', side: 0, state })).toBe(false); // no protocol
    expect(isKtServerMessage({ type: 'snapshot', matchId: 'm1' })).toBe(false); // no state
    expect(isKtServerMessage({ type: 'over', matchId: 'm1', state })).toBe(false); // no winner
    expect(isKtServerMessage({ type: 'over', matchId: 'm1', state, winner: 'nope' })).toBe(false); // bad winner
    expect(isKtServerMessage({ type: 'error' })).toBe(false); // no message
  });
});
