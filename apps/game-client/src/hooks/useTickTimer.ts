import { useTickData } from './useTickData';

/**
 * Convenience wrapper when you only care about the countdown number,
 * not the time-of-day string.
 */
export function useTickTimer(durationSec: number) {
  const { remaining } = useTickData(durationSec);
  return { remaining };
}
