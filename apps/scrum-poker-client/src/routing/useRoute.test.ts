import { parseRoute, roomPath } from './useRoute.js';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('parseRoute', () => {
  it('recognizes a UUID room path, with or without a trailing slash', () => {
    expect(parseRoute(`/room/${UUID}`)).toEqual({ name: 'room', roomId: UUID });
    expect(parseRoute(`/room/${UUID}/`)).toEqual({ name: 'room', roomId: UUID });
  });

  it('still recognizes numeric ids from before the UUID switch, so old links keep working', () => {
    expect(parseRoute('/room/58154894')).toEqual({ name: 'room', roomId: '58154894' });
  });

  it('falls back to the landing page for anything else', () => {
    expect(parseRoute('/')).toEqual({ name: 'landing' });
    expect(parseRoute('/room')).toEqual({ name: 'landing' });
    expect(parseRoute('/room/a')).toEqual({ name: 'landing' });
    expect(parseRoute(`/room/${UUID}/extra`)).toEqual({ name: 'landing' });
    expect(parseRoute('/room/has spaces')).toEqual({ name: 'landing' });
  });

  it('round-trips through roomPath', () => {
    expect(parseRoute(roomPath(UUID))).toEqual({ name: 'room', roomId: UUID });
  });
});
