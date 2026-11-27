import {
  ADDITIONS_STORAGE_KEY,
  DEFAULT_HOSTS,
  DEFAULT_PORTS,
  MAX_ADDITIONS,
  NO_ADDITIONS,
  isAllowedExtraHost,
  isSimulacrumConnection,
  normalizeAdditions,
  normalizeHost,
  readAdditions,
  saveAdditions,
} from './connectionGate';

// Private-range values are built from parts so this file holds no address literal (LOCAL-05).
const ip = (...parts: number[]): string => parts.join('.');

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe('isSimulacrumConnection (E1)', () => {
  const host = DEFAULT_HOSTS[1];
  const port = DEFAULT_PORTS[0];

  it('accepts each default host on the default port', () => {
    for (const name of DEFAULT_HOSTS) expect(isSimulacrumConnection(name, port)).toBe(true);
  });

  it('is case-insensitive and ignores surrounding whitespace and one trailing dot', () => {
    expect(isSimulacrumConnection(host.toUpperCase(), port)).toBe(true);
    expect(isSimulacrumConnection(`  ${host}  `, port)).toBe(true);
    expect(isSimulacrumConnection(`${host}.`, port)).toBe(true);
  });

  it('refuses the live DSL game and any other server', () => {
    expect(isSimulacrumConnection('dsl-mud.org', 4000)).toBe(false);
    expect(isSimulacrumConnection('example.org', port)).toBe(false);
  });

  it('refuses a good host on a wrong port, and a good port on a wrong host', () => {
    expect(isSimulacrumConnection(host, 4000)).toBe(false);
    expect(isSimulacrumConnection('dsl-mud.org', port)).toBe(false);
  });

  it('refuses a port that is not an integer number, including a numeric string', () => {
    expect(isSimulacrumConnection(host, String(port))).toBe(false);
    expect(isSimulacrumConnection(host, 65001.5)).toBe(false);
    expect(isSimulacrumConnection(host, undefined)).toBe(false);
    expect(isSimulacrumConnection(host, 0)).toBe(false);
    expect(isSimulacrumConnection(host, 70000)).toBe(false);
  });

  it('refuses a host with a scheme, path, port, wildcard, credentials or a doubled dot, and anything that is not a string', () => {
    for (const bad of [`https://${host}`, `${host}/x`, `${host}:${port}`, `*.${host}`, `user@${host}`, `a..${host}`, '', ' ']) {
      expect(isSimulacrumConnection(bad, port)).toBe(false);
    }
    expect(isSimulacrumConnection(undefined, port)).toBe(false);
    expect(isSimulacrumConnection(42, port)).toBe(false);
  });

  it('accepts the owner additions (a private address and a second port) and nothing the additions do not name', () => {
    const lan = ip(192, 168, 7, 9);
    const additions = normalizeAdditions({ hosts: [lan], ports: [65099] });
    expect(isSimulacrumConnection(lan, port, additions)).toBe(true);
    expect(isSimulacrumConnection(lan, 65099, additions)).toBe(true);
    expect(isSimulacrumConnection(host, 65099, additions)).toBe(true);
    expect(isSimulacrumConnection(lan, 4000, additions)).toBe(false);
    expect(isSimulacrumConnection(lan, port)).toBe(false); // without the addition the address is not accepted
  });
});

describe('addresses (E18, LOCAL-05)', () => {
  it('accepts loopback, private-range and dev-domain values', () => {
    for (const ok of ['localhost', '127.0.0.1', ip(10, 1, 2, 3), ip(172, 16, 0, 1), ip(172, 31, 255, 1), ip(192, 168, 0, 1), 'x.shatteredarchive.dev', 'shatteredarchive.dev']) {
      expect(isAllowedExtraHost(ok)).toBe(true);
    }
  });

  it('refuses a public address or name, and the ranges just outside the private ones', () => {
    for (const bad of ['example.org', ip(8, 8, 8, 8), ip(172, 15, 0, 1), ip(172, 32, 0, 1), ip(11, 0, 0, 1), ip(192, 169, 0, 1), 'evilshatteredarchive.dev']) {
      expect(isAllowedExtraHost(bad)).toBe(false);
    }
  });

  it('normalizeHost keeps a bare lower-case name and drops everything else', () => {
    expect(normalizeHost(' Host.Example.DEV. ')).toBe('host.example.dev');
    expect(normalizeHost('a b')).toBeUndefined();
    expect(normalizeHost('a'.repeat(254))).toBeUndefined();
    expect(normalizeHost(null)).toBeUndefined();
  });
});

