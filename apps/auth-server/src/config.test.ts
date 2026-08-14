import { getAuthServerConfig, parseOriginServices } from './config.js';

/**
 * Covers the device origin → audience map specifically. It is security-relevant config: it is
 * the sole authority on what a device may mint for, so a parsing slip either locks an app out
 * or hands it an audience it was never meant to have.
 */
describe('parseOriginServices', () => {
  it('is empty when unset, which denies every origin', () => {
    expect(parseOriginServices(undefined).map.size).toBe(0);
    expect(parseOriginServices('').map.size).toBe(0);
  });

  it('parses one origin to one service', () => {
    const { map, warnings } = parseOriginServices('https://build.example=mud-builder-server');
    expect(map.get('https://build.example')).toEqual(['mud-builder-server']);
    expect(warnings).toEqual([]);
  });

  it('parses several origins, each with its own services', () => {
    const { map } = parseOriginServices('https://a.example=svc-a,https://b.example=svc-b');
    expect(map.get('https://a.example')).toEqual(['svc-a']);
    expect(map.get('https://b.example')).toEqual(['svc-b']);
  });

  it('parses an origin mapped to several services', () => {
    const { map } = parseOriginServices('https://a.example=svc-a|svc-b');
    expect(map.get('https://a.example')).toEqual(['svc-a', 'svc-b']);
  });

  /** A browser's Origin header never has a trailing slash, so a configured one must not stick. */
  it('trims a trailing slash from the origin', () => {
    const { map } = parseOriginServices('https://a.example/=svc-a');
    expect(map.get('https://a.example')).toEqual(['svc-a']);
  });

  it('tolerates whitespace around entries', () => {
    const { map } = parseOriginServices('  https://a.example = svc-a | svc-b , https://b.example=svc-c ');
    expect(map.get('https://a.example')).toEqual(['svc-a', 'svc-b']);
    expect(map.get('https://b.example')).toEqual(['svc-c']);
  });

  /** Widening rather than overwriting: a service quietly vanishing is the worse surprise. */
  it('unions duplicate origins instead of letting one win', () => {
    const { map } = parseOriginServices('https://a.example=svc-a,https://a.example=svc-b');
    expect(map.get('https://a.example')).toEqual(['svc-a', 'svc-b']);
  });

  it('does not duplicate a service listed twice for one origin', () => {
    const { map } = parseOriginServices('https://a.example=svc-a,https://a.example=svc-a');
    expect(map.get('https://a.example')).toEqual(['svc-a']);
  });

  /**
   * Malformed entries warn rather than throw: this is an optional feature, and a typo in it
   * must not take auth-server down for everyone. Skipping fails CLOSED — the origin simply
   * cannot enroll — so the safe outcome happens by itself.
   */
  it('warns and skips an entry with no "="', () => {
    const { map, warnings } = parseOriginServices('https://a.example');
    expect(map.size).toBe(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/not "origin=service"/);
  });

  it('warns and skips an entry with no service', () => {
    const { map, warnings } = parseOriginServices('https://a.example=');
    expect(map.size).toBe(0);
    expect(warnings[0]).toMatch(/missing an origin or a service/);
  });

  it('keeps the good entries when one is malformed', () => {
    const { map, warnings } = parseOriginServices('https://a.example=svc-a,broken,https://b.example=svc-b');
    expect([...map.keys()].sort()).toEqual(['https://a.example', 'https://b.example']);
    expect(warnings).toHaveLength(1);
  });
});

describe('getAuthServerConfig device settings', () => {
  /**
   * Derived, never configured separately — an origin that may enroll therefore always has a
   * defined audience, and the CORS allowlist cannot drift from the audience map.
   */
  it('derives deviceAllowedOrigins from the origin map keys', () => {
    const config = getAuthServerConfig({
      DEVICE_ORIGIN_SERVICES: 'https://a.example=svc-a,https://b.example=svc-b',
    } as NodeJS.ProcessEnv);
    expect(config.deviceAllowedOrigins.sort()).toEqual(['https://a.example', 'https://b.example']);
  });

  it('allows no origin at all when the map is unset', () => {
    const config = getAuthServerConfig({} as NodeJS.ProcessEnv);
    expect(config.deviceAllowedOrigins).toEqual([]);
    expect(config.deviceGrantRequiredServices).toEqual([]);
  });

  it('reads the grant-required service list', () => {
    const config = getAuthServerConfig({
      DEVICE_GRANT_REQUIRED_SERVICES: 'mud-builder-server, other-server',
    } as NodeJS.ProcessEnv);
    expect(config.deviceGrantRequiredServices).toEqual(['mud-builder-server', 'other-server']);
  });

  it('surfaces parse warnings for startup logging', () => {
    const config = getAuthServerConfig({ DEVICE_ORIGIN_SERVICES: 'nonsense' } as NodeJS.ProcessEnv);
    expect(config.deviceConfigWarnings).toHaveLength(1);
  });
});
