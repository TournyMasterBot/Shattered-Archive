import { renderHook, waitFor, act } from '@testing-library/react';
import { parseAreaFile, type AreaFile } from '@shatteredarchive/merc-area';

import { useAreaWorkbench } from './workbench.js';

/** Mutate the #AREA header's credits field — a cheap, always-present edit for dirty-state tests. */
function withEditedCredits(area: AreaFile): AreaFile {
  return { ...area, sections: area.sections.map((s) => (s.kind === 'area' ? { ...s, credits: 'Changed' } : s)) };
}

const TINY_AREA = `#AREA
tiny.are~
Tiny~
{ 1 50} Test  Tiny~
100 199

#ROOMS
#100
The Test Room~
A perfectly ordinary test room.
~
0 0 1
S
#0

#$
`;

function mockFetch() {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const json = (body: unknown, status = 200) =>
      ({ ok: status < 400, status, statusText: 'x', json: async () => body }) as unknown as Response;

    if (url.endsWith('/api/capabilities')) return json({ writeEnabled: true, tokenRequired: false });
    if (url.endsWith('/api/areas') && method === 'GET') return json({ areas: [{ file: 'tiny.are', name: 'Tiny' }] });
    if (url.endsWith('/api/presence')) return json({ entries: [], ttlSeconds: 60 });
    if (url.endsWith('/api/areas/tiny.are') && method === 'GET') {
      return json({ file: 'tiny.are', area: parseAreaFile(TINY_AREA), baseHash: 'hash-1' });
    }
    if (url.endsWith('/api/areas/tiny.are') && method === 'PUT') {
      return json({ saved: true, backupPath: null, hash: 'hash-2' });
    }
    throw new Error(`unexpected fetch ${url} ${method}`);
  }) as unknown as typeof fetch;
}

describe('useAreaWorkbench dirty-state tracking', () => {
  beforeEach(() => {
    mockFetch();
  });

  it('is clean after opening an area, dirty after an edit, and clean again after save', async () => {
    const { result } = renderHook(() => useAreaWorkbench());

    await act(async () => {
      await result.current.openArea('tiny.are');
    });
    await waitFor(() => expect(result.current.area).not.toBeNull());
    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.setAreaModel(withEditedCredits(result.current.area!));
    });
    expect(result.current.isDirty).toBe(true);

    await act(async () => {
      await result.current.doSave();
    });
    expect(result.current.isDirty).toBe(false);
  });

  it('confirmDiscard short-circuits true when clean and only prompts when dirty', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm');
    const { result } = renderHook(() => useAreaWorkbench());

    await act(async () => {
      await result.current.openArea('tiny.are');
    });
    await waitFor(() => expect(result.current.area).not.toBeNull());

    expect(result.current.confirmDiscard('switch areas')).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();

    act(() => {
      result.current.setAreaModel(withEditedCredits(result.current.area!));
    });

    confirmSpy.mockReturnValue(false);
    expect(result.current.confirmDiscard('switch areas')).toBe(false);
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('You have unsaved changes to tiny.are. Discard them and switch areas?'),
    );

    confirmSpy.mockRestore();
  });

  it('re-opening the same area (reload) resets the dirty baseline', async () => {
    const { result } = renderHook(() => useAreaWorkbench());

    await act(async () => {
      await result.current.openArea('tiny.are');
    });
    await waitFor(() => expect(result.current.area).not.toBeNull());

    act(() => {
      result.current.setAreaModel(withEditedCredits(result.current.area!));
    });
    expect(result.current.isDirty).toBe(true);

    await act(async () => {
      await result.current.openArea('tiny.are');
    });
    expect(result.current.isDirty).toBe(false);
  });

  it('registers a beforeunload guard only while dirty', async () => {
    const addSpy = jest.spyOn(window, 'addEventListener');
    const removeSpy = jest.spyOn(window, 'removeEventListener');
    const { result } = renderHook(() => useAreaWorkbench());

    await act(async () => {
      await result.current.openArea('tiny.are');
    });
    await waitFor(() => expect(result.current.area).not.toBeNull());
    expect(addSpy).not.toHaveBeenCalledWith('beforeunload', expect.anything());

    act(() => {
      result.current.setAreaModel(withEditedCredits(result.current.area!));
    });
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    const handler = addSpy.mock.calls.find((c) => c[0] === 'beforeunload')![1] as (e: Event) => void;
    const event = new Event('beforeunload', { cancelable: true });
    handler(event);
    expect(event.defaultPrevented).toBe(true);

    await act(async () => {
      await result.current.doSave();
    });
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
