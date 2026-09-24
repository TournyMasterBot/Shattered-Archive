import { useEffect, useId, useState } from 'react';
import { ListenEvent } from '../features/event-emitter/event-dispatcher';

type WorldTimeSnapshot = {
  period?: string;
  updatedAt?: number;
};

function readSnapshot(): string | null {
  const snapshot = (window as any).__SA_WORLD_TIME__ as WorldTimeSnapshot | undefined;
  return snapshot?.period ?? null;
}

export function useWorldTimePeriod(): { period: string | null } {
  const instanceId = useId();
  const [period, setPeriod] = useState<string | null>(() => readSnapshot());

  useEffect(() => {
    return ListenEvent<WorldTimeSnapshot>(
      'shatteredarchive:world-time-updated',
      (payload) => {
        setPeriod(payload.period ?? null);
      },
      { key: `useWorldTimePeriod::world-time-updated::${instanceId}` },
    );
  }, [instanceId]);

  return { period };
}
