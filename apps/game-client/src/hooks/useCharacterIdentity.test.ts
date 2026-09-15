import { renderHook, act } from '@testing-library/react';
import { useCharacterIdentity } from './useCharacterIdentity';
import { DispatchEvent } from '../features/event-emitter/event-dispatcher';

describe('useCharacterIdentity', () => {
  beforeEach(() => {
    delete (window as any).__SA_IDENTITY__;
  });

  it('starts null when there is no snapshot and nothing has been dispatched', () => {
    const { result } = renderHook(() => useCharacterIdentity());
    expect(result.current.characterName).toBeNull();
  });

  it('seeds from window.__SA_IDENTITY__ at mount, for late subscribers', () => {
    (window as any).__SA_IDENTITY__ = { characterName: 'Aria', updatedAt: 123 };
    const { result } = renderHook(() => useCharacterIdentity());
    expect(result.current.characterName).toBe('Aria');
  });

  it('updates when shatteredarchive:identity-updated fires after mount', () => {
    const { result } = renderHook(() => useCharacterIdentity());
    expect(result.current.characterName).toBeNull();

    act(() => {
      DispatchEvent('shatteredarchive:identity-updated', { characterName: 'Bram', updatedAt: 456 });
    });

    expect(result.current.characterName).toBe('Bram');
  });

  it('unsubscribes on unmount (no state update after unmount)', () => {
    const { result, unmount } = renderHook(() => useCharacterIdentity());
    unmount();

    // Should not throw / warn about updating an unmounted component.
    act(() => {
      DispatchEvent('shatteredarchive:identity-updated', { characterName: 'Cato', updatedAt: 789 });
    });

    expect(result.current.characterName).toBeNull();
  });

  it('supports multiple simultaneous instances without stomping each other', () => {
    const { result: result1 } = renderHook(() => useCharacterIdentity());
    const { result: result2 } = renderHook(() => useCharacterIdentity());

    // Both start null
    expect(result1.current.characterName).toBeNull();
    expect(result2.current.characterName).toBeNull();

    // Dispatch an event
    act(() => {
      DispatchEvent('shatteredarchive:identity-updated', { characterName: 'Dana', updatedAt: 999 });
    });

    // Both instances receive the update
    expect(result1.current.characterName).toBe('Dana');
    expect(result2.current.characterName).toBe('Dana');
  });
});
