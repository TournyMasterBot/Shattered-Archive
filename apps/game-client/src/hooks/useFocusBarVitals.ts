// apps/game-client/src/hooks/useFocusBarVitals.ts
import { useTickTimer, useVitalsState } from '../hooks/useRightPaneHud';

export function useFocusBarVitals(tickSeconds = 41) {
  const { remaining } = useTickTimer(tickSeconds);
  const vitals = useVitalsState();

  const pct = (value: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0);

  const hpPct = pct(vitals.hp, vitals.hpMax);
  const mpPct = pct(vitals.mp, vitals.mpMax);
  const staPct = pct(vitals.stamina, vitals.staminaMax);

  return {
    remaining,
    vitals,
    hpPct,
    mpPct,
    staPct,
  };
}
