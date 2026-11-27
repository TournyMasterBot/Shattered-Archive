// apps/game-client/src/components/MapBackupSection.tsx
//
// The "Cloud backup" part of the map window's gear popover: the player's own backup of the rooms they explored and added, on their Shattered Archive
// account. Nothing is sent until they press Sync now; Erase removes the account's copy (their browser's record stays). The logic is in
// features/worldmap/sync/backup.ts; this only asks, shows the result and keeps the two buttons from being pressed twice at once.

import React from 'react';
import styles from '../styles/WorldMapWindow.module.scss';
import { describeOutcome, eraseBackup, syncBackup, type BackupApi, type BackupOutcome } from '../features/worldmap/sync/backup';
import { sharedLayerStore, sharedVisitStore } from '../features/worldmap/mine/shared';
import type { LayerStore } from '../features/worldmap/mine/layerStore';
import type { VisitStore } from '../features/worldmap/fog/visits';

export interface MapBackupSectionProps {
  world: string;
  /** Tests give their own; the page uses the shared stores and the site. */
  visits?: VisitStore;
  layers?: LayerStore;
  api?: BackupApi;
}

const MapBackupSection: React.FC<MapBackupSectionProps> = ({ world, visits, layers, api }) => {
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);

  const run = async (job: () => Promise<BackupOutcome | 'erased'>): Promise<void> => {
    setBusy(true);
    setConfirming(false);
    try {
      setResult(describeOutcome(await job()));
    } catch (error) {
      setResult(describeOutcome({ kind: 'error', message: error instanceof Error ? error.message : 'unexpected failure' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset className={styles.backup}>
      <legend>Cloud backup</legend>
      <p className={styles.backupNote}>
        Keeps the ids of the rooms you explored and added on your account, so your other devices can bring them in. Nothing is sent until you press
        Sync now.
      </p>
      <button
        type="button"
        className={styles.menuAction}
        disabled={busy}
        onClick={() => void run(() => syncBackup({ world, visits: visits ?? sharedVisitStore(), layers: layers ?? sharedLayerStore(), api }))}
      >
        {busy ? 'Working…' : 'Sync now'}
      </button>
      {confirming ? (
        <>
          <p className={styles.backupNote}>Erase your account&apos;s copy? Your browser keeps its own.</p>
          <button type="button" className={styles.menuAction} disabled={busy} onClick={() => void run(() => eraseBackup(api))}>
            Yes, erase it
          </button>
          <button type="button" className={styles.menuAction} disabled={busy} onClick={() => setConfirming(false)}>
            Keep it
          </button>
        </>
      ) : (
        <button type="button" className={styles.menuAction} disabled={busy} onClick={() => setConfirming(true)}>
          Erase my backup…
        </button>
      )}
      {result !== null && (
        <p className={styles.backupResult} aria-live="polite" data-testid="map-backup-result">
          {result}
        </p>
      )}
    </fieldset>
  );
};

export default MapBackupSection;
