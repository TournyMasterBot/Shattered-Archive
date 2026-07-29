import { renderHook, act, waitFor } from '@testing-library/react';

import { useAccountScreen } from './useAccountScreen';
import * as authTokenStore from './authTokenStore';
import * as cloudSync from './cloudSync';
import * as savedArmies from '../../state/saved-armies';

jest.mock('./authTokenStore');
jest.mock('./cloudSync');
jest.mock('./ktSso', () => ({ startLogin: jest.fn() }));
jest.mock('../../state/saved-armies');

const mockedTokenStore = jest.mocked(authTokenStore);
const mockedCloudSync = jest.mocked(cloudSync);
const mockedSavedArmies = jest.mocked(savedArmies);

const VALID_TOKEN = { token: 'tok-1', expiresAt: '2099-01-01T00:00:00.000Z' };

beforeEach(() => {
  jest.clearAllMocks();
  mockedTokenStore.isExpired.mockReturnValue(false);
});

describe('useAccountScreen', () => {
  it('starts logged out when there is no stored token', () => {
    mockedTokenStore.getToken.mockReturnValue(null);
    const { result } = renderHook(() => useAccountScreen());
    expect(result.current.isLoggedIn).toBe(false);
    expect(mockedCloudSync.loadMatchHistory).not.toHaveBeenCalled();
  });

  it('starts logged in and fetches history when a valid token is stored', async () => {
    mockedTokenStore.getToken.mockReturnValue(VALID_TOKEN);
    mockedCloudSync.loadMatchHistory.mockResolvedValue({
      kind: 'ok',
      data: [{ id: 'h1', matchId: 'm1', playedAt: '2026-07-28T00:00:00.000Z', participants: [], winner: 0 }],
    });
    const { result } = renderHook(() => useAccountScreen());
    expect(result.current.isLoggedIn).toBe(true);
    await waitFor(() => expect(result.current.history).toHaveLength(1));
  });

  it('handleViewReplay sets replaySnapshots on success', async () => {
    mockedTokenStore.getToken.mockReturnValue(VALID_TOKEN);
    mockedCloudSync.loadMatchHistory.mockResolvedValue({ kind: 'ok', data: [] });
    const snapshot = { turn: 1, status: 'decided', winner: 0 } as never;
    mockedCloudSync.loadReplay.mockResolvedValue({ kind: 'ok', data: { matchId: 'm1', snapshots: [snapshot] } });

    const { result } = renderHook(() => useAccountScreen());
    await act(async () => {
      await result.current.handleViewReplay('h1');
    });

    expect(result.current.replaySnapshots).toEqual([snapshot]);
    expect(result.current.replayStep).toBe(0);
  });

  it('handleViewReplay with an EMPTY snapshot list sets an error status instead of rendering nothing', async () => {
    mockedTokenStore.getToken.mockReturnValue(VALID_TOKEN);
    mockedCloudSync.loadMatchHistory.mockResolvedValue({ kind: 'ok', data: [] });
    mockedCloudSync.loadReplay.mockResolvedValue({ kind: 'ok', data: { matchId: 'm1', snapshots: [] } });

    const { result } = renderHook(() => useAccountScreen());
    await act(async () => {
      await result.current.handleViewReplay('h1');
    });

    expect(result.current.replaySnapshots).toBeNull();
    expect(result.current.status).toEqual({ kind: 'err', text: 'This match has no recorded replay data.' });
  });

  it('handleViewReplay on 401 logs the user out locally with a clear message', async () => {
    mockedTokenStore.getToken.mockReturnValue(VALID_TOKEN);
    mockedCloudSync.loadMatchHistory.mockResolvedValue({ kind: 'ok', data: [] });
    mockedCloudSync.loadReplay.mockResolvedValue({ kind: 'unauthenticated' });

    const { result } = renderHook(() => useAccountScreen());
    await act(async () => {
      await result.current.handleViewReplay('h1');
    });

    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.status?.kind).toBe('err');
  });

  it('handleLoadArmiesFromCloud replaces local armies only after confirm, and skips entirely when cancelled', async () => {
    mockedTokenStore.getToken.mockReturnValue(VALID_TOKEN);
    mockedCloudSync.loadMatchHistory.mockResolvedValue({ kind: 'ok', data: [] });
    mockedCloudSync.loadArmyLayouts.mockResolvedValue({ kind: 'ok', data: [{ name: 'cloud army', picks: [] }] });
    const confirmSpy = jest.spyOn(window, 'confirm');

    const { result } = renderHook(() => useAccountScreen());

    confirmSpy.mockReturnValueOnce(false);
    await act(async () => {
      await result.current.handleLoadArmiesFromCloud();
    });
    expect(mockedSavedArmies.replaceAllArmies).not.toHaveBeenCalled();

    confirmSpy.mockReturnValueOnce(true);
    await act(async () => {
      await result.current.handleLoadArmiesFromCloud();
    });
    expect(mockedSavedArmies.replaceAllArmies).toHaveBeenCalledWith([{ name: 'cloud army', picks: [] }]);

    confirmSpy.mockRestore();
  });
});
