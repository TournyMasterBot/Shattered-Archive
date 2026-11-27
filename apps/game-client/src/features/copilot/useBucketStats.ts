import { useEffect, useState } from 'react';
import type { BucketTable } from '@shatteredarchive/copilot-core';
import type { CopilotApi } from './api';

export interface BucketStatsView {
  /** The owner's answers per bucket (the last good table). Empty until the first answer. */
  table: BucketTable;
  /** `null` until the first answer; false once the server answered; true when the last poll failed (the table is then the last good one). */
  stale: boolean | null;
}

/**
 * The owner's history per (sphere, kind), polled while mounted. A poll is scheduled only after the previous one answered and each is
 * aborted on unmount, like the suggestion list. A failed poll keeps the last table and marks it stale.
 */
export function useBucketStats(api: CopilotApi, intervalMs = 10_000): BucketStatsView {
  const [view, setView] = useState<BucketStatsView>({ table: {}, stale: null });

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async (): Promise<void> => {
      const result = await api.getBucketStats(controller.signal);
      if (controller.signal.aborted) return;
      setView((current) => (result.ok ? { table: result.value, stale: false } : { table: current.table, stale: true }));
      timer = setTimeout(() => void poll(), intervalMs);
    };
    void poll();

    return () => {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [api, intervalMs]);

  return view;
}
