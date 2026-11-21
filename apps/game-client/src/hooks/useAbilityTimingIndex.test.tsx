import { renderHook, waitFor } from '@testing-library/react';

import { useAbilityTimingIndex } from './useAbilityTimingIndex';
import { getClassCatalogCached } from '../features/autoleveling/autoleveling-classes';
import { serverLagMsFor } from '../features/autoleveling/autoleveling-lag';

// The server's measured ability lag, as the autopilot engine reads it (live findings 2026-11-14, item 7): from the class catalog cached on this device.

jest.mock('../features/autoleveling/autoleveling-classes', () => ({ getClassCatalogCached: jest.fn() }));

const CATALOG = [
  {
    name: 'Warrior',
    mortalClass: 1,
    isReclass: false,
    classGroup: '',
    abilities: [
      { name: 'Frenzy', type: 'spell', level: 5, groups: [], durationTicks: 18, lagMs: 3800 },
      { name: 'Kick', type: 'skill', level: 1, groups: [] },
    ],
  },
  { name: 'Cleric', mortalClass: 2, isReclass: false, classGroup: '', abilities: [{ name: 'Fly', type: 'spell', level: 9, groups: [], lagMs: 3000 }] },
];

describe('useAbilityTimingIndex', () => {
  it('knows the measured lag of an ability once the cached catalog is read: any spelling of the command, by name', async () => {
    jest.mocked(getClassCatalogCached).mockResolvedValue(CATALOG as never);
    const { result } = renderHook(() => useAbilityTimingIndex('conn'));

    await waitFor(() => expect(result.current.current).not.toBeNull());
    expect(serverLagMsFor(result.current.current, "cast 'frenzy' elf")).toBe(3800);
    expect(serverLagMsFor(result.current.current, 'c frenzy')).toBe(3800);
    expect(serverLagMsFor(result.current.current, "cast 'fly'")).toBe(3000);
  });

  it('an ability with no measured lag, a skill with no data and an unknown command are unknown (null), never 0', async () => {
    jest.mocked(getClassCatalogCached).mockResolvedValue(CATALOG as never);
    const { result } = renderHook(() => useAbilityTimingIndex('conn'));
    await waitFor(() => expect(result.current.current).not.toBeNull());

    expect(serverLagMsFor(result.current.current, 'kick orc')).toBeNull();
    expect(serverLagMsFor(result.current.current, 'no such command')).toBeNull();
    expect(serverLagMsFor(result.current.current, '')).toBeNull();
  });

  it('is null until the catalog arrives', async () => {
    let release: (v: unknown) => void = () => undefined;
    jest.mocked(getClassCatalogCached).mockReturnValue(new Promise((r) => (release = r)) as never);
    const { result } = renderHook(() => useAbilityTimingIndex('conn'));
    expect(result.current.current).toBeNull();
    expect(serverLagMsFor(result.current.current, "cast 'frenzy'")).toBeNull();

    release(CATALOG);
    await waitFor(() => expect(result.current.current).not.toBeNull());
  });

  it('an empty catalog gives an index that knows nothing', async () => {
    jest.mocked(getClassCatalogCached).mockResolvedValue([]);
    const { result } = renderHook(() => useAbilityTimingIndex('conn'));
    await waitFor(() => expect(result.current.current).not.toBeNull());
    expect(serverLagMsFor(result.current.current, "cast 'frenzy'")).toBeNull();
  });

  it('a catalog that cannot be read leaves the lags unknown, says so once without any value, and does not throw', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.mocked(getClassCatalogCached).mockRejectedValue(new Error('disk'));
    const { result } = renderHook(() => useAbilityTimingIndex('conn'));

    await waitFor(() => expect(warn).toHaveBeenCalledWith('[autoleveling][hook]', 'could not read the class catalog for ability timing'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(result.current.current).toBeNull();
    warn.mockRestore();
  });

  it('a component that unmounts before the catalog arrives is never written to afterwards', async () => {
    let release: (v: unknown) => void = () => undefined;
    jest.mocked(getClassCatalogCached).mockReturnValue(new Promise((r) => (release = r)) as never);
    const { result, unmount } = renderHook(() => useAbilityTimingIndex('conn'));
    unmount();

    release(CATALOG);
    await Promise.resolve();
    await Promise.resolve();
    expect(result.current.current).toBeNull();
  });

  it('reads the catalog again for a new connection', async () => {
    jest.mocked(getClassCatalogCached).mockClear();
    jest.mocked(getClassCatalogCached).mockResolvedValue(CATALOG as never);
    const { rerender } = renderHook(({ id }) => useAbilityTimingIndex(id), { initialProps: { id: 'a' } });
    rerender({ id: 'b' });
    await waitFor(() => expect(getClassCatalogCached).toHaveBeenCalledTimes(2));
  });
});
