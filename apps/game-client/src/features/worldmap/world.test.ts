import { act, renderHook } from '@testing-library/react';
import {
  __resetMapWorldsForTests,
  activeMapWorld,
  automaticMapWorld,
  DSL_WORLD,
  listMapWorlds,
  pickedMapWorldId,
  pickMapWorld,
  registerMapWorld,
  setActiveMapWorld,
  useActiveMapWorld,
  useMapWorldChoice,
} from './world';

const OTHER = { id: 'other', label: 'Other game', mapPrefix: '/api/world-map/other' };

describe('map worlds', () => {
  beforeEach(() => __resetMapWorldsForTests());

  it('starts on the DSL, whose route is the public one and which needs no name', () => {
    expect(activeMapWorld()).toBe(DSL_WORLD);
    expect(DSL_WORLD).toEqual({ id: 'dsl', label: '', mapPrefix: '/api/world-map' });
    expect(Object.isFrozen(DSL_WORLD)).toBe(true);
  });

  it('switches to a registered world and back, and tells its listeners each time', () => {
    registerMapWorld(OTHER);
    const { result } = renderHook(() => useActiveMapWorld());
    expect(result.current).toBe(DSL_WORLD);
    act(() => setActiveMapWorld('other'));
    expect(result.current).toEqual(OTHER);
    act(() => setActiveMapWorld('dsl'));
    expect(result.current).toBe(DSL_WORLD);
  });

  it('an id nobody registered is the DSL, never an error, and switching to the world already shown is not announced', () => {
    registerMapWorld(OTHER);
    const { result } = renderHook(() => useActiveMapWorld());
    act(() => setActiveMapWorld('nope'));
    expect(result.current).toBe(DSL_WORLD);
    let renders = 0;
    const { rerender } = renderHook(() => {
      renders += 1;
      return useActiveMapWorld();
    });
    const before = renders;
    act(() => setActiveMapWorld('dsl'));
    rerender();
    expect(renders - before).toBe(1); // only the rerender we asked for
  });

  it('the DSL\'s own entry cannot be replaced by registering the same id', () => {
    registerMapWorld({ id: 'dsl', label: 'Imposter', mapPrefix: '/api/world-map/imposter' });
    setActiveMapWorld('dsl');
    expect(activeMapWorld()).toBe(DSL_WORLD);
  });

  it('a registered world is frozen, and registering it again replaces it', () => {
    registerMapWorld(OTHER);
    registerMapWorld({ ...OTHER, label: 'Renamed' });
    setActiveMapWorld('other');
    expect(activeMapWorld().label).toBe('Renamed');
    expect(Object.isFrozen(activeMapWorld())).toBe(true);
  });

  it('the reset puts everything back (the DSL alone, shown)', () => {
    registerMapWorld(OTHER);
    setActiveMapWorld('other');
    __resetMapWorldsForTests();
    expect(activeMapWorld()).toBe(DSL_WORLD);
    setActiveMapWorld('other');
    expect(activeMapWorld()).toBe(DSL_WORLD);
  });
});

describe('picking a world by hand', () => {
  beforeEach(() => __resetMapWorldsForTests());

  it('lists the worlds (the DSL first), and a build with one world has nothing to choose', () => {
    expect(listMapWorlds()).toEqual([DSL_WORLD]);
    registerMapWorld(OTHER);
    expect(listMapWorlds().map((w) => w.id)).toEqual(['dsl', 'other']);
  });

  it('a pick wins over the connection until it is cleared, and the automatic choice keeps following the connection underneath', () => {
    registerMapWorld(OTHER);
    setActiveMapWorld('other'); // the connection chose the other game
    expect(activeMapWorld().id).toBe('other');
    pickMapWorld('dsl');
    expect(activeMapWorld()).toBe(DSL_WORLD);
    expect(pickedMapWorldId()).toBe('dsl');
    expect(automaticMapWorld().id).toBe('other');
    setActiveMapWorld('dsl'); // the connection closes: still what was picked
    expect(activeMapWorld()).toBe(DSL_WORLD);
    pickMapWorld('other');
    expect(activeMapWorld().id).toBe('other');
    pickMapWorld(null);
    expect(pickedMapWorldId()).toBeNull();
    expect(activeMapWorld()).toBe(DSL_WORLD); // automatic again: the connection had closed
  });

  it('an id nobody registered clears the pick, picking the same world twice changes nothing', () => {
    registerMapWorld(OTHER);
    pickMapWorld('other');
    pickMapWorld('nope');
    expect(pickedMapWorldId()).toBeNull();
    const { result } = renderHook(() => useActiveMapWorld());
    pickMapWorld('other');
    const shown = result.current;
    act(() => pickMapWorld('other'));
    expect(result.current).toBe(shown);
  });

  it('the window hook re-renders when a pick changes what is shown, and not when the connection changes what is not shown', () => {
    registerMapWorld(OTHER);
    const { result } = renderHook(() => useActiveMapWorld());
    act(() => pickMapWorld('other'));
    expect(result.current.id).toBe('other');
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useActiveMapWorld();
    });
    const before = renders;
    act(() => setActiveMapWorld('dsl')); // the connection moves, the pick keeps showing the other world
    expect(renders).toBe(before);
    expect(result.current.id).toBe('other');
  });

  it('the choice hook tells the picker about every change: a world registered, a pick, and a connection change that shows nothing new', () => {
    const { result } = renderHook(() => useMapWorldChoice());
    expect(result.current).toMatchObject({ pickedId: null, automatic: DSL_WORLD, shown: DSL_WORLD });
    expect(result.current.worlds).toHaveLength(1);
    act(() => registerMapWorld(OTHER));
    expect(result.current.worlds).toHaveLength(2);
    act(() => pickMapWorld('other'));
    expect(result.current).toMatchObject({ pickedId: 'other' });
    expect(result.current.shown.id).toBe('other');
    act(() => setActiveMapWorld('other')); // the connection now agrees with the pick: nothing shown changes, the picker still hears it
    expect(result.current.automatic.id).toBe('other');
    act(() => pickMapWorld(null));
    expect(result.current.pickedId).toBeNull();
  });

  it('the reset clears the pick', () => {
    registerMapWorld(OTHER);
    pickMapWorld('other');
    __resetMapWorldsForTests();
    expect(pickedMapWorldId()).toBeNull();
    expect(activeMapWorld()).toBe(DSL_WORLD);
  });
});
