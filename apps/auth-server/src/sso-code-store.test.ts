import { SsoCodeStore } from './sso-code-store.js';

describe('SsoCodeStore', () => {
  let clock: number;
  let store: SsoCodeStore;

  beforeEach(() => {
    clock = 1_000_000;
    store = new SsoCodeStore(() => clock);
  });

  it('issues a code redeemable exactly once with matching bindings', () => {
    const code = store.issue('acct-1', 'svc-a', 'https://a.example/cb');
    expect(store.redeem(code, 'svc-a', 'https://a.example/cb')).toEqual({ accountId: 'acct-1' });
    expect(store.redeem(code, 'svc-a', 'https://a.example/cb')).toBeNull(); // single-use
  });

  it('a mismatched service BURNS the code — the correct redeem no longer works afterward', () => {
    const code = store.issue('acct-1', 'svc-a', 'https://a.example/cb');
    expect(store.redeem(code, 'svc-b', 'https://a.example/cb')).toBeNull();
    expect(store.redeem(code, 'svc-a', 'https://a.example/cb')).toBeNull();
  });

  it('a mismatched redirect URI is rejected (exact match only)', () => {
    const code = store.issue('acct-1', 'svc-a', 'https://a.example/cb');
    expect(store.redeem(code, 'svc-a', 'https://a.example/cb/extra')).toBeNull();
  });

  it('codes expire after 60 seconds', () => {
    const code = store.issue('acct-1', 'svc-a', 'https://a.example/cb');
    clock += 59_000;
    const stillFresh = store.issue('acct-2', 'svc-a', 'https://a.example/cb');
    clock += 2_000; // first code now 61s old, second 2s old
    expect(store.redeem(code, 'svc-a', 'https://a.example/cb')).toBeNull();
    expect(store.redeem(stillFresh, 'svc-a', 'https://a.example/cb')).toEqual({ accountId: 'acct-2' });
  });

  it('an unknown code is rejected', () => {
    expect(store.redeem('never-issued', 'svc-a', 'https://a.example/cb')).toBeNull();
  });
});
