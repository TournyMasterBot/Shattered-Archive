// apps/game-client/src/hooks/useCharData.ts
import { useEffect, useState } from 'react';

export interface CharDataVitals {
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
  stamina: number;
  staminaMax: number;
}

export interface CharDataAncillary {
  carryWeight: number | null;
  carryWeightMax: number | null;
  carryWeightPct: number | null;
  isQuiet: boolean;
  isFlying: boolean;
  isRiding: boolean;
  isFighting: boolean;
  language: string | null;
}

const defaultVitals: CharDataVitals = {
  hp: 0,
  hpMax: 0,
  mp: 0,
  mpMax: 0,
  stamina: 0,
  staminaMax: 0,
};

const defaultAncillary: CharDataAncillary = {
  carryWeight: null,
  carryWeightMax: null,
  carryWeightPct: null,
  isQuiet: false,
  isFlying: false,
  isRiding: false,
  isFighting: false,
  language: null,
};

export function useCharData() {
  const [vitals, setVitals] = useState<CharDataVitals>(defaultVitals);
  const [ancillary, setAncillary] = useState<CharDataAncillary>(defaultAncillary);

  useEffect(() => {
    const handler = (ev: Event) => {
      const custom = ev as CustomEvent<any>;
      const data = custom.detail || {};

      const hp = Number(data.hp ?? 0);
      const maxHp = Number(data.max_hp ?? 0);
      const mana = Number(data.mana ?? 0);
      const maxMana = Number(data.max_mana ?? 0);
      const move = Number(data.move ?? 0);
      const maxMove = Number(data.max_move ?? 0);

      const carryWeightRaw = Number(data.carry_weight ?? NaN);
      const canCarryWeightRaw = Number(data.can_carry_weight ?? NaN);

      const hasCarry = Number.isFinite(carryWeightRaw);
      const hasCarryMax = Number.isFinite(canCarryWeightRaw) && canCarryWeightRaw > 0;

      const carryWeight = hasCarry ? carryWeightRaw : null;
      const carryWeightMax = hasCarryMax ? canCarryWeightRaw : null;

      const carryWeightPct =
        hasCarry && hasCarryMax ? Math.max(0, Math.min(100, (carryWeightRaw / canCarryWeightRaw) * 100)) : null;

      setVitals({
        hp,
        hpMax: maxHp,
        mp: mana,
        mpMax: maxMana,
        stamina: move,
        staminaMax: maxMove,
      });

      setAncillary({
        carryWeight, // 👈 NEW
        carryWeightMax, // 👈 NEW
        carryWeightPct,
        isQuiet: !!data.is_quiet,
        isFlying: !!data.is_flying,
        isRiding: !!data.is_riding,
        isFighting: !!data.is_fighting,
        language: typeof data.language === 'string' ? data.language : null,
      });
    };

    window.addEventListener('game:char-data', handler as EventListener);
    return () => window.removeEventListener('game:char-data', handler as EventListener);
  }, []);

  return { vitals, ancillary };
}
