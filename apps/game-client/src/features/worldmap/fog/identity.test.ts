// Whose exploration it is: the account the sign-in token names (when it names one), the character the game last named.
import { accountKeyOf, characterNameNow, currentScope, LOCAL_ACCOUNT } from './identity';

const b64url = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');

afterEach(() => {
  window.localStorage.clear();
  delete (window as unknown as { __SA_IDENTITY__?: unknown }).__SA_IDENTITY__;
});

describe('accountKeyOf', () => {
  it('is the account id in the payload of a three-part JWT', () => {
    expect(accountKeyOf(`${b64url({ alg: 'none' })}.${b64url({ sub: 'acct-7' })}.sig`)).toBe('acct-7');
  });

  it('is the account id in the first part of the site payload.signature form, under any of the known names', () => {
    expect(accountKeyOf(`${b64url({ accountId: 'a1' })}.sig`)).toBe('a1');
    expect(accountKeyOf(`${b64url({ account: ' a2 ' })}.sig`)).toBe('a2');
    expect(accountKeyOf(`${b64url({ uid: 'a3' })}.sig`)).toBe('a3');
  });

  it('is "local" for no token, an opaque token, a payload with no account id, or one that is not JSON', () => {
    expect(accountKeyOf(null)).toBe(LOCAL_ACCOUNT);
    expect(accountKeyOf(undefined)).toBe(LOCAL_ACCOUNT);
    expect(accountKeyOf('')).toBe(LOCAL_ACCOUNT);
    expect(accountKeyOf('kF3p9QxLm2Zw')).toBe(LOCAL_ACCOUNT);
    expect(accountKeyOf(`${b64url({ aud: 'game' })}.sig`)).toBe(LOCAL_ACCOUNT);
    expect(accountKeyOf(`${b64url({ sub: '  ' })}.sig`)).toBe(LOCAL_ACCOUNT);
    expect(accountKeyOf(`${b64url([1, 2])}.sig`)).toBe(LOCAL_ACCOUNT);
    expect(accountKeyOf(`${b64url('text')}.sig`)).toBe(LOCAL_ACCOUNT);
    expect(accountKeyOf('%%%.***')).toBe(LOCAL_ACCOUNT);
  });

  it('keeps a long id to 120 characters', () => {
    expect(accountKeyOf(`${b64url({ sub: 'x'.repeat(300) })}.sig`)).toHaveLength(120);
  });
});

describe('characterNameNow and currentScope', () => {
  it('is empty until the game names the character, then the name', () => {
    expect(characterNameNow()).toBe('');
    (window as unknown as { __SA_IDENTITY__: unknown }).__SA_IDENTITY__ = { characterName: '  Aldric-M  ' };
    expect(characterNameNow()).toBe('Aldric-M');
    (window as unknown as { __SA_IDENTITY__: unknown }).__SA_IDENTITY__ = { characterName: 5 };
    expect(characterNameNow()).toBe('');
  });

  it('combines the world, the account of the stored token and the character', () => {
    window.localStorage.setItem('shatteredArchive.auth.token', JSON.stringify({ token: `${b64url({ sub: 'acct-9' })}.sig`, expiresAt: '2099-01-01T00:00:00Z' }));
    (window as unknown as { __SA_IDENTITY__: unknown }).__SA_IDENTITY__ = { characterName: 'Mira-F' };
    expect(currentScope('dsl')).toEqual({ world: 'dsl', account: 'acct-9', character: 'Mira-F' });
  });

  it('is the local account with no character when nobody is signed in and nothing is named', () => {
    expect(currentScope('sandbox')).toEqual({ world: 'sandbox', account: 'local', character: '' });
  });
});
