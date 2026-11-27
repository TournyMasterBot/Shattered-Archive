// The auto-leveling calls of cloudSync: the route, the method, the bearer token, the body, and how a 401, the server's refusal text
// (for example an unknown record kind) and a network failure come back. The cap constant mirrors the server's.
import { AUTOLEVEL_MAX_RECORDS, loadAutolevelUserData, saveAutolevelUserData } from './cloudSync';
import type { UserRecord } from '../autoleveling/autoleveling-user-data';

jest.mock('./siteApi', () => ({ siteApiBase: () => 'https://site.test' }));

const getToken = jest.fn();
const clearToken = jest.fn();
jest.mock('./authTokenStore', () => ({ getToken: () => getToken(), clearToken: () => clearToken() }));

const records: UserRecord[] = [
  { id: 'targetOverride:a:k', kind: 'targetOverride', areaSlug: 'a', data: { key: 'k', hidden: true }, updatedAt: 5 },
  { id: 'abilityTiming:bash', kind: 'abilityTiming', data: { cooldownSec: 2 }, updatedAt: 6 },
];

function answer(status: number, body?: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response;
}

let fetchMock: jest.Mock;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  getToken.mockReset();
  clearToken.mockReset();
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('AUTOLEVEL_MAX_RECORDS', () => {
  it('matches the server cap (UserContentController.MaxAutolevelRecords)', () => {
    expect(AUTOLEVEL_MAX_RECORDS).toBe(1000);
  });
});

describe('saveAutolevelUserData', () => {
  it('PUTs the whole collection to the auto-leveling route with the bearer token', async () => {
    getToken.mockReturnValue({ token: 'tok-1' });
    fetchMock.mockResolvedValue(answer(200, { count: 2 }));

    const result = await saveAutolevelUserData(records);

    expect(result).toEqual({ kind: 'ok', data: { count: 2 } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://site.test/api/user-content/autoleveling');
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer tok-1' });
    expect(JSON.parse(init.body as string)).toEqual(records);
  });

  it('sends nothing without a sign-in token', async () => {
    getToken.mockReturnValue(null);
    expect(await saveAutolevelUserData(records)).toEqual({ kind: 'unauthenticated' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears the stored token on a 401', async () => {
    getToken.mockReturnValue({ token: 'tok-1' });
    fetchMock.mockResolvedValue(answer(401));
    expect(await saveAutolevelUserData(records)).toEqual({ kind: 'unauthenticated' });
    expect(clearToken).toHaveBeenCalledTimes(1);
  });

  it("returns the server's refusal text, such as an unknown record kind (E20)", async () => {
    getToken.mockReturnValue({ token: 'tok-1' });
    fetchMock.mockResolvedValue(answer(400, { error: "item[0]: 'kind' must be one of target,buff,fight,path,pref,abilityTiming,targetOverride" }));
    expect(await saveAutolevelUserData(records)).toEqual({
      kind: 'error',
      message: "item[0]: 'kind' must be one of target,buff,fight,path,pref,abilityTiming,targetOverride",
    });
  });

  it('falls back to a generic message when the refusal has no JSON body', async () => {
    getToken.mockReturnValue({ token: 'tok-1' });
    fetchMock.mockResolvedValue({ status: 502, ok: false, json: async () => Promise.reject(new Error('html')) } as unknown as Response);
    expect(await saveAutolevelUserData(records)).toEqual({ kind: 'error', message: 'request failed (502)' });
  });

  it('reports a network failure without throwing', async () => {
    getToken.mockReturnValue({ token: 'tok-1' });
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await saveAutolevelUserData(records)).toEqual({ kind: 'error', message: 'offline' });
  });
});

describe('loadAutolevelUserData', () => {
  it('GETs the auto-leveling route with the bearer token and returns the records', async () => {
    getToken.mockReturnValue({ token: 'tok-2' });
    fetchMock.mockResolvedValue(answer(200, records));

    const result = await loadAutolevelUserData();

    expect(result).toEqual({ kind: 'ok', data: records });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://site.test/api/user-content/autoleveling');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-2');
    expect(init.method).toBeUndefined();
  });

  it('is unauthenticated without a token and on a 401', async () => {
    getToken.mockReturnValue(null);
    expect(await loadAutolevelUserData()).toEqual({ kind: 'unauthenticated' });
    getToken.mockReturnValue({ token: 't' });
    fetchMock.mockResolvedValue(answer(401));
    expect(await loadAutolevelUserData()).toEqual({ kind: 'unauthenticated' });
  });
});
