import { canonicalConnectionId, connectionIdForHost } from './connectionId';

describe('canonicalConnectionId', () => {
  it('folds empty, whitespace and nullish ids into dsl-mud', () => {
    expect(canonicalConnectionId(undefined)).toBe('dsl-mud');
    expect(canonicalConnectionId(null)).toBe('dsl-mud');
    expect(canonicalConnectionId('')).toBe('dsl-mud');
    expect(canonicalConnectionId('   ')).toBe('dsl-mud');
  });

  it('folds the legacy not-connected id default into dsl-mud, trimmed', () => {
    expect(canonicalConnectionId('default')).toBe('dsl-mud');
    expect(canonicalConnectionId('  default ')).toBe('dsl-mud');
  });

  it('leaves dsl-mud as it is', () => {
    expect(canonicalConnectionId('dsl-mud')).toBe('dsl-mud');
  });

  it('keeps custom server ids and trims them', () => {
    expect(canonicalConnectionId('mud.example.com:4000')).toBe('mud.example.com:4000');
    expect(canonicalConnectionId(' mud.example.com:4000 ')).toBe('mud.example.com:4000');
  });
});

describe('connectionIdForHost', () => {
  it('is dsl-mud when not connected, so disconnected and connected share one bucket', () => {
    expect(connectionIdForHost(undefined, undefined)).toBe('dsl-mud');
    expect(connectionIdForHost('dsl-mud.org', undefined)).toBe('dsl-mud');
    expect(connectionIdForHost('', 4000)).toBe('dsl-mud');
  });

  it('is dsl-mud for the DSL game', () => {
    expect(connectionIdForHost('dsl-mud.org', 4000)).toBe('dsl-mud');
  });

  it('keeps host:port for a custom server', () => {
    expect(connectionIdForHost('mud.example.com', 4000)).toBe('mud.example.com:4000');
  });
});
