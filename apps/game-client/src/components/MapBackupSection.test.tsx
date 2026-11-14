import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { memoryKvStore } from '../features/autoleveling/autoleveling-idb';
import { createVisitStore } from '../features/worldmap/fog/visits';
import { createLayerStore } from '../features/worldmap/mine/layerStore';
import { describeOutcome, type BackupApi, type BackupOutcome } from '../features/worldmap/sync/backup';
import MapBackupSection from './MapBackupSection';

jest.mock('../features/auth/siteApi', () => ({ siteApiBase: () => 'https://site.test' }));

function makeApi(sync: BackupApi['sync'], erase: BackupApi['erase'] = async () => ({ kind: 'ok', data: undefined })): BackupApi {
  return { sync, erase };
}

function renderSection(api: BackupApi) {
  const kv = memoryKvStore();
  return render(<MapBackupSection world="dsl" visits={createVisitStore(kv)} layers={createLayerStore(kv)} api={api} />);
}

describe('describeOutcome', () => {
  const done = (extra: Partial<Extract<BackupOutcome, { kind: 'done' }>> = {}): BackupOutcome => ({
    kind: 'done',
    explored: 12,
    exploredNew: 0,
    added: 0,
    addedElsewhere: 0,
    ...extra,
  });

  it('reads each outcome in plain words', () => {
    expect(describeOutcome('erased')).toBe('Backup erased from your account. The rooms in this browser are untouched.');
    expect(describeOutcome({ kind: 'signed-out' })).toBe('Sign in to your Shattered Archive account to use the backup.');
    expect(describeOutcome({ kind: 'error', message: 'down' })).toBe('Could not reach your backup: down');
    expect(describeOutcome(done())).toBe('Backed up. Your account has 12 explored rooms.');
  });

  it('counts new rooms and added rooms, singular and plural, and names the ones on other devices', () => {
    expect(describeOutcome(done({ explored: 1, exploredNew: 1 }))).toBe('Backed up. Your account has 1 explored room (1 new here).');
    expect(describeOutcome(done({ added: 1 }))).toBe('Backed up. Your account has 12 explored rooms. 1 room you added.');
    expect(describeOutcome(done({ added: 3, addedElsewhere: 2 }))).toBe(
      'Backed up. Your account has 12 explored rooms. 3 rooms you added, 2 on other devices (their details stay there).',
    );
  });
});

describe('MapBackupSection', () => {
  it('sends nothing until Sync now is pressed, then shows the result', async () => {
    const sync = jest.fn(async () => ({ kind: 'ok' as const, data: { version: 1 as const, worlds: { dsl: { visited: { A: ['r1', 'r2'] }, added: [] } } } }));
    renderSection(makeApi(sync));
    expect(sync).not.toHaveBeenCalled();
    expect(screen.queryByTestId('map-backup-result')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(screen.getByTestId('map-backup-result')).toHaveTextContent('Backed up. Your account has 2 explored rooms (2 new here).'));
    expect(sync).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeEnabled();
  });

  it('disables both buttons while a sync runs', async () => {
    let release: (value: Awaited<ReturnType<BackupApi['sync']>>) => void = () => undefined;
    renderSection(makeApi(() => new Promise((resolve) => (release = resolve))));
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    const working = await screen.findByRole('button', { name: 'Working…' });
    expect(working).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Erase my backup…' })).toBeDisabled();
    release({ kind: 'unauthenticated' });
    await waitFor(() => expect(screen.getByTestId('map-backup-result')).toHaveTextContent('Sign in to your Shattered Archive account'));
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeEnabled();
  });

  it('asks before erasing, and Keep it leaves the backup alone', async () => {
    const erase = jest.fn(async () => ({ kind: 'ok' as const, data: undefined }));
    renderSection(makeApi(async () => ({ kind: 'unauthenticated' }), erase));
    fireEvent.click(screen.getByRole('button', { name: 'Erase my backup…' }));
    expect(screen.getByText(/Erase your account.s copy\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(erase).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Erase my backup…' })).toBeInTheDocument();
  });

  it('erases after the confirmation and says so', async () => {
    const erase = jest.fn(async () => ({ kind: 'ok' as const, data: undefined }));
    renderSection(makeApi(async () => ({ kind: 'unauthenticated' }), erase));
    fireEvent.click(screen.getByRole('button', { name: 'Erase my backup…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, erase it' }));
    await waitFor(() => expect(screen.getByTestId('map-backup-result')).toHaveTextContent('Backup erased from your account.'));
    expect(erase).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Yes, erase it' })).toBeNull();
  });

  it('shows a site refusal, and an unexpected throw, as a message rather than a crash', async () => {
    const refused = renderSection(makeApi(async () => ({ kind: 'error', message: 'too many rooms' })));
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(screen.getByTestId('map-backup-result')).toHaveTextContent('Could not reach your backup: too many rooms'));
    refused.unmount();

    renderSection(
      makeApi(async () => {
        throw new Error('boom');
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(screen.getByTestId('map-backup-result')).toHaveTextContent('Could not reach your backup: boom'));
  });

  it('a throw that is not an Error still reads as a failure', async () => {
    renderSection(
      makeApi(async () => {
        throw 'plain text';
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(screen.getByTestId('map-backup-result')).toHaveTextContent('unexpected failure'));
  });

  it('uses the shared stores when none are given (sign-in missing: nothing is sent)', async () => {
    render(<MapBackupSection world="dsl" />);
    fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(screen.getByTestId('map-backup-result')).toHaveTextContent('Sign in to your Shattered Archive account'));
  });
});
