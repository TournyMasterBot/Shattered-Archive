import { extractRoomId } from './room-id.js';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('extractRoomId', () => {
  it('accepts a bare room id', () => {
    expect(extractRoomId(UUID)).toBe(UUID);
    expect(extractRoomId(`  ${UUID}  `)).toBe(UUID);
  });

  it('pulls the id out of a full invite link — the most likely paste', () => {
    expect(extractRoomId(`https://scrum-poker.shatteredarchive.dev/room/${UUID}`)).toBe(UUID);
    expect(extractRoomId(`https://scrum-poker.shatteredarchive.dev/room/${UUID}/`)).toBe(UUID);
    expect(extractRoomId(`http://localhost:63080/room/${UUID}`)).toBe(UUID);
  });

  it('still handles a numeric id from before the UUID switch', () => {
    expect(extractRoomId('58154894')).toBe('58154894');
    expect(extractRoomId('https://scrum-poker.shatteredarchive.dev/room/58154894')).toBe('58154894');
  });

  it('returns empty for nothing usable, so the join button stays disabled', () => {
    expect(extractRoomId('')).toBe('');
    expect(extractRoomId('   ')).toBe('');
  });
});
