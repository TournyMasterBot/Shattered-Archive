import { toAsciiArea } from './ascii';
import { doc, exit, room, sampleDoc } from '../testing/fixtures';

describe('toAsciiArea', () => {
  it('draws a floor: labels cut to three characters, a title, and connectors along each exit', () => {
    const text = toAsciiArea(sampleDoc('Test Area', ['Alpha', 'Beta', 'Gamma', 'Up']), 'a1', 0);
    expect(text).toBe(['Test Area (vz=0)', '', ' Alp-Bet', '  | / |', ' Gam'].join('\n'));
  });

  it('draws only the rooms of the floor asked for', () => {
    expect(toAsciiArea(sampleDoc(), 'a1', 1)).toBe(['Test Area (vz=1)', '', ' Up'].join('\n'));
  });

  it('draws nothing for an area or a floor with no rooms', () => {
    expect(toAsciiArea(sampleDoc(), 'nope', 0)).toBe('');
    expect(toAsciiArea(sampleDoc(), 'a1', 5)).toBe('');
    expect(toAsciiArea(doc([]), 'a1', 0)).toBe('');
  });

  it('uses the vnum when a room has no label, and pads a short label', () => {
    const text = toAsciiArea(doc([room('x1', 0, 0, 0, {}), room('y', 2, 0, 0, {}, 'Hi')]), 'a1', 0);
    // the vnum 'x1' is padded to three characters; a line loses its trailing blanks
    expect(text.split('\n')[2]).toBe(' x1      Hi');
  });

  it("centres on the area's primary room when it has one, which moves nothing in the picture (only the origin)", () => {
    const d = sampleDoc();
    d.meta.catalog!.areas.a1.primaryVnum = 'B';
    expect(toAsciiArea(d, 'a1', 0)).toBe(toAsciiArea(sampleDoc(), 'a1', 0));
  });

  it('works with negative coordinates', () => {
    const d = doc([room('A', -3, -2, 0, { E: exit('B') }, 'Aaa'), room('B', -2, -2, 0, { W: exit('A') }, 'Bbb')]);
    expect(toAsciiArea(d, 'a1', 0)).toBe(['Test Area (vz=0)', '', ' Aaa-Bbb'].join('\n'));
  });

  it('draws diagonals with slashes', () => {
    const d = doc([room('A', 0, 0, 0, { SE: exit('B') }, 'Aaa'), room('B', 1, 1, 0, { NW: exit('A') }, 'Bbb')]);
    const lines = toAsciiArea(d, 'a1', 0).split('\n');
    expect(lines.slice(2).join('\n')).toContain('\\');
    const up = doc([room('A', 0, 1, 0, { NE: exit('B') }, 'Aaa'), room('B', 1, 0, 0, { SW: exit('A') }, 'Bbb')]);
    expect(toAsciiArea(up, 'a1', 0)).toContain('/');
  });

  it('leaves out an exit with no target, one to a room that is not on this floor, and a vertical one', () => {
    const d = doc([room('A', 0, 0, 0, { E: exit(null), N: exit('Q'), U: exit('A') }, 'Aaa')]);
    expect(toAsciiArea(d, 'a1', 0)).toBe(['Test Area (vz=0)', '', ' Aaa'].join('\n'));
  });

  it('names the area by its id when the catalog does not know it', () => {
    const d = doc([room('A', 0, 0, 0, {}, 'Aaa', undefined, 'unlisted')]);
    expect(toAsciiArea(d, 'unlisted', 0).split('\n')[0]).toBe('unlisted (vz=0)');
  });

  it('puts rooms with no explicit floor on floor 0', () => {
    const d = doc([room('A', 0, 0, 0, {}, 'Aaa')]);
    delete (d.rooms.A.coords as { vz?: number }).vz;
    expect(toAsciiArea(d, 'a1', 0)).toContain('Aaa');
  });
});
