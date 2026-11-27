// The map backup calls of cloudSync: the route, the method, the bearer token, and how a 401, a refusal and a network failure come back.
import { deleteMapVisitsCloud, syncMapVisitsCloud } from './cloudSync';
import type { MapBackupDocument } from '../worldmap/sync/backup';

jest.mock('./siteApi', () => ({ siteApiBase: () => 'https://site.test' }));

const getToken = jest.fn();
const clearToken = jest.fn();
jest.mock('./authTokenStore', () => ({ getToken: () => getToken(), clearToken: () => clearToken() }));

const doc: MapBackupDocument = { version: 1, worlds: { dsl: { visited: { A: ['r1'] }, added: [] } } };

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

describe('syncMapVisitsCloud', () => {
  it('POSTs the document to the sync route with the bearer token and returns the merged document', async () => {
    getToken.mockReturnValue({ token: 'tok-1' });
    const merged = { version: 1, worlds: { dsl: { visited: { A: ['r1', 'r2'] }, added: [] } } };
    fetchMock.mockResolvedValue(answer(200, merged));

    const result = await syncMapVisitsCloud(doc);

    expect(result).toEqual({ kind: 'ok', data: merged });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://site.test/api/user-content/map-visits/sync');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer tok-1' });
    expect(JSON.parse(init.body as string)).toEqual(doc);
  });

  it('sends nothing without a sign-in token', async () => {
    getToken.mockReturnValue(null);
    expect(await syncMapVisitsCloud(doc)).toEqual({ kind: 'unauthenticated' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a 401 clears the stored token and reads as unauthenticated', async () => {
    getToken.mockReturnValue({ token: 'expired' });
    fetchMock.mockResolvedValue(answer(401));
    expect(await syncMapVisitsCloud(doc)).toEqual({ kind: 'unauthenticated' });
    expect(clearToken).toHaveBeenCalledTimes(1);
  });

  it('keeps the site’s own refusal text (a body over a cap, a bad id)', async () => {
    getToken.mockReturnValue({ token: 'tok-1' });
    fetchMock.mockResolvedValue(answer(400, { error: "world 'dsl': added: 'X' is not a room id" }));
    expect(await syncMapVisitsCloud(doc)).toEqual({ kind: 'error', message: "world 'dsl': added: 'X' is not a room id" });
  });

  it('falls back to a generic message when the refusal has no readable body, and to the network error text when the call fails', async () => {
    getToken.mockReturnValue({ token: 'tok-1' });
    fetchMock.mockResolvedValueOnce({ status: 500, ok: false, json: async () => { throw new Error('not json'); } } as unknown as Response);
    expect(await syncMapVisitsCloud(doc)).toEqual({ kind: 'error', message: 'request failed (500)' });
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await syncMapVisitsCloud(doc)).toEqual({ kind: 'error', message: 'offline' });
    fetchMock.mockRejectedValueOnce('plain');
    expect(await syncMapVisitsCloud(doc)).toEqual({ kind: 'error', message: 'network error' });
  });
});

describe('deleteMapVisitsCloud', () => {
  it('DELETEs the backup route with the bearer token; 204 is ok with no data', async () => {
    getToken.mockReturnValue({ token: 'tok-1' });
    fetchMock.mockResolvedValue(answer(204));
    expect(await deleteMapVisitsCloud()).toEqual({ kind: 'ok', data: undefined });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://site.test/api/user-content/map-visits');
    expect(init.method).toBe('DELETE');
    expect(init.headers).toEqual({ Authorization: 'Bearer tok-1' });
  });

  it('signed out: nothing is sent', async () => {
    getToken.mockReturnValue(null);
    expect(await deleteMapVisitsCloud()).toEqual({ kind: 'unauthenticated' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
