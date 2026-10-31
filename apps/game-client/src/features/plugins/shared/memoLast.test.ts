import { memoLast } from './memoLast';

describe('memoLast', () => {
  it('reuses the result for the same argument and recomputes when it changes', () => {
    const fn = jest.fn((s: string) => s.split(','));
    const memo = memoLast(fn);

    const a = memo('a,b');
    expect(memo('a,b')).toBe(a);
    expect(fn).toHaveBeenCalledTimes(1);

    const b = memo('c');
    expect(b).toEqual(['c']);
    expect(b).not.toBe(a);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('treats an equal string built separately as the same argument', () => {
    const fn = jest.fn((s: string) => s.length);
    const memo = memoLast(fn);
    memo(['x', 'y'].join(''));
    memo('x' + 'y');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('caches an undefined argument and a falsy result', () => {
    const fn = jest.fn((x: unknown) => (x === undefined ? 0 : 1));
    const memo = memoLast(fn);
    expect(memo(undefined)).toBe(0);
    expect(memo(undefined)).toBe(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('only remembers the LAST argument', () => {
    const fn = jest.fn((s: string) => s.toUpperCase());
    const memo = memoLast(fn);
    memo('a');
    memo('b');
    memo('a');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
