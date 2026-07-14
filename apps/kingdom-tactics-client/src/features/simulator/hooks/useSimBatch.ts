import { useCallback, useEffect, useRef, useState } from 'react';

import { providers } from '../../../state/providers';
import { runSimBatch, type SimConfig, type SimSummary } from '../sim-runner';

export interface UseSimBatch {
  /** Kick off a batch. Ignored while one is already `running`. */
  readonly run: (config: SimConfig) => void;
  readonly running: boolean;
  /** Matches completed so far in the current/last run. */
  readonly progress: number;
  /** The finished summary, or null until the first run resolves. */
  readonly result: SimSummary | null;
}

/**
 * React wrapper around {@link runSimBatch}: owns running/progress/result state and feeds the
 * shared providers singleton to the runner. A per-run generation ref makes the batch cancelable
 * on unmount (and prevents a stale in-flight run from committing over a newer one).
 */
export function useSimBatch(): UseSimBatch {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SimSummary | null>(null);

  // Bumped on unmount and each new run; a run only commits while its token is current.
  const runIdRef = useRef(0);
  // Mirrors `running` so `run` can guard re-entry without a stale closure.
  const runningRef = useRef(false);
  useEffect(() => () => void (runIdRef.current += 1), []);

  const run = useCallback(
    (config: SimConfig) => {
      if (runningRef.current) return;
      const runId = (runIdRef.current += 1);
      runningRef.current = true;
      setRunning(true);
      setProgress(0);
      setResult(null);

      const cancelled = () => runIdRef.current !== runId;
      void runSimBatch(
        config,
        providers,
        (done) => {
          if (!cancelled()) setProgress(done);
        },
        cancelled,
      )
        .then((summary) => {
          if (cancelled()) return;
          setResult(summary);
        })
        .finally(() => {
          runningRef.current = false;
          if (!cancelled()) setRunning(false);
        });
    },
    [],
  );

  return { run, running, progress, result };
}
