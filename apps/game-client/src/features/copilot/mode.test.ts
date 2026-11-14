import { DEFAULT_MODE, MODES, MODE_LABELS, MODE_STORAGE_KEY, loadMode, saveMode } from './mode';

describe('mode storage', () => {
  it('has a label for every mode, and exploration by default', () => {
    expect(MODES.map((m) => MODE_LABELS[m])).toEqual(['Battle', 'Exploration', 'Questing', 'Leveling']);
    expect(DEFAULT_MODE).toBe('exploration');
  });

  it('round-trips a saved mode', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    saveMode(storage, 'battle');
    expect(data.get(MODE_STORAGE_KEY)).toBe('battle');
    expect(loadMode(storage)).toBe('battle');
  });

  it('falls back to the default for nothing, a value that is not a mode, or no storage', () => {
    expect(loadMode({ getItem: () => null })).toBe('exploration');
    expect(loadMode({ getItem: () => 'dancing' })).toBe('exploration');
    expect(loadMode(undefined)).toBe('exploration');
  });

  it('survives a blocked storage in both directions', () => {
    const blocked = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    };
    expect(loadMode(blocked)).toBe('exploration');
    expect(() => saveMode(blocked, 'questing')).not.toThrow();
    expect(() => saveMode(undefined, 'questing')).not.toThrow();
  });
});
