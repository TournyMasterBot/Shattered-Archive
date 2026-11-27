import { isWorld, WORLD_TARGETS, WORLDS, worldOfTarget } from './worlds';

describe('worlds', () => {
  it('knows the DSL and the sandbox, and nothing else', () => {
    expect(WORLDS).toEqual(['dsl', 'sandbox']);
    expect(isWorld('dsl')).toBe(true);
    expect(isWorld('sandbox')).toBe(true);
    for (const other of ['simulacrum', 'DSL', '', undefined, null, 4]) expect(isWorld(other)).toBe(false);
  });

  it('puts every connection target in at most one world', () => {
    const all = [...WORLD_TARGETS.dsl, ...WORLD_TARGETS.sandbox];
    expect(new Set(all).size).toBe(all.length);
  });

  it('the DSL is only its player port; every address of the Simulacrum is the sandbox', () => {
    expect(worldOfTarget('dsl-mud.org:4000')).toBe('dsl');
    expect(worldOfTarget('dsl-mud.org:8000')).toBeUndefined();
    for (const target of ['simulacrum.shatteredarchive.dev:4000', 'simulacrum-server.shatteredarchive.dev:65001', 'host.docker.internal:4000', 'localhost:4000'])
      expect(worldOfTarget(target)).toBe('sandbox');
    expect(worldOfTarget('example.org:4000')).toBeUndefined();
    expect(worldOfTarget('unknown')).toBeUndefined();
  });
});
