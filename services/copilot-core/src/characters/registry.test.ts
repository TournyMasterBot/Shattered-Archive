import { loadMatrix } from './matrix';
import {
  allocateCodename,
  CodenameExhaustedError,
  CONSTELLATIONS,
  formatCodename,
  resolveCharacter,
  setGender,
  type CharacterRecord,
  type CharacterStore,
} from './registry';

const { matrix } = loadMatrix([
  { codename: 'Agate', male: 'Zorvak', female: 'Quenta' },
  { codename: 'C002', male: 'Tamsin' },
]);

/** An in-memory store; `failPut` makes the next puts reject without changing anything. */
function memoryStore(initial: Record<string, CharacterRecord> = {}): CharacterStore & {
  data: Map<string, CharacterRecord>;
  puts: number;
  failPut: boolean;
} {
  const data = new Map(Object.entries(initial));
  const store = {
    data,
    puts: 0,
    failPut: false,
    get: async (key: string) => data.get(key),
    put: async (key: string, record: CharacterRecord) => {
      if (store.failPut) throw new Error('disk full');
      store.puts++;
      data.set(key, record);
    },
    codenames: async () => [...data.values()].map((r) => r.codename),
  };
  return store;
}

describe('CONSTELLATIONS', () => {
  it('has unique single-word entries that cannot clash with matrix codenames', () => {
    expect(new Set(CONSTELLATIONS.map((c) => c.toLowerCase())).size).toBe(CONSTELLATIONS.length);
    expect(CONSTELLATIONS.every((c) => /^[A-Z][a-z]+$/.test(c))).toBe(true);
    // matrix codenames are minerals or C### ids; no constellation is either of the two test forms
    expect(CONSTELLATIONS.some((c) => /^C\d+$/.test(c))).toBe(false);
    expect(CONSTELLATIONS).not.toContain('Agate');
  });
});

describe('allocateCodename', () => {
  it('takes the first free constellation in list order, ignoring case', () => {
    expect(allocateCodename([])).toBe(CONSTELLATIONS[0]);
    expect(allocateCodename([CONSTELLATIONS[0].toUpperCase()])).toBe(CONSTELLATIONS[1]);
  });

  it('fails loudly when every codename is taken instead of reusing one', () => {
    expect(() => allocateCodename(CONSTELLATIONS)).toThrow(CodenameExhaustedError);
  });
});

describe('formatCodename', () => {
  it('appends the gender', () => {
    expect(formatCodename('Agate', 'F')).toBe('Agate-F');
    expect(formatCodename('Orion', 'U')).toBe('Orion-U');
  });
});

describe('resolveCharacter: test characters (E8)', () => {
  it('resolves a matrix name to its row codename and gender without registering it', async () => {
    const store = memoryStore();
    expect(await resolveCharacter('zorvak', matrix, store, 10)).toEqual({
      codename: 'Agate',
      kind: 'test',
      gender: 'M',
      isNew: false,
    });
    expect(await resolveCharacter('QUENTA', matrix, store, 10)).toMatchObject({ codename: 'Agate', gender: 'F' });
    expect(store.puts).toBe(0);
    expect(store.data.size).toBe(0);
  });

  it('prefers the matrix over a stored record for the same name', async () => {
    const store = memoryStore({
      zorvak: { codename: 'Orion', kind: 'real', gender: 'M', firstSeen: 1, lastSeen: 1 },
    });
    expect((await resolveCharacter('Zorvak', matrix, store, 5)).kind).toBe('test');
  });
});

describe('resolveCharacter: real characters', () => {
  it('gives an unknown name the next free constellation with gender U, and the same one on every later call', async () => {
    const store = memoryStore();
    const first = await resolveCharacter('Brannoch', matrix, store, 100);
    expect(first).toEqual({ codename: CONSTELLATIONS[0], kind: 'real', gender: 'U', isNew: true });
    expect(store.data.get('brannoch')).toEqual({
      codename: CONSTELLATIONS[0],
      kind: 'real',
      gender: 'U',
      firstSeen: 100,
      lastSeen: 100,
    });

    const again = await resolveCharacter('  BRANNOCH ', matrix, store, 250);
    expect(again).toEqual({ codename: CONSTELLATIONS[0], kind: 'real', gender: 'U', isNew: false });
    expect(store.data.get('brannoch')).toMatchObject({ firstSeen: 100, lastSeen: 250 });
  });

  it('never moves lastSeen backwards', async () => {
    const store = memoryStore();
    await resolveCharacter('Brannoch', matrix, store, 500);
    await resolveCharacter('Brannoch', matrix, store, 100);
    expect(store.data.get('brannoch')?.lastSeen).toBe(500);
  });

  it('gives two different names two different codenames', async () => {
    const store = memoryStore();
    const a = await resolveCharacter('Brannoch', matrix, store, 1);
    const b = await resolveCharacter('Ilsewyn', matrix, store, 2);
    expect(a.codename).not.toBe(b.codename);
    expect(b.codename).toBe(CONSTELLATIONS[1]);
  });

  it('fails loudly when the list is exhausted and registers nothing', async () => {
    const full: Record<string, CharacterRecord> = {};
    CONSTELLATIONS.forEach((c, i) => {
      full[`name${i}`] = { codename: c, kind: 'real', gender: 'U', firstSeen: 1, lastSeen: 1 };
    });
    const store = memoryStore(full);
    await expect(resolveCharacter('Latecomer', matrix, store, 9)).rejects.toThrow(CodenameExhaustedError);
    expect(store.data.has('latecomer')).toBe(false);
  });

  it('leaves the registry unchanged when persistence fails, so a retry gets the same codename', async () => {
    const store = memoryStore();
    store.failPut = true;
    await expect(resolveCharacter('Brannoch', matrix, store, 1)).rejects.toThrow('disk full');
    expect(store.data.size).toBe(0);

    store.failPut = false;
    expect((await resolveCharacter('Brannoch', matrix, store, 2)).codename).toBe(CONSTELLATIONS[0]);
  });

  it('rejects an empty name', async () => {
    await expect(resolveCharacter('   ', matrix, memoryStore(), 1)).rejects.toThrow('empty');
  });
});

describe('setGender', () => {
  it('records M or F for a registered character, once', async () => {
    const store = memoryStore();
    await resolveCharacter('Brannoch', matrix, store, 1);
    expect(await setGender('Brannoch', 'F', store)).toBe(true);
    expect(store.data.get('brannoch')?.gender).toBe('F');
    const putsBefore = store.puts;
    expect(await setGender('BRANNOCH', 'F', store)).toBe(true);
    expect(store.puts).toBe(putsBefore); // unchanged value is not rewritten
    expect(await setGender('Brannoch', 'M', store)).toBe(true);
    expect(store.data.get('brannoch')?.gender).toBe('M');
  });

  it('returns false for an unregistered name', async () => {
    expect(await setGender('Ghost', 'M', memoryStore())).toBe(false);
  });
});
