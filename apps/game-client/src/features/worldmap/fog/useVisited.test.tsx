// The rooms the window may show while fog is on: the account's or the character's, kept current as visits are recorded and the character is named.
import { act, renderHook, waitFor } from '@testing-library/react';
import { DispatchEvent } from '../../event-emitter/event-dispatcher';
import { memoryKvStore } from '../../autoleveling/autoleveling-idb';
import type { FogMode } from '../settings';
import { useVisited } from './useVisited';
import { createVisitStore } from './visits';

const setCharacter = (name: string | undefined): void => {
  (window as unknown as { __SA_IDENTITY__?: unknown }).__SA_IDENTITY__ = name === undefined ? undefined : { characterName: name };
};
const scopeFor = (character: string) => ({ world: 'dsl', account: 'local', character });

afterEach(() => setCharacter(undefined));

describe('useVisited', () => {
  it('is null while fog is off, and reads nothing', () => {
    const store = createVisitStore(memoryKvStore());
    const load = jest.spyOn(store, 'load');
    const { result } = renderHook(() => useVisited('off', 'dsl', store));
    expect(result.current).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('gives the character level and the user level from the same records', async () => {
    const store = createVisitStore(memoryKvStore());
    await store.record(scopeFor('Aldric-M'), 'r1');
    await store.record(scopeFor('Mira-F'), 'r2');
    setCharacter('Aldric-M');
    const character = renderHook(() => useVisited('character', 'dsl', store));
    const user = renderHook(() => useVisited('user', 'dsl', store));
    await waitFor(() => expect([...(character.result.current ?? [])]).toEqual(['r1']));
    await waitFor(() => expect([...(user.result.current ?? [])].sort()).toEqual(['r1', 'r2']));
  });

  it('follows a new visit as it is recorded', async () => {
    const store = createVisitStore(memoryKvStore());
    setCharacter('Aldric-M');
    const { result } = renderHook(() => useVisited('character', 'dsl', store));
    await waitFor(() => expect(result.current?.size).toBe(0));
    await act(async () => void (await store.record(scopeFor('Aldric-M'), 'r1')));
    expect([...(result.current ?? [])]).toEqual(['r1']);
  });

  it('changes with the character when the game names a different one', async () => {
    const store = createVisitStore(memoryKvStore());
    await store.record(scopeFor('Aldric-M'), 'r1');
    await store.record(scopeFor('Mira-F'), 'r2');
    setCharacter('Aldric-M');
    const { result } = renderHook(() => useVisited('character', 'dsl', store));
    await waitFor(() => expect([...(result.current ?? [])]).toEqual(['r1']));
    setCharacter('Mira-F');
    act(() => DispatchEvent('shatteredarchive:identity-updated', { characterName: 'Mira-F' }));
    await waitFor(() => expect([...(result.current ?? [])]).toEqual(['r2']));
  });

  it('keeps worlds apart', async () => {
    const store = createVisitStore(memoryKvStore());
    await store.record({ world: 'sandbox', account: 'local', character: 'Aldric-M' }, 'r9');
    setCharacter('Aldric-M');
    const { result } = renderHook(() => useVisited('user', 'dsl', store));
    await waitFor(() => expect(result.current?.size).toBe(0));
  });

  it('switches between levels, and back to null when fog goes off', async () => {
    const store = createVisitStore(memoryKvStore());
    await store.record(scopeFor('Aldric-M'), 'r1');
    await store.record(scopeFor('Mira-F'), 'r2');
    setCharacter('Aldric-M');
    const { result, rerender } = renderHook(({ fog }: { fog: FogMode }) => useVisited(fog, 'dsl', store), { initialProps: { fog: 'character' as FogMode } });
    await waitFor(() => expect(result.current?.size).toBe(1));
    rerender({ fog: 'user' });
    await waitFor(() => expect(result.current?.size).toBe(2));
    rerender({ fog: 'off' });
    expect(result.current).toBeNull();
  });

  it('stops listening when unmounted, and a load that finishes after that changes nothing', async () => {
    const kv = memoryKvStore();
    const store = createVisitStore(kv);
    const view = renderHook(() => useVisited('user', 'dsl', store));
    view.unmount();
    await act(async () => void (await store.record(scopeFor('Aldric-M'), 'r1')));
    act(() => DispatchEvent('shatteredarchive:identity-updated', { characterName: 'X' }));
    expect(view.result.current?.size ?? 0).toBe(0);
  });

  it('uses the shared store of the page when none is given', async () => {
    const shared = await import('../mine/shared');
    shared.__resetSharedMineForTests();
    await shared.sharedVisitStore().record({ world: 'dsl', account: 'local', character: '' }, 'r5');
    const { result } = renderHook(() => useVisited('user', 'dsl'));
    await waitFor(() => expect([...(result.current ?? [])]).toEqual(['r5']));
    shared.__resetSharedMineForTests();
  });
});