describe('normalizeAdditions (E19, SETTINGS-04)', () => {
  it('reads every wrong shape as no additions', () => {
    for (const raw of [null, undefined, 'text', 42, true, [], ['a'], { hosts: 'x', ports: 'y' }, { hosts: {}, ports: {} }, {}]) {
      expect(normalizeAdditions(raw)).toEqual({ hosts: [], ports: [] });
    }
  });

  it('keeps only valid entries and collapses duplicates', () => {
    const lan = ip(10, 0, 0, 7);
    const result = normalizeAdditions({
      hosts: [lan, lan.toUpperCase(), 'example.org', 7, null, `${lan}.`, 'LOCALHOST'],
      ports: [65099, 65099, '65100', 0, 70000, 1.5, 22],
    });
    expect(result).toEqual({ hosts: [lan, 'localhost'], ports: [65099, 22] });
  });

  it('keeps at most MAX_ADDITIONS of each, the first ones', () => {
    const many = Array.from({ length: MAX_ADDITIONS + 10 }, (_, i) => `h${i}.shatteredarchive.dev`);
    const ports = Array.from({ length: MAX_ADDITIONS + 10 }, (_, i) => 2000 + i);
    const result = normalizeAdditions({ hosts: many, ports });
    expect(result.hosts).toEqual(many.slice(0, MAX_ADDITIONS));
    expect(result.ports).toEqual(ports.slice(0, MAX_ADDITIONS));
  });

  it('does not let the defaults be removed: they apply whatever the stored value says', () => {
    const none = normalizeAdditions({ hosts: [], ports: [] });
    expect(isSimulacrumConnection(DEFAULT_HOSTS[0], DEFAULT_PORTS[0], none)).toBe(true);
  });
});

describe('readAdditions and saveAdditions', () => {
  it('reads nothing from a missing entry, a missing storage and a blocked one', () => {
    expect(readAdditions(memoryStorage())).toEqual(NO_ADDITIONS);
    expect(readAdditions(undefined)).toEqual(NO_ADDITIONS);
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(readAdditions(blocked)).toEqual(NO_ADDITIONS);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith('[simulacrum-admin] could not read the stored host additions');
    } finally {
      warn.mockRestore();
    }
  });

  it('reads corrupt JSON as no additions with one fixed warning that carries no stored text', () => {
    const storage = memoryStorage({ [ADDITIONS_STORAGE_KEY]: '{not json secret-looking-text' });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(readAdditions(storage)).toEqual(NO_ADDITIONS);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0])).not.toContain('secret-looking-text');
    } finally {
      warn.mockRestore();
    }
  });

  it('round-trips additions through storage', () => {
    const storage = memoryStorage();
    const lan = ip(192, 168, 1, 2);
    expect(saveAdditions(storage, { hosts: [lan], ports: [65099] })).toEqual({ hosts: [lan], ports: [65099] });
    expect(JSON.parse(storage.data.get(ADDITIONS_STORAGE_KEY) as string)).toEqual({ hosts: [lan], ports: [65099] });
    expect(readAdditions(storage)).toEqual({ hosts: [lan], ports: [65099] });
  });

  it('stores nothing when there is nothing to add, and removes an earlier entry (SETTINGS-01)', () => {
    const storage = memoryStorage();
    saveAdditions(storage, { hosts: [], ports: [] });
    expect(storage.data.size).toBe(0);

    saveAdditions(storage, { hosts: ['localhost'], ports: [] });
    expect(storage.data.size).toBe(1);
    saveAdditions(storage, { hosts: ['example.org'], ports: [] }); // refused entry -> nothing left to store
    expect(storage.data.size).toBe(0);
  });

  it('never stores a default, only what differs from the defaults (SETTINGS-01)', () => {
    const storage = memoryStorage();
    saveAdditions(storage, { hosts: [...DEFAULT_HOSTS, 'localhost'], ports: [...DEFAULT_PORTS, 65099] });
    expect(JSON.parse(storage.data.get(ADDITIONS_STORAGE_KEY) as string)).toEqual({ hosts: ['localhost'], ports: [65099] });

    saveAdditions(storage, { hosts: [...DEFAULT_HOSTS], ports: [...DEFAULT_PORTS] });
    expect(storage.data.has(ADDITIONS_STORAGE_KEY)).toBe(false); // only defaults: nothing stored
  });

  it('survives a storage that throws on write, returning the clean value with one fixed warning', () => {
    const failing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(saveAdditions(failing, { hosts: ['localhost'], ports: [] })).toEqual({ hosts: ['localhost'], ports: [] });
      expect(warn).toHaveBeenCalledWith('[simulacrum-admin] could not store the host additions');
    } finally {
      warn.mockRestore();
    }
  });

  it('is a no-op without storage', () => {
    expect(saveAdditions(undefined, { hosts: ['localhost'], ports: [] })).toEqual({ hosts: ['localhost'], ports: [] });
  });
});
