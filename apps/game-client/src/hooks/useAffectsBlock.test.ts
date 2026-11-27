import { renderHook, act } from '@testing-library/react';
import { useAffectsBlock } from './useAffectsBlock';
import { DispatchEvent } from '../features/event-emitter/event-dispatcher';
import { __resetForTests } from '../features/affects/affectsStore';

const SANCTUARY = { n: 'sanctuary', d: 20, lc: 'spell' };

describe('useAffectsBlock', () => {
  beforeEach(() => __resetForTests());

  it('starts empty with no affects data yet', () => {
    const { result } = renderHook(() => useAffectsBlock());
    expect(result.current.affects).toEqual([]);
  });

  it('populates from a game:affects-trueup snapshot', () => {
    const { result } = renderHook(() => useAffectsBlock());

    act(() => {
      DispatchEvent('game:affects-trueup', { affects: [SANCTUARY] });
    });

    expect(result.current.affects).toHaveLength(1);
    expect(result.current.affects[0].n).toBe('sanctuary');
  });

  it('keeps an affect at d: 0 from a trueup snapshot (cut eyes on its last tick)', () => {
    const { result } = renderHook(() => useAffectsBlock());

    act(() => {
      DispatchEvent('game:affects-trueup', {
        affects: [{ n: 'cut eyes', d: 0, m: -4, lc: 'hit roll', t: 0 }, SANCTUARY],
      });
    });

    expect(result.current.affects.map((a) => a.n)).toEqual(['cut eyes', 'sanctuary']);
  });

  it('a tick counts an affect down to 0 and keeps it there, never removing it', () => {
    const { result } = renderHook(() => useAffectsBlock());

    act(() => {
      DispatchEvent('game:affect-added', { n: 'cut eyes', d: 2, m: -4, lc: 'hit roll', t: 145 });
    });
    act(() => {
      DispatchEvent('game:tick', {});
    });
    expect(result.current.affects[0].d).toBe(1);

    act(() => {
      DispatchEvent('game:tick', {});
    });
    expect(result.current.affects).toHaveLength(1);
    expect(result.current.affects[0].d).toBe(0);

    act(() => {
      DispatchEvent('game:tick', {});
    });
    expect(result.current.affects).toHaveLength(1);
    expect(result.current.affects[0].d).toBe(0);
  });

  it('removes an affect only when game:affect-removed arrives', () => {
    const { result } = renderHook(() => useAffectsBlock());

    act(() => {
      DispatchEvent('game:affects-trueup', { affects: [{ n: 'cut eyes', d: 0, m: -4, lc: 'hit roll' }, SANCTUARY] });
    });
    act(() => {
      DispatchEvent('game:affect-removed', { n: 'cut eyes' });
    });

    expect(result.current.affects.map((a) => a.n)).toEqual(['sanctuary']);
  });

  it('a trueup with no affects list clears the list and invalid entries are discarded', () => {
    const { result } = renderHook(() => useAffectsBlock());

    act(() => {
      DispatchEvent('game:affects-trueup', { affects: [SANCTUARY, { n: '', d: 3 }, { n: 'bad', d: 'x' }, null] });
    });
    expect(result.current.affects.map((a) => a.n)).toEqual(['sanctuary']);

    act(() => {
      DispatchEvent('game:affects-trueup', { affects: 'nope' });
    });
    expect(result.current.affects).toEqual([]);
  });

  it('collapses duplicate (name, location, modifier) entries to the longest duration', () => {
    const { result } = renderHook(() => useAffectsBlock());

    act(() => {
      DispatchEvent('game:affects-trueup', {
        affects: [
          { n: 'ghost', lc: 'hit roll', m: 2, d: 5 },
          { n: 'ghost', lc: 'hit roll', m: 2, d: 9 },
          { n: 'ghost', lc: 'hit roll', m: 2, d: 3 },
          { n: 'ghost', lc: 'damage roll', m: 2, d: 4 },
        ],
      });
    });

    expect(result.current.affects.map((a) => [a.lc, a.d])).toEqual([
      ['damage roll', 4],
      ['hit roll', 9],
    ]);
  });

  it('orders affects by duration, then name, then location, then modifier', () => {
    const { result } = renderHook(() => useAffectsBlock());

    act(() => {
      DispatchEvent('game:affects-trueup', {
        affects: [
          { n: 'b', d: 2 },
          { n: 'a', d: 2, lc: 'z', m: 1 },
          { n: 'a', d: 2, lc: 'z', m: 0 },
          { n: 'a', d: 2, lc: 'y', m: 9 },
          { n: 'c', d: 1 },
        ],
      });
    });

    expect(result.current.affects.map((a) => `${a.n}${a.lc ?? ''}${a.m ?? ''}`)).toEqual([
      'c',
      'ay9',
      'az0',
      'az1',
      'b',
    ]);
  });

  it('affect-added appends a new affect, accepts a wrapped { affect } payload, and ignores invalid ones', () => {
    const { result } = renderHook(() => useAffectsBlock());

    act(() => {
      DispatchEvent('game:affect-added', { affect: { n: 'armor', d: 21, m: -20, lc: 'armor class' } });
    });
    expect(result.current.affects.map((a) => a.n)).toEqual(['armor']);

    act(() => {
      DispatchEvent('game:affect-added', { n: 'haste', d: 7, m: 8, lc: 'dexterity' });
      DispatchEvent('game:affect-added', { n: '', d: 7 });
      DispatchEvent('game:affect-added', {});
    });
    expect(result.current.affects.map((a) => a.n)).toEqual(['haste', 'armor']);
  });

  it('re-adding a matching affect refreshes its duration instead of stacking', () => {
    const { result } = renderHook(() => useAffectsBlock());

    act(() => {
      DispatchEvent('game:affect-added', { n: 'bless', d: 3, m: 2, lc: 'hit roll' });
    });
    act(() => {
      DispatchEvent('game:affect-added', { n: 'bless', d: 12, m: 2, lc: 'hit roll' });
    });

    expect(result.current.affects).toHaveLength(1);
    expect(result.current.affects[0].d).toBe(12);
  });

  it('removing by name drops every entry with that name and ignores a blank name', () => {
    const { result } = renderHook(() => useAffectsBlock());

    act(() => {
      DispatchEvent('game:affects-trueup', {
        affects: [
          { n: 'bless', d: 3, m: 2, lc: 'hit roll' },
          { n: 'bless', d: 3, m: 2, lc: 'saves' },
          SANCTUARY,
        ],
      });
    });
    act(() => {
      DispatchEvent('game:affect-removed', { n: '  ' });
      DispatchEvent('game:affect-removed', {});
    });
    expect(result.current.affects).toHaveLength(3);

    act(() => {
      DispatchEvent('game:affect-removed', { n: 'bless' });
    });
    expect(result.current.affects.map((a) => a.n)).toEqual(['sanctuary']);
  });

  it('a fresh mount (simulating a live theme switch) seeds from affectsStore instead of starting empty', () => {
    const first = renderHook(() => useAffectsBlock());
    act(() => {
      DispatchEvent('game:affects-trueup', { affects: [SANCTUARY] });
    });
    first.unmount();

    const second = renderHook(() => useAffectsBlock());
    expect(second.result.current.affects).toHaveLength(1);
    expect(second.result.current.affects[0].n).toBe('sanctuary');
  });
});
